package com.juanbagu.rutinafoto

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.BadRequestException
import com.anthropic.errors.PermissionDeniedException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.models.messages.Base64ImageSource
import com.anthropic.models.messages.ContentBlockParam
import com.anthropic.models.messages.ImageBlockParam
import com.anthropic.models.messages.JsonOutputFormat
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.StopReason
import com.anthropic.models.messages.TextBlockParam
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/** Lee una foto de pizarra o una captura y la convierte en rutina con Claude. */
object RoutineReader {
    const val MODEL = "claude-opus-5-5"

    private val SYSTEM = """
        Pasas a limpio entrenamientos a partir de una foto: pizarra del box o del gimnasio, papel escrito a mano
        o captura de otra app. Los entrenamientos suelen ser HÍBRIDOS: carrera, remo, SkiErg, bici de aire
        (Assault/Echo), trineo (sled push/pull), burpee broad jumps, farmers carry, sandbag lunges, wall balls,
        dominadas, halterofilia (snatch, clean & jerk, power clean, thrusters), kettlebell, gimnásticos, y también
        fuerza clásica (series × repeticiones).

        Organiza el entreno en BLOQUES, en el orden en que se hacen:
        - "sets": fuerza clásica, series × repeticiones con descanso (p. ej. "Back squat 5x5 100kg").
        - "rounds": N rondas seguidas de los ejercicios del bloque (p. ej. "4 rondas:"). rounds = N.
        - "fortime": por tiempo. Incluye Hyrox y simulaciones, "RFT", "For time", esquemas tipo 21-15-9
          (rounds = número de rondas y scheme = "21-15-9"; deja reps vacío en los ejercicios que siguen el esquema).
          capS = time cap en segundos si lo hay.
        - "amrap": AMRAP de X minutos → capS = X*60. Los ejercicios del bloque se repiten en bucle.
        - "emom": EMOM / E2MOM / "cada X' x N" → everyS = segundos de cada intervalo, capS = duración total en segundos.
          Cada ejercicio del bloque ocupa un intervalo, en orden.
        Cada ejercicio indica en "block" el índice (desde 0) del bloque al que pertenece.

        Cada ejercicio:
        - name: como está escrito, sin abreviaturas raras: WB → Wall balls, BBJ → Burpee broad jumps,
          SBL → Sandbag lunges, FC → Farmers carry, T2B → Toes to bar, C2B → Chest to bar, HSPU → Handstand push-ups,
          DU → Double unders, Ski → SkiErg, Row → Remo, Run → Carrera, AB/Assault/Echo → Air bike.
        - reps: la META como texto: repeticiones "15", rango "8-10", "max", distancia en metros "1000 m"
          (1 km = "1000 m"), calorías "20 cal", tiempo en segundos "45s" (1:00 = "60s").
          Si hay dos cifras hombre/mujer (p. ej. "20/15 cal"), usa la primera.
        - sets: número de series (fuerza) o repeticiones de ese ejercicio dentro del bloque; si no se indica, 1.
        - weight: peso con unidad tal como aparece ("60 kg", "2×24 kg" para dos kettlebells/mancuernas, "6/4 kg"
          si da peso masculino/femenino, "152 kg" del trineo). Vacío si no hay.
        - rest: descanso entre series en segundos (solo fuerza), o null.
        - note: algo importante que no encaja (p. ej. "superserie con el siguiente", "por pierna", "sin soltar"), o vacío.
        En bloques "rounds"/"fortime" el descanso entre rondas va en restS del bloque.

        Una simulación Hyrox estándar es un bloque "fortime" con 8 × (1000 m de carrera + estación) en este orden:
        SkiErg 1000 m, Sled push 50 m, Sled pull 50 m, Burpee broad jumps 80 m, Remo 1000 m, Farmers carry 200 m,
        Sandbag lunges 100 m, Wall balls 100. Si la foto pone algo como "8 × (1 km run + estación)", despliégalo así.

        name de la rutina: el título de la foto o uno corto que la describa.
        warnings: lo que no se lee bien o lo que has tenido que suponer. Vacío si todo está claro.
        No inventes ejercicios que no estén en la imagen (salvo desplegar una notación como la de Hyrox).
    """.trimIndent()

    /** offline = leído en el móvil sin IA; rawText = el texto reconocido (para depurar). */
    data class Result(val routine: Routine, val warnings: List<String>, val offline: Boolean = false, val rawText: String = "")

    fun read(ctx: Context, apiKey: String, image: Uri): Result {
        require(apiKey.isNotBlank()) { "Falta la clave de la API (Ajustes)" }
        val jpeg = try {
            loadScaledJpeg(ctx, image)
        } finally {
            // La foto hecha con la cámara de la app se borra en cuanto se ha leído.
            if (image.authority == "${ctx.packageName}.fotos") runCatching { ctx.contentResolver.delete(image, null, null) }
        }
        val client = AnthropicOkHttpClient.builder().apiKey(apiKey).build()
        try {
            val params = MessageCreateParams.builder()
                .model(MODEL)
                .maxTokens(16000L)
                .system(SYSTEM)
                .outputConfig(
                    OutputConfig.builder()
                        .effort(OutputConfig.Effort.MEDIUM)
                        .format(JsonOutputFormat.builder().schema(schema()).build())
                        .build()
                )
                // Si el modelo rechaza la petición, el servidor la reintenta con otro modelo.
                .putAdditionalHeader("anthropic-beta", "server-side-fallback-2026-07-01")
                .putAdditionalBodyProperty("fallbacks", JsonValue.from("default"))
                .addUserMessageOfContentBlockParams(
                    listOf(
                        ContentBlockParam.ofImage(
                            ImageBlockParam.builder()
                                .source(
                                    Base64ImageSource.builder()
                                        .mediaType(Base64ImageSource.MediaType.IMAGE_JPEG)
                                        .data(Base64.encodeToString(jpeg, Base64.NO_WRAP))
                                        .build()
                                )
                                .build()
                        ),
                        ContentBlockParam.ofText(
                            TextBlockParam.builder().text("Pasa esta rutina a limpio.").build()
                        ),
                    )
                )
                .build()

            val msg = try {
                client.messages().create(params)
            } catch (e: UnauthorizedException) {
                error("La clave de la API no es válida. Revísala en Ajustes.")
            } catch (e: PermissionDeniedException) {
                error("Tu clave no tiene permiso para este modelo.")
            } catch (e: RateLimitException) {
                error("Demasiadas peticiones seguidas. Espera un minuto y vuelve a probar.")
            } catch (e: BadRequestException) {
                error("La API rechazó la petición (¿sin saldo o imagen no válida?).")
            } catch (e: AnthropicServiceException) {
                error("El servicio de IA ha fallado (${e.statusCode()}). Prueba otra vez.")
            } catch (e: AnthropicIoException) {
                error("Sin conexión a internet.")
            }
            val stop = msg.stopReason().orElse(null)
            if (stop == StopReason.REFUSAL) error("La IA no ha podido leer esta imagen. Prueba con otra foto.")
            if (stop == StopReason.MAX_TOKENS) error("La respuesta se cortó. Prueba con una foto de menos ejercicios.")
            val text = msg.content().flatMap { b -> b.text().map { listOf(it.text()) }.orElse(emptyList()) }.joinToString("")
            return parse(text)
        } finally {
            client.close()
        }
    }

    /** Convierte la respuesta JSON del modelo en rutina. Público para las pruebas. */
    fun parse(text: String): Result {
        val o = JSONObject(text)
        val r = Routine.fromJson(o).cleaned()
        require(r.exercises.isNotEmpty()) { "No he encontrado ejercicios en la foto" }
        val w = o.optJSONArray("warnings")
        val warnings = if (w == null) emptyList() else (0 until w.length()).map { w.getString(it) }.filter { it.isNotBlank() }
        return Result(r, warnings)
    }

    private fun schema(): JsonOutputFormat.Schema {
        val str = mapOf("type" to "string")
        val int = mapOf("type" to "integer")
        val exercise = mapOf(
            "type" to "object",
            "additionalProperties" to false,
            "required" to listOf("name", "sets", "reps", "weight", "rest", "note", "block"),
            "properties" to mapOf(
                "name" to str,
                "sets" to int,
                "reps" to str,
                "weight" to str,
                "rest" to mapOf("type" to listOf("integer", "null")),
                "note" to str,
                "block" to int,
            ),
        )
        val block = mapOf(
            "type" to "object",
            "additionalProperties" to false,
            "required" to listOf("name", "type", "rounds", "capS", "everyS", "restS", "scheme"),
            "properties" to mapOf(
                "name" to str,
                "type" to mapOf("type" to "string", "enum" to BlockType.entries.map { it.id }),
                "rounds" to int,
                "capS" to int,
                "everyS" to int,
                "restS" to int,
                "scheme" to str,
            ),
        )
        return JsonOutputFormat.Schema.builder()
            .putAdditionalProperty("type", JsonValue.from("object"))
            .putAdditionalProperty("additionalProperties", JsonValue.from(false))
            .putAdditionalProperty("required", JsonValue.from(listOf("name", "blocks", "exercises", "warnings")))
            .putAdditionalProperty(
                "properties", JsonValue.from(
                    mapOf(
                        "name" to str,
                        "blocks" to mapOf("type" to "array", "items" to block),
                        "exercises" to mapOf("type" to "array", "items" to exercise),
                        "warnings" to mapOf("type" to "array", "items" to str),
                    )
                )
            )
            .build()
    }

    /** Reduce la foto (lado largo 1568 px) y la gira según EXIF para que la IA la lea derecha. */
    private fun loadScaledJpeg(ctx: Context, uri: Uri): ByteArray {
        val cr = ctx.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Eso no parece una imagen" }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 1568) sample *= 2
        val bmp0 = cr.openInputStream(uri).use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: error("No puedo abrir la imagen")
        val rotation = runCatching {
            cr.openInputStream(uri).use { ExifInterface(it!!).rotationDegrees }
        }.getOrDefault(0)
        val scale = minOf(1f, 1568f / maxOf(bmp0.width, bmp0.height))
        val m = Matrix().apply { postScale(scale, scale); postRotate(rotation.toFloat()) }
        val bmp = Bitmap.createBitmap(bmp0, 0, 0, bmp0.width, bmp0.height, m, true)
        return ByteArrayOutputStream().use { out ->
            bmp.compress(Bitmap.CompressFormat.JPEG, 85, out)
            out.toByteArray()
        }
    }
}

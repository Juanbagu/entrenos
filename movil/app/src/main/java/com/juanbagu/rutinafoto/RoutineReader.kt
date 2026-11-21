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
        Eres un asistente que pasa a limpio rutinas de gimnasio a partir de una foto
        (pizarra del gimnasio, papel escrito a mano o captura de pantalla de otra app).
        Devuelve los ejercicios en el orden en que hay que hacerlos.
        - name: el nombre del ejercicio como está escrito, corrigiendo solo faltas evidentes. En español si está en español.
        - sets: número de series (entero). Si no se indica, 1.
        - reps: repeticiones tal cual ("10", "8-10", "max", "45s" para tiempo). Vacío si no hay.
        - weight: peso con unidad ("60 kg", "20 lb") o vacío.
        - rest: descanso entre series en segundos, o null si la foto no lo dice.
        - note: algo importante que no cabe en lo anterior (p. ej. "superserie con el siguiente", "por pierna"), o vacío.
        Si hay superseries o circuitos, ponlos en orden y explícalo en note.
        Si hay varios días o bloques, usa solo el que parezca el de hoy o el primero, y dilo en warnings.
        name de la rutina: el título de la foto o uno corto que la describa.
        warnings: lo que no se lee bien o lo que has tenido que suponer. Vacío si todo está claro.
        No inventes ejercicios que no estén en la imagen.
    """.trimIndent()

    data class Result(val routine: Routine, val warnings: List<String>)

    fun read(ctx: Context, apiKey: String, image: Uri): Result {
        require(apiKey.isNotBlank()) { "Falta la clave de la API (Ajustes)" }
        val jpeg = loadScaledJpeg(ctx, image)
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

            val msg = client.messages().create(params)
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
        val r = Routine.fromJson(o)
        require(r.exercises.isNotEmpty()) { "No he encontrado ejercicios en la foto" }
        val w = o.optJSONArray("warnings")
        val warnings = if (w == null) emptyList() else (0 until w.length()).map { w.getString(it) }.filter { it.isNotBlank() }
        return Result(r, warnings)
    }

    private fun schema(): JsonOutputFormat.Schema {
        val str = mapOf("type" to "string")
        val exercise = mapOf(
            "type" to "object",
            "additionalProperties" to false,
            "required" to listOf("name", "sets", "reps", "weight", "rest", "note"),
            "properties" to mapOf(
                "name" to str,
                "sets" to mapOf("type" to "integer"),
                "reps" to str,
                "weight" to str,
                "rest" to mapOf("type" to listOf("integer", "null")),
                "note" to str,
            ),
        )
        return JsonOutputFormat.Schema.builder()
            .putAdditionalProperty("type", JsonValue.from("object"))
            .putAdditionalProperty("additionalProperties", JsonValue.from(false))
            .putAdditionalProperty("required", JsonValue.from(listOf("name", "exercises", "warnings")))
            .putAdditionalProperty(
                "properties", JsonValue.from(
                    mapOf(
                        "name" to str,
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

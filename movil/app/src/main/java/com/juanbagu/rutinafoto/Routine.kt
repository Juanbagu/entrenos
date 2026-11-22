package com.juanbagu.rutinafoto

import org.json.JSONArray
import org.json.JSONObject

data class Exercise(
    val name: String,
    val sets: Int,
    val reps: String = "",
    val weight: String = "",
    val rest: Int? = null,
    val note: String = "",
)

data class Routine(
    val name: String,
    val exercises: List<Exercise>,
    val defaultRest: Int = 90,
) {
    /** Limpia y acota la rutina antes de mandarla (mismos límites que el reloj). */
    fun cleaned(): Routine = Routine(
        name = name.trim().take(48).ifBlank { "Rutina" },
        defaultRest = defaultRest.coerceIn(0, 900),
        exercises = exercises.filter { it.name.isNotBlank() }.take(40).map {
            it.copy(
                name = it.name.trim().take(48),
                sets = it.sets.coerceIn(1, 20),
                reps = it.reps.trim().take(12),
                weight = it.weight.trim().take(16),
                rest = it.rest?.coerceIn(0, 900),
                note = it.note.trim().take(80),
            )
        },
    )

    /** Mismo formato que entiende la miniapp del reloj (shared/routine.js normalizeRoutine). */
    fun toJson(): JSONObject = JSONObject().apply {
        put("name", name)
        put("defaultRest", defaultRest)
        put("exercises", JSONArray().apply {
            exercises.forEach { e ->
                put(JSONObject().apply {
                    put("name", e.name)
                    put("sets", e.sets)
                    put("reps", e.reps)
                    if (e.weight.isNotBlank()) put("weight", e.weight)
                    put("rest", e.rest ?: defaultRest)
                    if (e.note.isNotBlank()) put("note", e.note)
                })
            }
        })
    }

    /** Texto para pegar en los ajustes de la miniapp dentro de Zepp (plan C). */
    fun toText(): String = buildString {
        appendLine(name)
        exercises.forEach { e ->
            append(e.name).append(' ').append(e.sets).append('x').append(e.reps.ifBlank { "1" }.replace(" ", ""))
            if (e.weight.isNotBlank()) append(' ').append(e.weight.replace(" ", ""))
            append(' ').append(e.rest ?: defaultRest).append('s')
            appendLine()
        }
    }.trim()

    companion object {
        fun fromJson(o: JSONObject): Routine {
            val def = o.optInt("defaultRest", 90)
            val arr = o.optJSONArray("exercises") ?: JSONArray()
            val list = (0 until arr.length()).map { i ->
                val e = arr.getJSONObject(i)
                Exercise(
                    name = e.optString("name", "Ejercicio ${i + 1}").trim(),
                    sets = e.optInt("sets", 1).coerceAtLeast(1),
                    reps = e.opt("reps")?.takeIf { it != JSONObject.NULL }?.toString() ?: "",
                    weight = e.opt("weight")?.takeIf { it != JSONObject.NULL }?.toString() ?: "",
                    rest = if (e.has("rest") && !e.isNull("rest")) e.optInt("rest") else null,
                    note = e.optString("note", ""),
                )
            }
            return Routine(o.optString("name", "Rutina").ifBlank { "Rutina" }, list, def)
        }
    }
}

/** Resumen de un entreno, tal como lo manda el reloj (shared/routine.js summary). */
data class Session(
    val routine: String,
    val start: Long,
    val end: Long,
    val activeS: Int,
    val sets: Int,
    val hrAvg: Int,
    val hrMax: Int,
    val exercises: List<SessionExercise>,
) {
    companion object {
        private const val DAY_MS = 24 * 3600 * 1000L

        fun fromJson(o: JSONObject): Session {
            val arr = o.optJSONArray("exercises") ?: JSONArray()
            return Session(
                routine = o.optString("routine", "Entreno").take(48),
                start = o.optLong("start"),
                end = o.optLong("end"),
                activeS = o.optInt("activeS"),
                sets = o.optInt("sets"),
                hrAvg = o.optInt("hrAvg"),
                hrMax = o.optInt("hrMax"),
                exercises = (0 until minOf(arr.length(), 40)).map { i ->
                    val e = arr.getJSONObject(i)
                    val done = e.optJSONArray("done") ?: JSONArray()
                    SessionExercise(
                        name = e.optString("name").take(48),
                        start = e.optLong("start"),
                        end = e.optLong("end"),
                        sets = e.optInt("sets"),
                        planned = e.optInt("planned"),
                        reps = e.optString("reps").take(12),
                        weight = e.optString("weight").take(16),
                        skipped = e.optBoolean("skipped"),
                        hrAvg = e.optInt("hrAvg"),
                        done = (0 until minOf(done.length(), 20)).map { j ->
                            val d = done.getJSONObject(j)
                            DoneSet(d.optString("reps").take(12), d.optString("weight").take(16))
                        },
                    )
                },
            )
        }

        /** Descarta datos imposibles (protege Health Connect de basura o de otra app que escriba en el puerto). */
        fun isValid(s: Session): Boolean {
            val now = System.currentTimeMillis()
            return s.start > 1_600_000_000_000L && s.end > s.start && s.end <= now + DAY_MS &&
                s.end - s.start <= DAY_MS && s.activeS in 0..(24 * 3600) && s.sets in 0..800 &&
                s.hrAvg in 0..250 && s.hrMax in 0..250
        }
    }
}

data class SessionExercise(
    val name: String,
    val start: Long,
    val end: Long,
    val sets: Int,
    val planned: Int,
    val reps: String,
    val weight: String,
    val skipped: Boolean,
    val hrAvg: Int,
    val done: List<DoneSet> = emptyList(),
) {
    /** "10×60 kg, 8×62,5 kg" con lo realmente hecho; si no hay detalle, lo planificado. */
    fun detail(): String =
        if (done.isNotEmpty()) done.joinToString(", ") { d -> (d.reps.ifBlank { "?" }) + (if (d.weight.isNotBlank()) "×" + d.weight else "") }
        else "$sets/$planned series" + (if (reps.isNotBlank()) " × $reps" else "") + (if (weight.isNotBlank()) " · $weight" else "")
}

data class DoneSet(val reps: String, val weight: String)

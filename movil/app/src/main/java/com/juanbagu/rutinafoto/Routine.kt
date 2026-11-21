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
            append(e.name).append(' ').append(e.sets).append('x').append(e.reps.ifBlank { "1" })
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
    val raw: JSONObject,
) {
    companion object {
        fun fromJson(o: JSONObject): Session {
            val arr = o.optJSONArray("exercises") ?: JSONArray()
            return Session(
                routine = o.optString("routine", "Entreno"),
                start = o.optLong("start"),
                end = o.optLong("end"),
                activeS = o.optInt("activeS"),
                sets = o.optInt("sets"),
                hrAvg = o.optInt("hrAvg"),
                hrMax = o.optInt("hrMax"),
                exercises = (0 until arr.length()).map { i ->
                    val e = arr.getJSONObject(i)
                    SessionExercise(
                        name = e.optString("name"),
                        start = e.optLong("start"),
                        end = e.optLong("end"),
                        sets = e.optInt("sets"),
                        planned = e.optInt("planned"),
                        reps = e.optString("reps"),
                        weight = e.optString("weight"),
                        skipped = e.optBoolean("skipped"),
                        hrAvg = e.optInt("hrAvg"),
                    )
                },
                raw = o,
            )
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
)

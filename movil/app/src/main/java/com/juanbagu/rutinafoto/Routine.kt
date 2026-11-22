package com.juanbagu.rutinafoto

import org.json.JSONArray
import org.json.JSONObject

data class Exercise(
    val name: String,
    val sets: Int,
    /** Meta como texto: "10", "8-10", "max", "21-15-9", "1000 m", "20 cal", "45s". */
    val reps: String = "",
    val weight: String = "",
    val rest: Int? = null,
    val note: String = "",
    /** Índice del bloque al que pertenece. */
    val block: Int = 0,
)

/** Tipos de bloque (mismos que el reloj: shared/routine.js). */
enum class BlockType(val id: String, val label: String) {
    SETS("sets", "Fuerza (series)"),
    ROUNDS("rounds", "Rondas"),
    FORTIME("fortime", "For time"),
    AMRAP("amrap", "AMRAP"),
    EMOM("emom", "EMOM");

    companion object {
        fun of(id: String?) = entries.firstOrNull { it.id == id } ?: SETS
    }
}

data class Block(
    val name: String = "",
    val type: BlockType = BlockType.SETS,
    val rounds: Int = 1,
    /** Duración (AMRAP/EMOM) o límite de tiempo (For time), en segundos. 0 = sin límite. */
    val capS: Int = 0,
    /** Cada cuánto cambia en un EMOM, en segundos. */
    val everyS: Int = 60,
    /** Descanso entre rondas, en segundos. */
    val restS: Int = 0,
    /** Esquema de repeticiones por ronda, p. ej. "21-15-9". */
    val scheme: String = "",
) {
    /** Cabecera de texto que entiende el lector (para el texto de respaldo y las pruebas). */
    fun header(): String? = when (type) {
        BlockType.SETS -> name.ifBlank { null }
        BlockType.ROUNDS -> "$rounds rondas:"
        BlockType.FORTIME -> when {
            scheme.isNotBlank() -> "$scheme:"
            rounds > 1 -> "$rounds RFT:"
            else -> "For time" + (if (capS > 0) " (cap ${capS / 60})" else "")
        }
        BlockType.AMRAP -> "AMRAP ${capS / 60}'"
        BlockType.EMOM -> if (everyS == 60) "EMOM ${capS / 60}" else "E${everyS / 60}MOM ${capS / 60}"
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("name", name)
        put("type", type.id)
        put("rounds", rounds)
        put("capS", capS)
        put("everyS", everyS)
        put("restS", restS)
        if (scheme.isNotBlank()) put("scheme", scheme)
    }

    companion object {
        fun fromJson(o: JSONObject) = Block(
            name = o.optString("name", ""),
            type = BlockType.of(o.optString("type")),
            rounds = o.optInt("rounds", 1),
            capS = o.optInt("capS", 0),
            everyS = o.optInt("everyS", 60).takeIf { it > 0 } ?: 60,
            restS = o.optInt("restS", 0),
            scheme = o.optString("scheme", ""),
        )
    }
}

data class Routine(
    val name: String,
    val exercises: List<Exercise>,
    val defaultRest: Int = 90,
    val blocks: List<Block> = listOf(Block()),
) {
    val isHybrid: Boolean
        get() = blocks.any { it.type != BlockType.SETS } || exercises.any { it.reps.endsWith(" m") || it.reps.endsWith(" cal") }

    /** Limpia y acota la rutina antes de mandarla (mismos límites que el reloj). */
    fun cleaned(): Routine {
        val bl = (if (blocks.isEmpty()) listOf(Block()) else blocks).take(20).map {
            it.copy(
                name = it.name.trim().take(48),
                rounds = it.rounds.coerceIn(1, 50),
                capS = it.capS.coerceIn(0, 4 * 3600),
                everyS = it.everyS.coerceIn(10, 3600),
                restS = it.restS.coerceIn(0, 900),
                scheme = it.scheme.trim().take(40),
            )
        }
        return Routine(
            name = name.trim().take(48).ifBlank { "Rutina" },
            defaultRest = defaultRest.coerceIn(0, 900),
            blocks = bl,
            exercises = exercises.filter { it.name.isNotBlank() }.take(80).map {
                it.copy(
                    name = it.name.trim().take(48),
                    sets = it.sets.coerceIn(1, 20),
                    reps = it.reps.trim().take(16),
                    weight = it.weight.trim().take(16),
                    rest = it.rest?.coerceIn(0, 900),
                    note = it.note.trim().take(80),
                    block = it.block.coerceIn(0, bl.size - 1),
                )
            },
        )
    }

    /** Mismo formato que entiende la miniapp del reloj (shared/routine.js normalizeRoutine). */
    fun toJson(): JSONObject = JSONObject().apply {
        put("name", name)
        put("defaultRest", defaultRest)
        put("blocks", JSONArray().apply { blocks.forEach { put(it.toJson()) } })
        put("exercises", JSONArray().apply {
            exercises.forEach { e ->
                val b = blocks.getOrNull(e.block) ?: Block()
                put(JSONObject().apply {
                    put("name", e.name)
                    put("sets", e.sets)
                    put("reps", e.reps)
                    if (e.weight.isNotBlank()) put("weight", e.weight)
                    // En fuerza el descanso por defecto es el general; en bloques híbridos no hay descanso entre series.
                    put("rest", e.rest ?: if (b.type == BlockType.SETS) defaultRest else 0)
                    if (e.note.isNotBlank()) put("note", e.note)
                    put("block", e.block)
                })
            }
        })
    }

    /** Texto para pegar en los ajustes de la miniapp dentro de Zepp (plan C). Lo entiende el lector. */
    fun toText(): String = buildString {
        appendLine(name)
        var last = -1
        exercises.forEach { e ->
            if (e.block != last) {
                val b = blocks.getOrNull(e.block) ?: Block()
                if (last >= 0) appendLine()
                b.header()?.let { appendLine(it) }
                if (b.type == BlockType.FORTIME && b.capS > 0 && (b.scheme.isNotBlank() || b.rounds > 1)) appendLine("Time cap ${b.capS / 60}'")
                if (b.restS > 0 && b.type != BlockType.SETS) appendLine("Descanso ${b.restS}s")
                last = e.block
            }
            val b = blocks.getOrNull(e.block) ?: Block()
            val w = if (e.weight.isNotBlank()) " " + e.weight.replace(" ", "").replace("×", "x") else ""
            if (b.type == BlockType.SETS) {
                append(e.name).append(' ').append(e.sets).append('x').append(e.reps.ifBlank { "1" }.replace(" ", ""))
                append(w).append(' ').append(e.rest ?: defaultRest).append('s')
            } else {
                val target = e.reps.replace(" m", "m")
                if (e.sets > 1) append(e.sets).append('x').append(target.ifBlank { "1" }.replace(" ", "")).append(' ')
                else if (target.isNotBlank()) append(target).append(' ')
                append(e.name).append(w)
            }
            appendLine()
        }
    }.trim()

    companion object {
        fun fromJson(o: JSONObject): Routine {
            val def = o.optInt("defaultRest", 90)
            val barr = o.optJSONArray("blocks")
            val blocks = if (barr == null || barr.length() == 0) listOf(Block())
            else (0 until barr.length()).map { Block.fromJson(barr.getJSONObject(it)) }
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
                    block = e.optInt("block", 0).coerceIn(0, blocks.size - 1),
                )
            }
            return Routine(o.optString("name", "Rutina").ifBlank { "Rutina" }, list, def, blocks)
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
    val blocks: List<BlockResult> = emptyList(),
    val hybrid: Boolean = false,
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
                hybrid = o.optBoolean("hybrid", false),
                blocks = (o.optJSONArray("blocks") ?: JSONArray()).let { ba ->
                    (0 until minOf(ba.length(), 20)).map { i ->
                        val b = ba.getJSONObject(i)
                        BlockResult(
                            name = b.optString("name").take(48),
                            type = BlockType.of(b.optString("type")),
                            timeS = b.optInt("timeS"),
                            rounds = b.optInt("rounds"),
                            extra = b.optInt("extra"),
                            missed = b.optInt("missed"),
                            capped = b.optBoolean("capped"),
                        )
                    }
                },
                exercises = (0 until minOf(arr.length(), 120)).map { i ->
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

/** Resultado de un bloque híbrido: "AMRAP 12': 5 rondas + 3", "Hyrox sim: 1:12:30", "EMOM 10': 9/10". */
data class BlockResult(
    val name: String,
    val type: BlockType,
    val timeS: Int,
    val rounds: Int,
    val extra: Int,
    val missed: Int,
    val capped: Boolean,
) {
    fun text(): String = name + ": " + when (type) {
        BlockType.AMRAP -> "$rounds rondas" + (if (extra > 0) " + $extra" else "")
        BlockType.EMOM -> "${(rounds * 1).coerceAtLeast(0)} vueltas" + (if (missed > 0) ", $missed sin completar" else "")
        else -> fmt(timeS) + (if (capped) " (time cap)" else "")
    }

    companion object {
        fun fmt(s: Int): String {
            val h = s / 3600
            val m = (s % 3600) / 60
            val sec = s % 60
            return if (h > 0) "%d:%02d:%02d".format(h, m, sec) else "%d:%02d".format(m, sec)
        }
    }
}

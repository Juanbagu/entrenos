package com.juanbagu.rutinafoto

/**
 * Lector de rutinas en texto (sin internet). Es la versión Kotlin de reloj/shared/parse.js:
 * los dos se prueban contra los mismos casos (shared/fixtures/parse-cases.json).
 * Entiende fuerza ("Sentadilla 4x10 60kg 90s") y entrenos híbridos/Hyrox ("1km run", "20 cal bike",
 * "4 rondas", "21-15-9", "AMRAP 12'", "EMOM 10", "E2MOM 16", "For time (cap 20)", "Time cap 10'").
 */
object RoutineParser {

    private val ABBR = mapOf(
        "wb" to "Wall balls", "bbj" to "Burpee broad jumps", "sbl" to "Sandbag lunges", "fc" to "Farmers carry",
        "t2b" to "Toes to bar", "ttb" to "Toes to bar", "c2b" to "Chest to bar", "hspu" to "Handstand push-ups",
        "du" to "Double unders", "dus" to "Double unders", "mu" to "Muscle-ups", "pu" to "Pull-ups", "kbs" to "Kettlebell swings",
        "ohs" to "Overhead squat", "pc" to "Power clean", "psn" to "Power snatch", "c&j" to "Clean & jerk", "cj" to "Clean & jerk",
        "dl" to "Peso muerto", "bs" to "Back squat", "fs" to "Front squat", "ab" to "Air bike", "ski" to "SkiErg", "bike" to "Bike",
        "row" to "Remo", "run" to "Carrera", "rdl" to "Peso muerto rumano", "gtoh" to "Ground to overhead", "btn" to "Burpee to target",
    )

    private class B(var name: String = "", var type: BlockType = BlockType.SETS, var rounds: Int = 1, var capS: Int = 0, var everyS: Int = 0, var restS: Int = 0, var scheme: String = "")
    private class E(var name: String = "", var sets: Int = 1, var reps: String = "", var weight: String = "", var rest: Int? = null, var block: Int = 0)
    private class Head(val block: B?, val rest: String, val capOnly: Boolean = false, val capS: Int = 0, val title: String? = null)

    private fun re(p: String) = Regex("(?iu)$p")

    private val REST_ONLY = re("^(?:descanso|desc\\.?|rest|recuperaci[oó]n)\\s*(?:entre\\s+\\w+)?\\s*:?\\s*(\\d+(?::\\d\\d)?)\\s*(s|seg|min|m|'|\")?\\.?$")

    fun parse(text: String): Routine {
        val t = text.trim()
        require(t.isNotEmpty()) { "Rutina vacía" }
        val lines = t.split(Regex("\r?\n")).map { it.replace('\t', ' ').trim() }
        var name = ""
        val blocks = mutableListOf<B>()
        val exs = mutableListOf<E>()
        var block: B? = null
        var defaultRest: Int? = null

        fun newBlock(b: B): B { blocks += b; block = b; return b }
        fun currentIndex(): Int { if (block == null) newBlock(B()); return blocks.size - 1 }

        for (raw in lines) {
            if (raw.isEmpty()) {
                if (block != null && block!!.type != BlockType.SETS) block = null
                continue
            }
            var line = raw.replace(Regex("^[-*•·]\\s*"), "").replace(re("^(?:\\(?[a-z]\\)|[a-z][.)]|\\d{1,2}[.)])\\s+"), "")

            // Descanso general ("Descanso 90s") o, dentro de un bloque, descanso entre rondas.
            val restOnly = REST_ONLY.find(line)
            if (restOnly != null) {
                val u = restOnly.groupValues[2].ifEmpty { if (restOnly.groupValues[1].contains(':')) "" else "s" }
                val secs = toSeconds(restOnly.groupValues[1], u)
                if (block != null && block!!.type != BlockType.SETS) block!!.restS = secs else defaultRest = secs
                continue
            }

            val head = parseHeader(line)
            if (head != null) {
                if (head.capOnly) {
                    (block ?: blocks.lastOrNull())?.capS = head.capS
                    continue
                }
                newBlock(head.block!!)
                if (head.title != null && name.isEmpty() && exs.isEmpty()) name = head.title
                line = head.rest
                if (line.isEmpty()) continue
            }

            val inBlock = block != null && block!!.type != BlockType.SETS
            var any = false
            for (p in splitItems(line)) {
                val ex = parseItem(p, inBlock) ?: continue
                ex.block = currentIndex()
                exs += ex
                any = true
            }
            if (any) continue

            val label = cleanName(line.replace(Regex("[:#*=]+$"), ""))
            if (label.isEmpty()) continue
            when {
                inBlock -> exs += E(name = expandName(label), block = currentIndex())
                name.isEmpty() && exs.isEmpty() -> name = label
                else -> newBlock(B(name = label))
            }
        }

        require(exs.isNotEmpty()) { "No encontré ningún ejercicio (p. ej. \"Sentadilla 4x10\" o \"1km run\")" }
        // Quita bloques vacíos y reindexa.
        val map = IntArray(blocks.size)
        val kept = mutableListOf<B>()
        blocks.forEachIndexed { i, b -> map[i] = kept.size; if (exs.any { it.block == i }) kept += b }
        exs.forEach { it.block = map[it.block] }
        if (name.isEmpty()) name = if (kept.any { it.type != BlockType.SETS }) "Híbrido" else "Rutina"
        defaultRest?.let { d -> exs.forEach { if (it.rest == null && kept[it.block].type == BlockType.SETS) it.rest = d } }

        return Routine(
            name = name,
            defaultRest = defaultRest ?: 90,
            blocks = kept.map { Block(it.name, it.type, it.rounds, it.capS, if (it.everyS > 0) it.everyS else 60, it.restS, it.scheme) },
            exercises = exs.map { Exercise(it.name, it.sets, it.reps, it.weight, it.rest, "", it.block) },
        )
    }

    private fun after(l: String, prefix: String) = l.substring(prefix.length).replace(Regex("^[\\s:,.\\-–]+"), "").trim()

    private fun parseHeader(line: String): Head? {
        val l = line.trim()
        re("^(?:time\\s*cap|tc|cap|l[ií]mite)\\s*:?\\s*(\\d+(?::\\d\\d)?)\\s*(min|m|'|s)?\\.?$").find(l)?.let { m ->
            return Head(null, "", capOnly = true, capS = toSeconds(m.groupValues[1], m.groupValues[2].ifEmpty { "min" }))
        }
        re("^amrap\\s*(?:de\\s*)?(\\d+(?::\\d\\d)?)\\s*(min(?:utos)?|m|'|s)?").find(l)?.let { m ->
            return Head(B(type = BlockType.AMRAP, name = "AMRAP ${m.groupValues[1]}'", capS = toSeconds(m.groupValues[1], m.groupValues[2].ifEmpty { "min" })), after(l, m.value))
        }
        re("^e(\\d*)mom\\s*(?:x\\s*)?(\\d+)\\s*(min(?:utos)?|m|'|rondas?|rounds?)?").find(l)?.let { m ->
            val every = (m.groupValues[1].toIntOrNull() ?: 1) * 60
            val n = m.groupValues[2].toInt()
            val cap = if (m.groupValues[3].startsWith("r", true)) n * every else n * 60
            val nm = (if (m.groupValues[1].isNotEmpty()) "E" + m.groupValues[1] else "E") + "MOM " + Math.round(cap / 60.0) + "'"
            return Head(B(type = BlockType.EMOM, name = nm, everyS = every, capS = cap), after(l, m.value))
        }
        re("^(?:every|cada)\\s*(\\d+(?::\\d\\d)?)\\s*(min(?:utos)?|m|'|s)?\\s*(?:x|por)\\s*(\\d+)").find(l)?.let { m ->
            val every = toSeconds(m.groupValues[1], m.groupValues[2].ifEmpty { "min" })
            val n = m.groupValues[3].toInt()
            return Head(B(type = BlockType.EMOM, name = "Cada ${Math.round(every / 60.0)}' x$n", everyS = every, capS = every * n), after(l, m.value))
        }
        (re("^(\\d+)\\s*(?:rondas?|rounds?|rft|vueltas?|series)\\b(?:\\s*(?:for\\s*time|por\\s*tiempo|de|of))?").find(l)
            ?: re("^x\\s*(\\d+)\\s*(?:rondas?|rounds?)?\\s*:?$").find(l))?.let { m ->
            val n = m.groupValues[1].toInt()
            val ft = re("rft|for\\s*time|por\\s*tiempo").containsMatchIn(m.value)
            return Head(B(type = if (ft) BlockType.FORTIME else BlockType.ROUNDS, name = "$n rondas", rounds = n), after(l, m.value))
        }
        re("^(\\d+(?:\\s*-\\s*\\d+){1,9})(?:\\s*(?:reps?|repeticiones))?(?:\\s*(?:for\\s*time|por\\s*tiempo))?\\s*(?::|$|\\s+(?=[a-záéíóúñ]))").find(l)?.let { m ->
            val scheme = m.groupValues[1].replace(Regex("\\s+"), "")
            if (scheme.split('-').size >= 3 || Regex(":\\s*$").containsMatchIn(m.value) || l.trim() == m.groupValues[1]) {
                return Head(B(type = BlockType.FORTIME, name = scheme, rounds = scheme.split('-').size, scheme = scheme), after(l, m.value))
            }
        }
        re("^(?:for\\s*time|por\\s*tiempo|ft)\\b\\s*(?:\\(?\\s*(?:cap|tc|time\\s*cap)\\s*(\\d+)\\s*(min|m|')?\\s*\\)?)?").find(l)?.let { m ->
            val cap = if (m.groupValues[1].isNotEmpty()) toSeconds(m.groupValues[1], m.groupValues[2].ifEmpty { "min" }) else 0
            return Head(B(type = BlockType.FORTIME, name = "For time", capS = cap), after(l, m.value))
        }
        re("^(?:hyrox)(?:\\s*(sim(?:ulaci[oó]n)?|half|medio|full|completo))?\\s*:?\\s*$").find(l)?.let { m ->
            val title = "Hyrox" + if (m.groupValues[1].isNotEmpty()) " " + m.groupValues[1].lowercase() else ""
            return Head(B(type = BlockType.FORTIME, name = title), "", title = title)
        }
        return null
    }

    private fun splitItems(line: String) =
        line.split(re("\\s+\\+\\s+|\\s*;\\s*|,\\s+(?=\\d|[a-záéíóú])")).map { it.trim() }.filter { it.isNotEmpty() }

    private fun parseItem(text: String, lenient: Boolean): E? {
        var l = " " + text.replace('×', 'x').replace(Regex("(\\d),(\\d)"), "$1.$2") + " "
        val ex = E()
        var found = false
        fun take(r: Regex, fn: (MatchResult) -> Unit): Boolean {
            val m = r.find(l) ?: return false
            fn(m)
            l = l.substring(0, m.range.first) + " " + l.substring(m.range.last + 1)
            return true
        }

        take(re("@?\\s*(?:(\\d+)\\s*x\\s*)?(\\d+(?:\\.\\d+)?(?:/\\d+(?:\\.\\d+)?)?)\\s*(kg|kgs|kilos?|lb|lbs)\\b")) { m ->
            ex.weight = (if (m.groupValues[1].isNotEmpty()) m.groupValues[1] + "×" else "") +
                m.groupValues[2].replace('.', ',') + " " + if (m.groupValues[3].startsWith("l", true)) "lb" else "kg"
        }
        take(re("(?:descanso|desc\\.?|rest)\\s*:?\\s*(\\d+(?::\\d\\d)?)\\s*(s|seg|min|m|'|\")?")) { m ->
            ex.rest = toSeconds(m.groupValues[1], m.groupValues[2].ifEmpty { if (m.groupValues[1].contains(':')) "" else "s" })
        }
        val hasSets = take(re("\\b(\\d+)\\s*x\\s*(\\d+(?:\\.\\d+)?\\s*(?:km|k|m|mts|metros|cal|cals|kcal|s|seg|\"|''|min)?(?:\\s*-\\s*\\d+)?|max|m[aá]x|fallo|amrap)(?![a-z])")) { m ->
            ex.sets = m.groupValues[1].toInt()
            ex.reps = normTarget(m.groupValues[2])
            found = true
        }
        if (!hasSets) take(re("(?:^|\\s)x\\s*(\\d+)\\b(?!\\s*(?:kg|lb))")) { m -> ex.reps = m.groupValues[1]; found = true }
        if (ex.reps.isEmpty()) {
            take(re("\\b(\\d+(?:\\.\\d+)?)\\s*(km|k|m|mts|metros)\\b(?!\\s*(?:in|min))")) { m -> ex.reps = normTarget(m.groupValues[1] + m.groupValues[2]); found = true } ||
                take(re("\\b(\\d+)(?:/\\d+)?\\s*(cal|cals|kcal|calor[ií]as)\\b")) { m -> ex.reps = m.groupValues[1] + " cal"; found = true } ||
                take(Regex("\\b(\\d+):(\\d\\d)\\b")) { m -> ex.reps = "${m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt()}s"; found = true } ||
                take(re("\\b(\\d+)\\s*(min(?:utos)?|')(?!\\w)")) { m -> ex.reps = "${m.groupValues[1].toInt() * 60}s"; found = true } ||
                take(re("\\b(\\d+)\\s*(s|seg|segundos|\"|'')(?!\\w)")) { m -> ex.reps = m.groupValues[1] + "s"; found = true } ||
                take(re("^\\s*(\\d+(?:\\s*-\\s*\\d+)*)\\s+(?=[a-záéíóúñ])")) { m -> ex.reps = m.groupValues[1].replace(Regex("\\s+"), ""); found = true } ||
                take(re("\\b(max|m[aá]x|fallo|amrap)\\b")) { _ -> ex.reps = "max"; found = true }
        }
        if (hasSets && ex.rest == null) {
            take(re("\\b(\\d+)\\s*(s|seg|min|'|\")(?!\\w)")) { m -> ex.rest = toSeconds(m.groupValues[1], m.groupValues[2]) }
        }
        val name = cleanName(l)
        if (!found && !(lenient && ex.weight.isNotEmpty() && name.isNotEmpty())) return null
        ex.name = expandName(name.ifEmpty { "Ejercicio" })
        if (re("^(rondas?|rounds?|vueltas?)$").matches(ex.name)) return null
        return ex
    }

    fun normTarget(t: String): String {
        val s = t.trim().lowercase().replace(Regex("\\s+"), "")
        Regex("^(\\d+(?:\\.\\d+)?)(km|k)$").find(s)?.let { return "${Math.round(it.groupValues[1].toDouble() * 1000)} m" }
        Regex("^(\\d+)(m|mts|metros)$").find(s)?.let { return "${it.groupValues[1]} m" }
        Regex("^(\\d+)(cal|cals|kcal)$").find(s)?.let { return "${it.groupValues[1]} cal" }
        Regex("^(\\d+)(s|seg|\"|'')$").find(s)?.let { return "${it.groupValues[1]}s" }
        Regex("^(\\d+)min$").find(s)?.let { return "${it.groupValues[1].toInt() * 60}s" }
        if (Regex("^(m[aá]x|fallo|amrap)$").matches(s)) return "max"
        return s
    }

    private fun expandName(name: String): String {
        val key = name.lowercase().replace(".", "")
        ABBR[key]?.let { return it }
        return name.split(' ').joinToString(" ") { w ->
            val a = ABBR[w.lowercase()]
            if (w.length <= 4 && a != null && w == w.uppercase()) a else w
        }
    }

    private fun cleanName(s: String) =
        s.replace(Regex("[@:–\\-|]+\\s*$"), "").replace(Regex("^\\s*[@:–\\-|.)]+"), "").replace(Regex("\\s+"), " ").trim()

    fun toSeconds(n: String, unit: String): Int {
        if (n.contains(':')) {
            val (a, b) = n.split(':').map { it.toInt() }
            return a * 60 + b
        }
        val v = n.toInt()
        return if (Regex("^(min|minutos|m|')$", RegexOption.IGNORE_CASE).matches(unit)) v * 60 else v
    }
}

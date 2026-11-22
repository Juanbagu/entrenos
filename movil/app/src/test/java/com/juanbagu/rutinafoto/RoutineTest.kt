package com.juanbagu.rutinafoto

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RoutineTest {
    private val modelJson = """
        {"name":"Pierna","warnings":["No se lee el peso de la prensa"],
         "exercises":[
           {"name":"Sentadilla","sets":4,"reps":"10","weight":"60 kg","rest":90,"note":""},
           {"name":"Prensa","sets":3,"reps":"12","weight":"","rest":null,"note":"por pierna"}]}
    """.trimIndent()

    @Test fun parseRespuestaDelModelo() {
        val r = RoutineReader.parse(modelJson)
        assertEquals("Pierna", r.routine.name)
        assertEquals(2, r.routine.exercises.size)
        assertEquals(null, r.routine.exercises[1].rest)
        assertEquals(listOf("No se lee el peso de la prensa"), r.warnings)
    }

    @Test fun jsonParaElRelojRellenaDescanso() {
        val r = RoutineReader.parse(modelJson).routine
        val o = r.toJson()
        val e1 = o.getJSONArray("exercises").getJSONObject(1)
        assertEquals(90, e1.getInt("rest"))
        assertTrue(!e1.has("weight"))
        assertEquals(r, Routine.fromJson(JSONObject(o.toString())).let { it.copy(exercises = it.exercises.mapIndexed { i, e -> if (i == 1) e.copy(rest = null) else e }) })
    }

    @Test fun textoParaZepp() {
        val r = RoutineReader.parse(modelJson).routine
        assertEquals("Pierna\nSentadilla 4x10 60kg 90s\nPrensa 3x12 90s", r.toText())
    }
}

class SecurityTest {
    private fun session(start: Long, end: Long, hr: Int = 120) = JSONObject(
        """{"routine":"X","start":$start,"end":$end,"activeS":600,"sets":5,"hrAvg":$hr,"hrMax":$hr,
           "exercises":[{"name":"Sentadilla","sets":2,"planned":3,"done":[{"reps":"10","weight":"60 kg"},{"reps":"8","weight":"62,5 kg"}]}]}"""
    )

    @Test fun entrenoValido() {
        val now = System.currentTimeMillis()
        val s = Session.fromJson(session(now - 3_600_000, now - 600_000))
        assertTrue(Session.isValid(s))
        assertEquals("10×60 kg, 8×62,5 kg", s.exercises[0].detail())
    }

    @Test fun entrenosImposiblesSeRechazan() {
        val now = System.currentTimeMillis()
        assertTrue(!Session.isValid(Session.fromJson(session(0, 1000))))                       // fechas absurdas
        assertTrue(!Session.isValid(Session.fromJson(session(now, now - 1))))                   // termina antes de empezar
        assertTrue(!Session.isValid(Session.fromJson(session(now - 3 * 86_400_000L, now))))   // más de un día
        assertTrue(!Session.isValid(Session.fromJson(session(now - 1000, now, hr = 999))))    // pulso imposible
    }

    @Test fun peticionesDesdeUnaWebSeBloquean() {
        assertTrue(LocalServer.fromBrowser(mapOf("origin" to "https://malicioso.example")))
        assertTrue(LocalServer.fromBrowser(mapOf("referer" to "http://x.example/pagina")))
        assertTrue(!LocalServer.fromBrowser(emptyMap()))
        assertTrue(!LocalServer.fromBrowser(mapOf("origin" to "null")))
    }

    @Test fun rutinaSeAcota() {
        val r = Routine("  ", List(100) { Exercise("E$it", 99, rest = 5000, block = 7) } + Exercise("   ", 3)).cleaned()
        assertEquals("Rutina", r.name)
        assertEquals(80, r.exercises.size)
        assertEquals(0, r.exercises[0].block) // bloque inexistente → el primero
        assertEquals(20, r.exercises[0].sets)
        assertEquals(900, r.exercises[0].rest)
    }
}

class OfflineLayoutTest {
    private fun row(top: Int, left: Int, text: String) = OfflineReader.Row(top, top + 40, left, text)

    /** Columnas de una captura (meta a la izquierda, ejercicio a la derecha) y huecos grandes = bloques distintos. */
    @Test fun ordenaColumnasYSeparaBloques() {
        val text = OfflineReader.layoutRows(listOf(
            row(100, 300, "wall balls 9kg"), row(102, 40, "20"),
            row(0, 40, "4 rondas:"), row(50, 40, "1km run"),
            row(260, 40, "AMRAP 12'"), row(310, 40, "10 burpees"),
        ))
        assertEquals("4 rondas:\n1km run\n20 wall balls 9kg\n\nAMRAP 12'\n10 burpees", text)
        val r = RoutineParser.parse(text)
        assertEquals(listOf(BlockType.ROUNDS, BlockType.AMRAP), r.blocks.map { it.type })
        assertEquals(listOf("1000 m", "20", "10"), r.exercises.map { it.reps })
    }
}

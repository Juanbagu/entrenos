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
        val r = Routine("  ", List(60) { Exercise("E$it", 99, rest = 5000) } + Exercise("   ", 3)).cleaned()
        assertEquals("Rutina", r.name)
        assertEquals(40, r.exercises.size)
        assertEquals(20, r.exercises[0].sets)
        assertEquals(900, r.exercises[0].rest)
    }
}

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

package com.juanbagu.rutinafoto

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** Mismos casos que el lector del reloj (reloj/test/parse.test.mjs). */
class ParserTest {
    private val cases = JSONArray(File("../../shared/fixtures/parse-cases.json").readText())

    @Test fun casosCompartidos() {
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val label = c.getString("case")
            val r = RoutineParser.parse(c.getString("text"))
            check(label, c, r)
        }
    }

    /** Lo que exportamos como texto para Zepp se vuelve a leer igual. */
    @Test fun idaYVueltaPorTexto() {
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val r = RoutineParser.parse(c.getString("text"))
            val back = RoutineParser.parse(r.toText())
            val label = c.getString("case") + " (ida y vuelta)\n" + r.toText()
            assertEquals(label, r.blocks.map { it.type to it.rounds }, back.blocks.map { it.type to it.rounds })
            assertEquals(label, r.blocks.map { it.capS to it.everyS }, back.blocks.map { it.capS to it.everyS })
            assertEquals(label, r.exercises.map { listOf(it.sets, it.reps, it.weight, it.block) },
                back.exercises.map { listOf(it.sets, it.reps, it.weight, it.block) })
        }
    }

    private fun check(label: String, c: JSONObject, r: Routine) {
        assertEquals("$label: nombre", c.getString("name"), r.name)
        val bs = c.getJSONArray("blocks")
        assertEquals("$label: bloques ${r.blocks}", bs.length(), r.blocks.size)
        for (j in 0 until bs.length()) {
            val b = bs.getJSONObject(j)
            val got = r.blocks[j]
            b.keys().forEach { k ->
                val v: Any = when (k) {
                    "type" -> got.type.id
                    "rounds" -> got.rounds
                    "capS" -> got.capS
                    "everyS" -> got.everyS
                    "restS" -> got.restS
                    "name" -> got.name
                    else -> error("campo $k")
                }
                assertEquals("$label: bloque $j.$k", b.get(k).toString(), v.toString())
            }
        }
        val es = c.getJSONArray("exercises")
        assertEquals("$label: ejercicios ${r.exercises.map { it.name }}", es.length(), r.exercises.size)
        for (j in 0 until es.length()) {
            val e = es.getJSONObject(j)
            val got = r.exercises[j]
            e.keys().forEach { k ->
                val v: Any? = when (k) {
                    "name" -> got.name
                    "sets" -> got.sets
                    "reps" -> got.reps
                    "weight" -> got.weight
                    "rest" -> got.rest
                    "block" -> got.block
                    else -> error("campo $k")
                }
                assertEquals("$label: ejercicio $j (${got.name}).$k", e.get(k).toString(), v.toString())
            }
            if (!e.has("sets")) assertEquals("$label: ejercicio $j.sets", 1, got.sets)
        }
    }
}

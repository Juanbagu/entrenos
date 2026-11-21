package com.juanbagu.rutinafoto

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Datos locales de la app (solo en el móvil). */
class Store(ctx: Context) {
    private val p = ctx.applicationContext.getSharedPreferences("rutinafoto", Context.MODE_PRIVATE)

    var apiKey: String
        get() = p.getString("apiKey", "") ?: ""
        set(v) = p.edit().putString("apiKey", v.trim()).apply()

    var routine: Routine?
        get() = p.getString("routine", null)?.let { runCatching { Routine.fromJson(JSONObject(it)) }.getOrNull() }
        set(v) = p.edit().putString("routine", v?.toJson()?.toString()).apply()

    fun sessions(): List<Session> {
        val arr = JSONArray(p.getString("sessions", "[]"))
        return (0 until arr.length()).map { Session.fromJson(arr.getJSONObject(it)) }.sortedByDescending { it.start }
    }

    /** Añade sesiones nuevas (por fecha de inicio) y devuelve solo las que no estaban. */
    @Synchronized
    fun addSessions(list: List<JSONObject>): List<Session> {
        val arr = JSONArray(p.getString("sessions", "[]"))
        val seen = (0 until arr.length()).map { arr.getJSONObject(it).optLong("start") }.toMutableSet()
        val added = mutableListOf<Session>()
        list.forEach { o ->
            if (seen.add(o.optLong("start"))) {
                arr.put(o)
                added += Session.fromJson(o)
            }
        }
        val trimmed = JSONArray()
        val from = (arr.length() - 200).coerceAtLeast(0)
        for (i in from until arr.length()) trimmed.put(arr.get(i))
        p.edit().putString("sessions", trimmed.toString()).apply()
        return added
    }

    fun markSynced(start: Long) {
        val s = p.getStringSet("hcSynced", emptySet())!!.toMutableSet()
        s += start.toString()
        p.edit().putStringSet("hcSynced", s).apply()
    }

    fun isSynced(start: Long) = p.getStringSet("hcSynced", emptySet())!!.contains(start.toString())
}

package com.juanbagu.rutinafoto

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Datos locales de la app (solo en el móvil; sin copia de seguridad en la nube). */
class Store(ctx: Context) {
    private val p = ctx.applicationContext.getSharedPreferences("rutinafoto", Context.MODE_PRIVATE)

    /** La clave de la API se guarda cifrada con una clave del Android Keystore (no sale del móvil). */
    var apiKey: String
        get() = p.getString("apiKeyEnc", null)?.let { runCatching { Crypto.decrypt(it) }.getOrNull() } ?: ""
        set(v) {
            val t = v.trim()
            p.edit().apply {
                if (t.isEmpty()) remove("apiKeyEnc") else putString("apiKeyEnc", Crypto.encrypt(t))
                remove("apiKey") // versión anterior guardaba en claro
            }.apply()
        }

    /** Rutina que se ofrece al reloj. */
    var routine: Routine?
        get() = p.getString("routine", null)?.let { runCatching { Routine.fromJson(JSONObject(it)) }.getOrNull() }
        set(v) = p.edit().putString("routine", v?.toJson()?.toString()).apply()

    /** Borrador que se está editando (no llega al reloj hasta pulsar «Enviar»). */
    var draft: Routine?
        get() = p.getString("draft", null)?.let { runCatching { Routine.fromJson(JSONObject(it)) }.getOrNull() } ?: routine
        set(v) = p.edit().putString("draft", v?.toJson()?.toString()).apply()

    fun recent(): List<Routine> {
        val arr = runCatching { JSONArray(p.getString("recent", "[]")) }.getOrDefault(JSONArray())
        return (0 until arr.length()).mapNotNull { runCatching { Routine.fromJson(arr.getJSONObject(it)) }.getOrNull() }
    }

    /** Guarda la rutina enviada entre las recientes (máx. 8, sin repetir nombre). */
    fun remember(r: Routine) {
        val list = listOf(r) + recent().filter { it.name != r.name }
        p.edit().putString("recent", JSONArray().apply { list.take(8).forEach { put(it.toJson()) } }.toString()).apply()
    }

    fun sessions(): List<Session> {
        val arr = runCatching { JSONArray(p.getString("sessions", "[]")) }.getOrDefault(JSONArray())
        return (0 until arr.length()).mapNotNull { runCatching { Session.fromJson(arr.getJSONObject(it)) }.getOrNull() }
            .sortedByDescending { it.start }
    }

    /** Añade sesiones válidas y nuevas (por fecha de inicio) y devuelve las añadidas. */
    @Synchronized
    fun addSessions(list: List<JSONObject>): List<Session> {
        val arr = runCatching { JSONArray(p.getString("sessions", "[]")) }.getOrDefault(JSONArray())
        val seen = (0 until arr.length()).map { arr.getJSONObject(it).optLong("start") }.toMutableSet()
        val added = mutableListOf<Session>()
        list.forEach { o ->
            val s = runCatching { Session.fromJson(o) }.getOrNull() ?: return@forEach
            if (Session.isValid(s) && seen.add(s.start)) {
                arr.put(o)
                added += s
            }
        }
        val trimmed = JSONArray()
        val from = (arr.length() - 200).coerceAtLeast(0)
        for (i in from until arr.length()) trimmed.put(arr.get(i))
        p.edit().putString("sessions", trimmed.toString()).apply()
        return added
    }

    fun deleteSession(start: Long) {
        val arr = runCatching { JSONArray(p.getString("sessions", "[]")) }.getOrDefault(JSONArray())
        val out = JSONArray()
        for (i in 0 until arr.length()) arr.getJSONObject(i).let { if (it.optLong("start") != start) out.put(it) }
        p.edit().putString("sessions", out.toString()).apply()
    }

    fun markSynced(start: Long) {
        val s = p.getStringSet("hcSynced", emptySet())!!.toMutableSet()
        s += start.toString()
        p.edit().putStringSet("hcSynced", s).apply()
    }

    fun isSynced(start: Long) = p.getStringSet("hcSynced", emptySet())!!.contains(start.toString())
}

/** AES-GCM con clave en el Android Keystore. */
private object Crypto {
    private const val ALIAS = "rutinafoto-apikey"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    fun encrypt(plain: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        val iv = c.iv
        val data = c.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(iv + data, Base64.NO_WRAP)
    }

    fun decrypt(enc: String): String {
        val all = Base64.decode(enc, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, all, 0, 12))
        return String(c.doFinal(all, 12, all.size - 12), Charsets.UTF_8)
    }
}

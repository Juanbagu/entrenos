package com.juanbagu.rutinafoto

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.BufferedInputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.util.concurrent.Semaphore

/**
 * Servidor mínimo en 127.0.0.1:8765, solo accesible desde el propio móvil.
 * Lo consulta la parte de la miniapp que corre dentro de la app Zepp (app-side/index.js):
 *   GET  /routine   → rutina actual en JSON
 *   POST /sessions  → { sessions: [...] } entrenos terminados en el reloj
 */
class LocalServer(
    private val store: Store,
    private val onSessions: (List<Session>) -> Unit,
) {
    private var socket: ServerSocket? = null
    private val slots = Semaphore(4) // como mucho 4 peticiones a la vez

    fun start(scope: CoroutineScope) {
        if (socket != null) return
        val ss = ServerSocket(PORT, 8, InetAddress.getByName("127.0.0.1"))
        socket = ss
        scope.launch(Dispatchers.IO) {
            while (!ss.isClosed) {
                val c = try { ss.accept() } catch (e: SocketException) { break }
                if (!c.inetAddress.isLoopbackAddress || !slots.tryAcquire()) {
                    runCatching { c.close() }
                    continue
                }
                launch(Dispatchers.IO) {
                    try { handle(c) } catch (e: Exception) { Log.w(TAG, "petición rechazada: ${e.message}") } finally { slots.release() }
                }
            }
        }
    }

    fun stop() {
        runCatching { socket?.close() }
        socket = null
    }

    private fun handle(c: Socket) = c.use {
        c.soTimeout = 5000
        val input = BufferedInputStream(c.getInputStream())
        val requestLine = readLine(input) ?: return
        val parts = requestLine.split(" ")
        val method = parts.getOrNull(0) ?: ""
        val path = (parts.getOrNull(1) ?: "").substringBefore('?')
        val headers = mutableMapOf<String, String>()
        var count = 0
        while (true) {
            val h = readLine(input) ?: return
            if (h.isEmpty()) break
            if (++count > MAX_HEADERS) error("demasiadas cabeceras")
            val i = h.indexOf(':')
            if (i > 0) headers[h.substring(0, i).trim().lowercase()] = h.substring(i + 1).trim()
        }
        val length = headers["content-length"]?.toIntOrNull() ?: 0
        val (status, json) = when {
            length !in 0..MAX_BODY -> "413 Payload Too Large" to """{"error":"demasiado grande"}"""
            fromBrowser(headers) -> "403 Forbidden" to """{"error":"no permitido"}"""
            method == "POST" && headers["content-type"]?.startsWith("application/json") != true ->
                "415 Unsupported Media Type" to """{"error":"solo JSON"}"""
            else -> {
                val body = ByteArray(length)
                var read = 0
                while (read < length) {
                    val n = input.read(body, read, length - read)
                    if (n < 0) break
                    read += n
                }
                route(method, path, String(body, 0, read, Charsets.UTF_8))
            }
        }
        val bytes = json.toByteArray(Charsets.UTF_8)
        val out = c.getOutputStream()
        out.write(
            ("HTTP/1.1 $status\r\nContent-Type: application/json; charset=utf-8\r\n" +
                "Content-Length: ${bytes.size}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n").toByteArray()
        )
        out.write(bytes)
        out.flush()
    }

    /** Lee una línea HTTP (hasta CRLF) con un tope de tamaño. */
    private fun readLine(input: BufferedInputStream): String? {
        val buf = java.io.ByteArrayOutputStream()
        while (true) {
            val b = input.read()
            if (b < 0) return if (buf.size() == 0) null else buf.toString("UTF-8")
            if (b == '\n'.code) return buf.toString("UTF-8").trimEnd('\r')
            if (buf.size() >= MAX_LINE) error("línea demasiado larga")
            buf.write(b)
        }
    }

    /** Separado del socket para poder probarlo. */
    fun route(method: String, path: String, body: String): Pair<String, String> = when {
        method == "GET" && path == "/routine" -> {
            val r = store.routine
            if (r == null) "404 Not Found" to """{"error":"sin rutina"}"""
            else "200 OK" to r.toJson().toString()
        }
        method == "POST" && path == "/sessions" -> {
            val arr = runCatching { JSONObject(body).optJSONArray("sessions") }.getOrNull()
            if (arr == null) "400 Bad Request" to """{"error":"JSON no válido"}"""
            else {
                val list = (0 until minOf(arr.length(), 50)).mapNotNull { arr.optJSONObject(it) }
                val added = store.addSessions(list)
                if (added.isNotEmpty()) onSessions(added)
                "200 OK" to """{"ok":true,"added":${added.size}}"""
            }
        }
        method == "GET" && path == "/ping" -> "200 OK" to """{"ok":true}"""
        else -> "404 Not Found" to """{"error":"no existe"}"""
    }

    companion object {
        const val PORT = 8765
        private const val TAG = "RutinaFoto"
        private const val MAX_BODY = 512 * 1024
        private const val MAX_LINE = 8 * 1024
        private const val MAX_HEADERS = 50

        /** Una web abierta en el navegador del móvil podría intentar escribir en 127.0.0.1: se rechaza. */
        fun fromBrowser(headers: Map<String, String>): Boolean {
            val origin = headers["origin"] ?: headers["referer"] ?: return false
            return origin.startsWith("http://", true) || origin.startsWith("https://", true)
        }
    }
}

/** Mantiene el servidor vivo mientras entrenas (Android cierra las apps en segundo plano). */
class BridgeService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var server: LocalServer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForegroundCompat()
        if (server == null) {
            val store = Store(this)
            server = LocalServer(store) { added ->
                lastReceived.value = System.currentTimeMillis()
                scope.launch { HealthWriter(this@BridgeService).writeAll(added, store) }
            }
            runCatching { server!!.start(scope) }.onFailure {
                Log.e("RutinaFoto", "no puedo abrir el puerto", it)
                stopSelf()
            }
        }
        running.value = true
        return START_STICKY
    }

    override fun onDestroy() {
        server?.stop()
        server = null
        scope.cancel()
        running.value = false
        super.onDestroy()
    }

    private fun startForegroundCompat() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Conexión con el reloj", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(
            this, 1, Intent(this, BridgeService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE
        )
        val n: Notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_rotate)
            .setContentTitle("Conectado con el reloj")
            .setContentText("El reloj puede pedir la rutina y enviar el entreno")
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "Parar", stop).build())
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(ID, n)
    }

    companion object {
        private const val CHANNEL = "puente"
        private const val ID = 1
        private const val ACTION_STOP = "stop"
        val running = MutableStateFlow(false)
        val lastReceived = MutableStateFlow(0L)

        fun start(ctx: Context) = ctx.startForegroundService(Intent(ctx, BridgeService::class.java))
        fun stop(ctx: Context) = ctx.startService(Intent(ctx, BridgeService::class.java).setAction(ACTION_STOP))
    }
}

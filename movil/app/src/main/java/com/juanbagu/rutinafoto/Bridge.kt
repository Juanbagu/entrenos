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
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException

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

    fun start(scope: CoroutineScope) {
        if (socket != null) return
        val ss = ServerSocket(PORT, 8, InetAddress.getByName("127.0.0.1"))
        socket = ss
        scope.launch(Dispatchers.IO) {
            while (!ss.isClosed) {
                val c = try { ss.accept() } catch (e: SocketException) { break }
                launch(Dispatchers.IO) { runCatching { handle(c) }.onFailure { Log.w(TAG, "petición", it) } }
            }
        }
    }

    fun stop() {
        runCatching { socket?.close() }
        socket = null
    }

    private fun handle(c: Socket) = c.use {
        c.soTimeout = 5000
        val reader = BufferedReader(InputStreamReader(c.getInputStream(), Charsets.UTF_8))
        val requestLine = reader.readLine() ?: return
        val (method, path) = requestLine.split(" ").let { (it.getOrNull(0) ?: "") to (it.getOrNull(1) ?: "") }
        var length = 0
        while (true) {
            val h = reader.readLine() ?: break
            if (h.isEmpty()) break
            if (h.startsWith("content-length:", ignoreCase = true)) length = h.substringAfter(':').trim().toIntOrNull() ?: 0
        }
        val body = if (length > 0) CharArray(length).let { buf ->
            var read = 0
            while (read < length) {
                val n = reader.read(buf, read, length - read)
                if (n < 0) break
                read += n
            }
            String(buf, 0, read)
        } else ""

        val (status, json) = route(method, path.substringBefore('?'), body)
        val bytes = json.toByteArray(Charsets.UTF_8)
        val out = c.getOutputStream()
        out.write(
            ("HTTP/1.1 $status\r\nContent-Type: application/json; charset=utf-8\r\n" +
                "Content-Length: ${bytes.size}\r\nConnection: close\r\n\r\n").toByteArray()
        )
        out.write(bytes)
        out.flush()
    }

    /** Separado del socket para poder probarlo. */
    fun route(method: String, path: String, body: String): Pair<String, String> = when {
        method == "GET" && path == "/routine" -> {
            val r = store.routine
            if (r == null) "404 Not Found" to """{"error":"sin rutina"}"""
            else "200 OK" to r.toJson().toString()
        }
        method == "POST" && path == "/sessions" -> {
            val arr = JSONObject(body.ifBlank { "{}" }).optJSONArray("sessions")
            val list = if (arr == null) emptyList() else (0 until arr.length()).map { arr.getJSONObject(it) }
            val added = store.addSessions(list)
            if (added.isNotEmpty()) onSessions(added)
            "200 OK" to """{"ok":true,"added":${added.size}}"""
        }
        method == "GET" && path == "/ping" -> "200 OK" to """{"ok":true}"""
        else -> "404 Not Found" to """{"error":"no existe"}"""
    }

    companion object {
        const val PORT = 8765
        private const val TAG = "RutinaFoto"
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

package com.juanbagu.rutinafoto

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.DateFormat
import java.util.Date

class MainActivity : ComponentActivity() {
    private val sharedImage = MutableStateFlow<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleShare(intent)
        setContent { MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) { App(sharedImage) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    // "Compartir" una captura desde la galería u otra app → la leemos directamente.
    private fun handleShare(i: Intent?) {
        if (i?.action == Intent.ACTION_SEND && i.type?.startsWith("image/") == true) {
            @Suppress("DEPRECATION")
            val uri = if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            else i.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
            sharedImage.value = uri
        }
    }
}

@Composable
private fun isSystemInDarkTheme() = androidx.compose.foundation.isSystemInDarkTheme()

private enum class Tab { RUTINA, ENTRENOS, AJUSTES }

@Composable
private fun App(sharedImage: MutableStateFlow<Uri?>) {
    val ctx = LocalContext.current
    val store = remember { Store(ctx) }
    var tab by remember { mutableStateOf(if (store.apiKey.isBlank()) Tab.AJUSTES else Tab.RUTINA) }
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(tab == Tab.RUTINA, { tab = Tab.RUTINA }, { Icon(Icons.Filled.Star, null) }, label = { Text("Rutina") })
                NavigationBarItem(tab == Tab.ENTRENOS, { tab = Tab.ENTRENOS }, { Icon(Icons.Filled.List, null) }, label = { Text("Entrenos") })
                NavigationBarItem(tab == Tab.AJUSTES, { tab = Tab.AJUSTES }, { Icon(Icons.Filled.Settings, null) }, label = { Text("Ajustes") })
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (tab) {
                Tab.RUTINA -> RoutineScreen(store, sharedImage)
                Tab.ENTRENOS -> SessionsScreen(store)
                Tab.AJUSTES -> SettingsScreen(store)
            }
        }
    }
}

@Composable
private fun RoutineScreen(store: Store, sharedImage: MutableStateFlow<Uri?>) {
    val ctx = LocalContext.current
    val scope = (ctx as ComponentActivity).lifecycleScope
    var routine by remember { mutableStateOf(store.routine) }
    var warnings by remember { mutableStateOf<List<String>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val bridgeOn by BridgeService.running.collectAsState()
    val shared by sharedImage.collectAsState()

    fun read(uri: Uri) {
        busy = true
        message = null
        scope.launch {
            val r = withContext(Dispatchers.IO) { runCatching { RoutineReader.read(ctx, store.apiKey, uri) } }
            busy = false
            r.onSuccess { routine = it.routine; warnings = it.warnings; message = "Revisa la rutina y pulsa «Enviar al reloj»." }
                .onFailure { message = "No he podido leer la foto: ${it.message}" }
        }
    }

    LaunchedEffect(shared) { shared?.let { read(it); sharedImage.value = null } }

    var photoUri by remember { mutableStateOf<Uri?>(null) }
    val takePhoto = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) photoUri?.let { read(it) } }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { read(it) } }
    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    fun sendToWatch() {
        val r = routine ?: return
        store.routine = r
        if (Build.VERSION.SDK_INT >= 33) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
        BridgeService.start(ctx)
        message = "Lista. En el reloj abre Rutina Foto y pulsa «Recibir del móvil» (con la app Zepp abierta en segundo plano)."
    }

    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Spacer(Modifier.height(12.dp))
            Text("Rutina Foto", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text("Haz una foto de la pizarra o comparte una captura.", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(enabled = !busy, onClick = {
                    val f = File(ctx.cacheDir, "fotos").apply { mkdirs() }.let { File(it, "foto.jpg") }
                    photoUri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fotos", f)
                    takePhoto.launch(photoUri!!)
                }) { Text("Hacer foto") }
                OutlinedButton(enabled = !busy, onClick = {
                    pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }) { Text("Elegir imagen") }
            }
            if (busy) Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 12.dp)) {
                CircularProgressIndicator(Modifier.size(24.dp)); Spacer(Modifier.width(12.dp)); Text("Leyendo la foto…")
            }
            message?.let { Text(it, modifier = Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.primary) }
            if (warnings.isNotEmpty()) Card(Modifier.fillMaxWidth().padding(top = 8.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
                Column(Modifier.padding(12.dp)) {
                    Text("Revisa esto:", fontWeight = FontWeight.Bold)
                    warnings.forEach { Text("• $it") }
                }
            }
        }
        val r = routine
        if (r == null) {
            item { Text("Todavía no hay rutina.", modifier = Modifier.padding(top = 24.dp)) }
        } else {
            item {
                OutlinedTextField(r.name, { routine = r.copy(name = it) }, label = { Text("Nombre de la rutina") }, modifier = Modifier.fillMaxWidth())
            }
            itemsIndexed(r.exercises) { i, e ->
                ExerciseCard(i, e, onChange = { ne -> routine = r.copy(exercises = r.exercises.toMutableList().also { it[i] = ne }) },
                    onDelete = { routine = r.copy(exercises = r.exercises.toMutableList().also { it.removeAt(i) }) })
            }
            item {
                TextButton(onClick = { routine = r.copy(exercises = r.exercises + Exercise("Nuevo ejercicio", 3, "10")) }) {
                    Icon(Icons.Filled.Add, null); Spacer(Modifier.width(4.dp)); Text("Añadir ejercicio")
                }
                Button(onClick = { sendToWatch() }, enabled = r.exercises.isNotEmpty(), modifier = Modifier.fillMaxWidth().height(56.dp)) {
                    Text("Enviar al reloj", style = MaterialTheme.typography.titleMedium)
                }
                OutlinedButton(onClick = {
                    val cm = ctx.getSystemService(ClipboardManager::class.java)
                    cm.setPrimaryClip(ClipData.newPlainText("Rutina", r.toText()))
                    message = "Copiada. Si el reloj no la recibe: app Zepp → Rutina Foto → Ajustes → pega en «Rutina»."
                }, modifier = Modifier.fillMaxWidth()) { Text("Copiar como texto (para Zepp)") }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 8.dp)) {
                    Text(if (bridgeOn) "Conexión con el reloj: activa" else "Conexión con el reloj: parada", Modifier.weight(1f))
                    Switch(bridgeOn, { on -> if (on) BridgeService.start(ctx) else BridgeService.stop(ctx) })
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun ExerciseCard(i: Int, e: Exercise, onChange: (Exercise) -> Unit, onDelete: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${i + 1}.", fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
                OutlinedTextField(e.name, { onChange(e.copy(name = it)) }, singleLine = true, modifier = Modifier.weight(1f))
                IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, "Borrar") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                NumField("Series", e.sets.toString(), Modifier.weight(1f)) { onChange(e.copy(sets = it.toIntOrNull()?.coerceIn(1, 20) ?: e.sets)) }
                OutlinedTextField(e.reps, { onChange(e.copy(reps = it)) }, label = { Text("Reps") }, singleLine = true, modifier = Modifier.weight(1f))
                OutlinedTextField(e.weight, { onChange(e.copy(weight = it)) }, label = { Text("Peso") }, singleLine = true, modifier = Modifier.weight(1.2f))
                NumField("Desc. s", e.rest?.toString() ?: "", Modifier.weight(1f)) { onChange(e.copy(rest = it.toIntOrNull())) }
            }
            if (e.note.isNotBlank()) Text(e.note, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun NumField(label: String, value: String, modifier: Modifier, onChange: (String) -> Unit) {
    OutlinedTextField(value, { v -> onChange(v.filter { it.isDigit() }.take(4)) }, label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = modifier)
}

@Composable
private fun SessionsScreen(store: Store) {
    val ctx = LocalContext.current
    val scope = (ctx as ComponentActivity).lifecycleScope
    val last by BridgeService.lastReceived.collectAsState()
    val sessions = remember(last) { store.sessions() }
    val hw = remember { HealthWriter(ctx) }
    var hcOk by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf<String?>(null) }
    val askHc = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        hcOk = granted.containsAll(HealthWriter.PERMISSIONS)
    }
    LaunchedEffect(Unit) { hcOk = hw.hasPermission() }

    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Spacer(Modifier.height(12.dp))
            Text("Entrenos", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            when {
                !hw.available() -> Text("Health Connect no está disponible en este móvil.")
                !hcOk -> Button(onClick = { askHc.launch(HealthWriter.PERMISSIONS) }) { Text("Permitir guardar en Health Connect") }
                else -> OutlinedButton(onClick = {
                    scope.launch { info = "Guardados en Health Connect: " + hw.writeAll(store.sessions(), store) }
                }) { Text("Guardar pendientes en Health Connect") }
            }
            info?.let { Text(it) }
        }
        if (sessions.isEmpty()) item { Text("Aún no hay entrenos. Cuando termines uno en el reloj aparecerá aquí.") }
        items(sessions) { s ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(s.routine, fontWeight = FontWeight.Bold)
                    Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(s.start)) +
                        " · ${s.activeS / 60} min · ${s.sets} series" + (if (s.hrAvg > 0) " · ♥ ${s.hrAvg}/${s.hrMax}" else "") +
                        (if (store.isSynced(s.start)) " · ✓ Health Connect" else ""), style = MaterialTheme.typography.bodySmall)
                    s.exercises.forEach { e ->
                        val min = ((e.end - e.start) / 60000).toInt()
                        Text("• ${e.name}: ${e.sets}/${e.planned} series · $min min" + (if (e.skipped) " (incompleto)" else ""),
                            style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsScreen(store: Store) {
    var key by remember { mutableStateOf(store.apiKey) }
    var saved by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Ajustes", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("Clave de la API de Claude (para leer las fotos). Se guarda solo en este móvil.")
        OutlinedTextField(key, { key = it; saved = false }, label = { Text("Clave (sk-ant-…)") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        Button(onClick = { store.apiKey = key; saved = true }) { Text(if (saved) "Guardada ✓" else "Guardar") }
        Text("Modelo: ${RoutineReader.MODEL}. Cada foto cuesta en torno a 1–2 céntimos.", style = MaterialTheme.typography.bodySmall)
        HorizontalDivider()
        Text("Cómo funciona", fontWeight = FontWeight.Bold)
        Text("1. Haz la foto o comparte la captura con Rutina Foto.\n2. Revisa la rutina y pulsa «Enviar al reloj».\n" +
            "3. En el reloj, abre Rutina Foto → «Recibir del móvil» → «Empezar».\n" +
            "4. Al terminar, el entreno llega aquí y se guarda en Health Connect.")
    }
}

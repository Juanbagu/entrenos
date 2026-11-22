package com.juanbagu.rutinafoto

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.concurrent.TimeUnit

/**
 * Lee el texto de una imagen EN EL MÓVIL (sin internet y gratis) con ML Kit y lo pasa por el lector de rutinas.
 * Va muy bien con capturas de pantalla; con pizarras o letra a mano es mejor la IA.
 */
object OfflineReader {

    /** Llamar fuera del hilo principal. */
    fun readText(ctx: Context, uri: Uri): String {
        val image = InputImage.fromFilePath(ctx, uri)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
            val result = Tasks.await(recognizer.process(image), 30, TimeUnit.SECONDS)
            return layout(result)
        } finally {
            recognizer.close()
        }
    }

    fun read(ctx: Context, uri: Uri): RoutineReader.Result {
        val text = readText(ctx, uri)
        require(text.isNotBlank()) { "No he encontrado texto en la imagen" }
        return RoutineReader.Result(RoutineParser.parse(text).cleaned(), emptyList(), offline = true, rawText = text)
    }

    data class Row(val top: Int, val bottom: Int, val left: Int, val text: String)

    /**
     * Ordena las líneas de arriba abajo, junta las que están a la misma altura (columnas de una captura)
     * y deja una línea en blanco donde hay un hueco grande: así el lector separa los bloques como en la imagen.
     */
    fun layout(result: Text): String {
        val rows = result.textBlocks.flatMap { b -> b.lines.mapNotNull { l -> l.boundingBox?.let { Row(it.top, it.bottom, it.left, l.text) } } }
        return layoutRows(rows)
    }

    fun layoutRows(lines: List<Row>): String {
        if (lines.isEmpty()) return ""
        val sorted = lines.sortedWith(compareBy({ it.top }, { it.left }))
        val heights = sorted.map { (it.bottom - it.top).coerceAtLeast(1) }.sorted()
        val h = heights[heights.size / 2]
        // Agrupa en filas: misma altura (centros a menos de media línea).
        val grouped = mutableListOf<MutableList<Row>>()
        for (r in sorted) {
            val last = grouped.lastOrNull()
            val c = (r.top + r.bottom) / 2
            if (last != null && kotlin.math.abs(c - (last[0].top + last[0].bottom) / 2) < h / 2) last += r else grouped += mutableListOf(r)
        }
        val sb = StringBuilder()
        var prevBottom = Int.MIN_VALUE
        for (g in grouped) {
            val top = g.minOf { it.top }
            if (prevBottom != Int.MIN_VALUE && top - prevBottom > h * 1.2) sb.append('\n')
            sb.append(g.sortedBy { it.left }.joinToString(" ") { it.text.trim() }).append('\n')
            prevBottom = g.maxOf { it.bottom }
        }
        return sb.toString().trim()
    }
}

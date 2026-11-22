package com.juanbagu.rutinafoto

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import java.time.Instant
import java.time.ZoneId

/** Guarda los entrenos del reloj en Health Connect (los verás en cualquier app de salud). */
class HealthWriter(private val ctx: Context) {

    fun available() = HealthConnectClient.getSdkStatus(ctx) == HealthConnectClient.SDK_AVAILABLE

    suspend fun hasPermission(): Boolean {
        if (!available()) return false
        val granted = HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions()
        return PERMISSIONS.all { it in granted }
    }

    suspend fun writeAll(sessions: List<Session>, store: Store): Int {
        if (!hasPermission()) return 0
        val client = HealthConnectClient.getOrCreate(ctx)
        var n = 0
        sessions.filter { !store.isSynced(it.start) && it.end > it.start }.forEach { s ->
            runCatching {
                client.insertRecords(listOf(toRecord(s)))
                store.markSynced(s.start)
                n++
            }.onFailure { Log.w("RutinaFoto", "Health Connect", it) }
        }
        return n
    }

    private fun toRecord(s: Session): ExerciseSessionRecord {
        val zone = ZoneId.systemDefault()
        val start = Instant.ofEpochMilli(s.start)
        val end = Instant.ofEpochMilli(s.end)
        val notes = buildString {
            s.exercises.forEach { e ->
                append("• ").append(e.name).append(": ").append(e.detail())
                if (e.hrAvg > 0) append(" · ♥").append(e.hrAvg)
                if (e.skipped) append(" (incompleto)")
                appendLine()
            }
            if (s.hrAvg > 0) append("Pulso medio ").append(s.hrAvg).append(", máximo ").append(s.hrMax)
        }.trim().take(1000)
        return ExerciseSessionRecord(
            startTime = start,
            startZoneOffset = zone.rules.getOffset(start),
            endTime = end,
            endZoneOffset = zone.rules.getOffset(end),
            exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
            title = s.routine.take(100),
            notes = notes,
            metadata = Metadata.activelyRecorded(
                device = Device(type = Device.TYPE_WATCH, manufacturer = "Amazfit", model = "Bip Max"),
                clientRecordId = "rutinafoto-${s.start}",
            ),
        )
    }

    companion object {
        val PERMISSIONS = setOf(HealthPermission.getWritePermission(ExerciseSessionRecord::class))
    }
}

package com.indoorplayer.cec

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class CecModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(
    reactContext,
) {
    companion object {
        private const val TAG =
            "INDOOR_CEC"
    }

    private val appContext: Context =
        reactContext.applicationContext

    private val cecExecutor =
        CecCommandExecutor(
            appContext,
        )

    private val logFile: File by lazy {
        val directory =
            appContext.getExternalFilesDir(
                null,
            ) ?: appContext.filesDir

        File(
            directory,
            "cec-power-events.log",
        )
    }

    override fun getName(): String =
        "CecModule"

    @ReactMethod
    fun turnOn(
        reason: String,
        occurrenceId: String?,
        promise: Promise,
    ) {
        executeCommand(
            action = "ON",
            reason = reason,
            occurrenceId = occurrenceId,
            promise = promise,
        ) {
            cecExecutor.turnOn()
        }
    }

    @ReactMethod
    fun standby(
        reason: String,
        occurrenceId: String?,
        promise: Promise,
    ) {
        executeCommand(
            action = "STANDBY",
            reason = reason,
            occurrenceId = occurrenceId,
            promise = promise,
        ) {
            cecExecutor.standby()
        }
    }

    @ReactMethod
    fun diagnose(
        promise: Promise,
    ) {
        executeCommand(
            action = "DIAGNOSE",
            reason = "MANUAL_DIAGNOSE",
            occurrenceId = null,
            promise = promise,
        ) {
            cecExecutor.diagnose()
        }
    }

    @ReactMethod
    fun queryPowerStatus(
        promise: Promise,
    ) {
        Thread {
            val action =
                "QUERY_POWER_STATUS"

            writeLog(
                buildLogLine(
                    phase = "REQUEST",
                    action = action,
                    reason = "WATCHDOG_CHECK",
                    occurrenceId = null,
                    detail = "",
                ),
            )

            try {
                val status =
                    cecExecutor.queryPowerStatus()

                writeLog(
                    buildLogLine(
                        phase = "SUCCESS",
                        action = action,
                        reason = "WATCHDOG_CHECK",
                        occurrenceId = null,
                        detail = status ?: "UNKNOWN",
                    ),
                )

                promise.resolve(
                    status,
                )
            } catch (error: Throwable) {
                writeLog(
                    buildLogLine(
                        phase = "ERROR",
                        action = action,
                        reason = "WATCHDOG_CHECK",
                        occurrenceId = null,
                        detail =
                            error.message
                                ?: error.javaClass.name,
                    ),
                )

                promise.reject(
                    "CEC_QUERY_POWER_STATUS_FAILED",
                    error.message,
                    error,
                )
            }
        }.start()
    }

    private fun executeCommand(
        action: String,
        reason: String,
        occurrenceId: String?,
        promise: Promise,
        operation: () -> CecCommandResult,
    ) {
        Thread {
            writeLog(
                buildLogLine(
                    phase = "REQUEST",
                    action = action,
                    reason = reason,
                    occurrenceId = occurrenceId,
                    detail = "",
                ),
            )

            try {
                val result =
                    operation()

                writeLog(
                    buildLogLine(
                        phase = "SUCCESS",
                        action = action,
                        reason = reason,
                        occurrenceId = occurrenceId,
                        detail = result.output,
                    ),
                )

                promise.resolve(
                    createResultMap(
                        result,
                    ),
                )
            } catch (error: Throwable) {
                writeLog(
                    buildLogLine(
                        phase = "ERROR",
                        action = action,
                        reason = reason,
                        occurrenceId = occurrenceId,
                        detail =
                            error.message
                                ?: error.javaClass.name,
                    ),
                )

                promise.reject(
                    "CEC_COMMAND_FAILED",
                    error.message,
                    error,
                )
            }
        }.start()
    }

    private fun createResultMap(
        result: CecCommandResult,
    ) =
        Arguments
            .createMap()
            .apply {
                putString(
                    "action",
                    result.action,
                )

                putString(
                    "executable",
                    result.executable,
                )

                putString(
                    "output",
                    result.output,
                )

                putString(
                    "logPath",
                    logFile.absolutePath,
                )
            }

    private fun buildLogLine(
        phase: String,
        action: String,
        reason: String,
        occurrenceId: String?,
        detail: String,
    ): String =
        buildString {
            append(
                getCurrentTimestamp(),
            )

            append(
                " phase=",
            )

            append(
                phase,
            )

            append(
                " action=",
            )

            append(
                action,
            )

            append(
                " reason=",
            )

            append(
                sanitizeLogValue(
                    reason,
                ),
            )

            append(
                " occurrenceId=",
            )

            append(
                occurrenceId ?: "null",
            )

            if (detail.isNotBlank()) {
                append(
                    " detail=",
                )

                append(
                    sanitizeLogValue(
                        detail,
                    ),
                )
            }
        }

    private fun writeLog(
        line: String,
    ) {
        Log.i(
            TAG,
            line,
        )

        try {
            logFile
                .parentFile
                ?.mkdirs()

            logFile.appendText(
                "$line\n",
            )
        } catch (error: Throwable) {
            Log.e(
                TAG,
                "Falha ao salvar log persistente.",
                error,
            )
        }
    }

    private fun sanitizeLogValue(
        value: String,
    ): String =
        value
            .replace(
                '\n',
                ' ',
            )
            .replace(
                '\r',
                ' ',
            )
            .trim()

    private fun getCurrentTimestamp(): String {
        val formatter =
            SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                Locale.US,
            )

        formatter.timeZone =
            TimeZone.getTimeZone(
                "UTC",
            )

        return formatter.format(
            Date(),
        )
    }
}
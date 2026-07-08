package com.indoorplayer.cec

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.time.Instant

class CecModule(
    reactContext:
        ReactApplicationContext,
) : ReactContextBaseJavaModule(
    reactContext,
) {

    companion object {
        private const val TAG =
            "INDOOR_CEC"
    }

    private val appContext:
        Context =
        reactContext.applicationContext

    private val executor =
        CecCommandExecutor(
            appContext,
        )

    private val logFile:
        File by lazy {
        val directory =
            appContext
                .getExternalFilesDir(
                    null,
                )
                ?: appContext.filesDir

        File(
            directory,
            "cec-power-events.log",
        )
    }

    override fun getName():
        String =
        "CecModule"

    @ReactMethod
    fun turnOn(
        reason:
            String,

        occurrenceId:
            String?,

        promise:
            Promise,
    ) {
        execute(
            action = "ON",
            reason = reason,
            occurrenceId = occurrenceId,
            promise = promise,
        ) {
            executor.turnOn()
        }
    }

    @ReactMethod
    fun standby(
        reason:
            String,

        occurrenceId:
            String?,

        promise:
            Promise,
    ) {
        execute(
            action = "STANDBY",
            reason = reason,
            occurrenceId = occurrenceId,
            promise = promise,
        ) {
            executor.standby()
        }
    }

    @ReactMethod
    fun diagnose(
        promise:
            Promise,
    ) {
        execute(
            action = "DIAGNOSE",
            reason = "MANUAL_DIAGNOSE",
            occurrenceId = null,
            promise = promise,
        ) {
            executor.diagnose()
        }
    }

    private fun execute(
        action:
            String,

        reason:
            String,

        occurrenceId:
            String?,

        promise:
            Promise,

        operation:
            () -> CecCommandResult,
    ) {
        Thread {
            val requestLine =
                buildLogLine(
                    phase = "REQUEST",
                    action = action,
                    reason = reason,
                    occurrenceId = occurrenceId,
                    detail = "",
                )

            writeLog(
                requestLine,
            )

            try {
                val result =
                    operation()

                val successLine =
                    buildLogLine(
                        phase = "SUCCESS",
                        action = action,
                        reason = reason,
                        occurrenceId = occurrenceId,
                        detail = result.output,
                    )

                writeLog(
                    successLine,
                )

                val response =
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

                promise.resolve(
                    response,
                )
            } catch (
                error:
                    Throwable
            ) {
                val errorLine =
                    buildLogLine(
                        phase = "ERROR",
                        action = action,
                        reason = reason,
                        occurrenceId = occurrenceId,
                        detail =
                            error.message
                                ?: error
                                    .javaClass
                                    .name,
                    )

                writeLog(
                    errorLine,
                )

                promise.reject(
                    "CEC_COMMAND_FAILED",
                    error.message,
                    error,
                )
            }
        }.start()
    }

    private fun buildLogLine(
        phase:
            String,

        action:
            String,

        reason:
            String,

        occurrenceId:
            String?,

        detail:
            String,
    ): String =
        buildString {
            append(
                Instant
                    .now()
                    .toString(),
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
                reason,
            )

            append(
                " occurrenceId=",
            )

            append(
                occurrenceId
                    ?: "null",
            )

            if (
                detail.isNotBlank()
            ) {
                append(
                    " detail=",
                )

                append(
                    detail.replace(
                        '\n',
                        ' ',
                    ),
                )
            }
        }

    private fun writeLog(
        line:
            String,
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
        } catch (
            error:
                Throwable
        ) {
            Log.e(
                TAG,
                "Falha ao salvar log persistente.",
                error,
            )
        }
    }
}

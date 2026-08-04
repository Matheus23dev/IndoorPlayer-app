package com.indoorplayer.cec

import android.content.Context
import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

data class CecCommandResult(
    val action: String,
    val executable: String,
    val output: String,
    val logPath: String,
)

class CecCommandExecutor(
    private val context: Context,
) {
    companion object {
        private const val TAG =
            "INDOOR_CEC"

        private const val EXECUTABLE =
            "app_process"

        private const val LOG_PATH =
            "/data/local/tmp/indoor-cec.log"
    }

    private val helperClassName =
        CecControl::class.java.name

    fun turnOn(): CecCommandResult =
        execute(
            action = "ON",
            helperAction = "on",
            timeoutSeconds = 15,
        )

    fun standby(): CecCommandResult =
        execute(
            action = "STANDBY",
            helperAction = "off",
            timeoutSeconds = 10,
        )

    fun diagnose(): CecCommandResult =
        execute(
            action = "DIAGNOSE",
            helperAction = "status",
            timeoutSeconds = 10,
        )

    fun queryPowerStatus(): String? {
        val result =
            execute(
                action = "QUERY_POWER_STATUS",
                helperAction = "status",
                timeoutSeconds = 10,
            )

        return parsePowerStatus(
            result.output,
        )
    }

    private fun execute(
        action: String,
        helperAction: String,
        timeoutSeconds: Long,
    ): CecCommandResult {
        val apkPath =
            context
                .applicationInfo
                .sourceDir

        if (apkPath.isNullOrBlank()) {
            throw IllegalStateException(
                "Não foi possível localizar o APK instalado.",
            )
        }

        val command =
            buildCommand(
                apkPath = apkPath,
                helperAction = helperAction,
            )

        Log.i(
            TAG,
            "Executando action=$action por $EXECUTABLE. command=$command",
        )

        val process =
            try {
                ProcessBuilder(
                    "su",
                    "-c",
                    command,
                )
                    .redirectErrorStream(true)
                    .start()
            } catch (error: Exception) {
                throw IllegalStateException(
                    "Falha ao iniciar comando CEC $action. Verifique se o TV Box possui root.",
                    error,
                )
            }

        val output =
            readProcessOutput(
                process,
            )

        val finished =
            process.waitFor(
                timeoutSeconds,
                TimeUnit.SECONDS,
            )

        if (!finished) {
            process.destroyForcibly()

            throw IllegalStateException(
                "Tempo limite ao executar comando CEC $action: $output",
            )
        }

        val exitCode =
            process.exitValue()

        if (exitCode != 0) {
            throw IllegalStateException(
                "Comando CEC $action falhou com código $exitCode: $output",
            )
        }

        Log.i(
            TAG,
            "Finalizado action=$action output=$output",
        )

        return CecCommandResult(
            action = action,
            executable = EXECUTABLE,
            output = output,
            logPath = LOG_PATH,
        )
    }

    private fun buildCommand(
        apkPath: String,
        helperAction: String,
    ): String {
        return listOf(
            "export CLASSPATH=${shellQuote(apkPath)}",
            "exec $EXECUTABLE /system/bin $helperClassName ${shellQuote(helperAction)}",
        ).joinToString("; ")
    }

    private fun readProcessOutput(
        process: Process,
    ): String {
        return try {
            BufferedReader(
                InputStreamReader(
                    process.inputStream,
                ),
            ).use {
                it.readText()
            }.trim()
        } catch (error: Exception) {
            Log.e(
                TAG,
                "Erro ao ler saída do comando CEC.",
                error,
            )

            ""
        }
    }

    private fun parsePowerStatus(
        output: String,
    ): String? {
        val normalized =
            output
                .trim()
                .uppercase()

        if (normalized.isBlank()) {
            return null
        }

        return when {
            normalized.contains("TRANSIENT_TO_ON") ->
                "TRANSIENT_TO_ON"

            normalized.contains("TRANSIENT_TO_STANDBY") ->
                "TRANSIENT_TO_STANDBY"

            normalized.contains("STANDBY") ->
                "STANDBY"

            normalized.contains("ON") ->
                "ON"

            normalized.contains("UNKNOWN") ->
                "UNKNOWN"

            else ->
                normalized
        }
    }

    private fun shellQuote(
        value: String,
    ): String {
        return "'" +
            value.replace(
                "'",
                "'\"'\"'",
            ) +
            "'"
    }
}
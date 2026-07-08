package com.indoorplayer.cec

import android.content.Context
import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

data class CecCommandResult(
    val action:
        String,

    val executable:
        String,

    val output:
        String,
)

class CecCommandExecutor(
    private val context:
        Context,
) {

    companion object {
        private const val TAG =
            "INDOOR_CEC"
    }

    fun turnOn():
        CecCommandResult =
        execute(
            action = "ON",
            helperAction = "on",
            timeoutSeconds = 15,
        )

    fun standby():
        CecCommandResult =
        execute(
            action = "STANDBY",
            helperAction = "off",
            timeoutSeconds = 10,
        )

    fun diagnose():
        CecCommandResult =
        execute(
            action = "DIAGNOSE",
            helperAction = "status",
            timeoutSeconds = 10,
        )

    private fun execute(
        action:
            String,

        helperAction:
            String,

        timeoutSeconds:
            Long,
    ): CecCommandResult {
        val apkPath =
            context
                .applicationInfo
                .sourceDir

        if (
            apkPath.isNullOrBlank()
        ) {
            throw IllegalStateException(
                "Não foi possível localizar o APK instalado.",
            )
        }

        val command =
            "export CLASSPATH=${shellQuote(apkPath)}; " +
                "exec app_process /system/bin " +
                "com.indoorplayer.cec.CecControl " +
                helperAction

        Log.i(
            TAG,
            "Executando action=$action por app_process.",
        )

        val process =
            ProcessBuilder(
                "su",
                "-c",
                command,
            )
                .redirectErrorStream(
                    true,
                )
                .start()

        val finished =
            process.waitFor(
                timeoutSeconds,
                TimeUnit.SECONDS,
            )

        if (!finished) {
            process.destroyForcibly()

            throw IllegalStateException(
                "Tempo limite ao executar comando CEC $action.",
            )
        }

        val output =
            BufferedReader(
                InputStreamReader(
                    process.inputStream,
                ),
            )
                .use {
                    it.readText()
                }
                .trim()

        val exitCode =
            process.exitValue()

        if (exitCode != 0) {
            throw IllegalStateException(
                "Comando CEC $action falhou " +
                    "(código $exitCode): $output",
            )
        }

        Log.i(
            TAG,
            "Finalizado action=$action output=$output",
        )

        return CecCommandResult(
            action = action,
            executable = "app_process",
            output = output,
        )
    }

    private fun shellQuote(
        value:
            String,
    ): String =
        "'" +
            value.replace(
                "'",
                "'\\''",
            ) +
            "'"
}

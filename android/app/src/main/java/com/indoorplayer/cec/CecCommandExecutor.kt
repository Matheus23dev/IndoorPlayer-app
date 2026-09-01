package com.indoorplayer.cec

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

data class CecCommandResult(
    val action: String,
    val executable: String,
    val executionMode: String,
    val output: String,
    val logPath: String,
)

data class CecCapabilities(
    val android: Boolean,
    val hdmiCecFeature: Boolean,
    val hdmiCecPermissionGranted: Boolean,
    val privilegedApp: Boolean,
    val rootFallbackAvailable: Boolean,
    val executionMode: String,
)

class CecCommandExecutor(
    private val context: Context,
) {
    companion object {
        private const val TAG = "INDOOR_CEC"
        private const val APP_PROCESS_PATH = "/system/bin/app_process"
        private const val CEC_PERMISSION = "android.permission.HDMI_CEC"
        private const val CEC_FEATURE = "android.hardware.hdmi.cec"
        private const val LOG_PATH = "/data/local/tmp/indoor-cec.log"
        private const val MODE_PRIVILEGED_APP = "PRIVILEGED_APP"
        private const val MODE_ROOT_FALLBACK = "ROOT_FALLBACK"
        private const val MODE_UNAVAILABLE = "UNAVAILABLE"

        private val SU_CANDIDATES =
            listOf(
                "/system/bin/su",
                "/system/xbin/su",
                "/sbin/su",
                "/su/bin/su",
            )
    }

    private val helperClassName = CecControl::class.java.name

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

    fun getCapabilities(): CecCapabilities {
        val permissionGranted = hasCecPermission()
        val rootExecutable = findRootExecutable()

        return CecCapabilities(
            android = true,
            hdmiCecFeature =
                context.packageManager.hasSystemFeature(
                    CEC_FEATURE,
                ),
            hdmiCecPermissionGranted = permissionGranted,
            privilegedApp = isPrivilegedApp(),
            rootFallbackAvailable = rootExecutable != null,
            executionMode =
                when {
                    permissionGranted -> MODE_PRIVILEGED_APP
                    rootExecutable != null -> MODE_ROOT_FALLBACK
                    else -> MODE_UNAVAILABLE
                },
        )
    }

    private fun execute(
        action: String,
        helperAction: String,
        timeoutSeconds: Long,
    ): CecCommandResult {
        val apkPath =
            context.applicationInfo.sourceDir
                ?.takeIf {
                    it.isNotBlank()
                }
                ?: throw IllegalStateException(
                    "Não foi possível localizar o APK instalado.",
                )

        val capabilities = getCapabilities()

        Log.i(
            TAG,
            "Executando action=$action mode=${capabilities.executionMode}.",
        )

        return when (capabilities.executionMode) {
            MODE_PRIVILEGED_APP ->
                executeWithPrivilegedApp(
                    action = action,
                    helperAction = helperAction,
                    apkPath = apkPath,
                    timeoutSeconds = timeoutSeconds,
                )

            MODE_ROOT_FALLBACK ->
                executeWithRootFallback(
                    action = action,
                    helperAction = helperAction,
                    apkPath = apkPath,
                    timeoutSeconds = timeoutSeconds,
                    rootExecutable =
                        checkNotNull(
                            findRootExecutable(),
                        ),
                )

            else ->
                throw IllegalStateException(
                    "Controle HDMI-CEC indisponível. Provisione o Indoor Player " +
                        "como aplicativo privilegiado e conceda $CEC_PERMISSION.",
                )
        }
    }

    private fun executeWithPrivilegedApp(
        action: String,
        helperAction: String,
        apkPath: String,
        timeoutSeconds: Long,
    ): CecCommandResult {
        val processBuilder =
            ProcessBuilder(
                APP_PROCESS_PATH,
                "/system/bin",
                helperClassName,
                helperAction,
            ).redirectErrorStream(
                true,
            )

        processBuilder.environment()["CLASSPATH"] = apkPath

        return executeProcess(
            action = action,
            executable = APP_PROCESS_PATH,
            executionMode = MODE_PRIVILEGED_APP,
            processBuilder = processBuilder,
            timeoutSeconds = timeoutSeconds,
        )
    }

    private fun executeWithRootFallback(
        action: String,
        helperAction: String,
        apkPath: String,
        timeoutSeconds: Long,
        rootExecutable: String,
    ): CecCommandResult {
        val command =
            listOf(
                "export CLASSPATH=${shellQuote(apkPath)}",
                "exec $APP_PROCESS_PATH /system/bin $helperClassName ${shellQuote(helperAction)}",
            ).joinToString(
                "; ",
            )

        return executeProcess(
            action = action,
            executable = rootExecutable,
            executionMode = MODE_ROOT_FALLBACK,
            processBuilder =
                ProcessBuilder(
                    rootExecutable,
                    "-c",
                    command,
                ).redirectErrorStream(
                    true,
                ),
            timeoutSeconds = timeoutSeconds,
        )
    }

    private fun executeProcess(
        action: String,
        executable: String,
        executionMode: String,
        processBuilder: ProcessBuilder,
        timeoutSeconds: Long,
    ): CecCommandResult {
        val process =
            try {
                processBuilder.start()
            } catch (error: Exception) {
                throw IllegalStateException(
                    "Falha ao iniciar o comando HDMI-CEC $action no modo $executionMode.",
                    error,
                )
            }

        val outputReader = ProcessOutputReader(process)

        outputReader.start()

        val finished =
            process.waitFor(
                timeoutSeconds,
                TimeUnit.SECONDS,
            )

        if (!finished) {
            process.destroyForcibly()
            outputReader.join(1_000)

            throw IllegalStateException(
                "Tempo limite ao executar o comando HDMI-CEC $action: ${outputReader.output}",
            )
        }

        outputReader.join(1_000)

        val output = outputReader.output
        val exitCode = process.exitValue()

        if (exitCode != 0) {
            throw IllegalStateException(
                "Comando HDMI-CEC $action falhou com código $exitCode: $output",
            )
        }

        Log.i(
            TAG,
            "Finalizado action=$action mode=$executionMode output=$output",
        )

        return CecCommandResult(
            action = action,
            executable = executable,
            executionMode = executionMode,
            output = output,
            logPath = LOG_PATH,
        )
    }

    private fun hasCecPermission(): Boolean =
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            context.packageManager.checkPermission(
                CEC_PERMISSION,
                context.packageName,
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            context.checkSelfPermission(
                CEC_PERMISSION,
            ) == PackageManager.PERMISSION_GRANTED
        }

    @Suppress("DEPRECATION")
    private fun isPrivilegedApp(): Boolean =
        context.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0 ||
            context.applicationInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP != 0 ||
            context.applicationInfo.sourceDir?.startsWith(
                "/system/priv-app/",
            ) == true

    private fun findRootExecutable(): String? =
        SU_CANDIDATES.firstOrNull {
            File(it).canExecute()
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
            normalized.contains("TRANSIENT_TO_ON") -> "TRANSIENT_TO_ON"
            normalized.contains("TRANSIENT_TO_STANDBY") -> "TRANSIENT_TO_STANDBY"
            normalized.contains("STANDBY") -> "STANDBY"
            normalized.contains("ON") -> "ON"
            normalized.contains("UNKNOWN") -> "UNKNOWN"
            else -> normalized
        }
    }

    private fun shellQuote(
        value: String,
    ): String =
        "'" +
            value.replace(
                "'",
                "'\"'\"'",
            ) +
            "'"

    private class ProcessOutputReader(
        private val process: Process,
    ) : Thread(
            "indoor-cec-output",
        ) {
        @Volatile
        var output: String = ""
            private set

        override fun run() {
            output =
                try {
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
                        "Erro ao ler a saída do comando HDMI-CEC.",
                        error,
                    )

                    ""
                }
        }
    }
}

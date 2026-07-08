package com.indoorplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(
        context: Context,
        intent: Intent?,
    ) {
        val action = intent?.action

        Log.i(
            "BOOT_RECEIVER",
            "Evento recebido: $action",
        )

        val isBootCompleted =
            action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON"

        if (!isBootCompleted) {
            return
        }

        val launchIntent =
            context.packageManager
                .getLaunchIntentForPackage(
                    context.packageName,
                )
                ?.apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP,
                    )
                }

        if (launchIntent == null) {
            Log.e(
                "BOOT_RECEIVER",
                "Não foi possível encontrar a MainActivity.",
            )

            return
        }

        try {
            context.startActivity(
                launchIntent,
            )

            Log.i(
                "BOOT_RECEIVER",
                "IndoorPlayer iniciado automaticamente.",
            )
        } catch (error: Exception) {
            Log.e(
                "BOOT_RECEIVER",
                "Erro ao iniciar o IndoorPlayer.",
                error,
            )
        }
    }
}
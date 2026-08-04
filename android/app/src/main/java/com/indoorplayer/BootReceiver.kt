package com.indoorplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG =
            "BOOT_RECEIVER"

        private const val QUICKBOOT_POWERON =
            "android.intent.action.QUICKBOOT_POWERON"

        private const val HTC_QUICKBOOT_POWERON =
            "com.htc.intent.action.QUICKBOOT_POWERON"
    }

    override fun onReceive(
        context: Context,
        intent: Intent?,
    ) {
        val action =
            intent?.action

        Log.i(
            TAG,
            "Evento recebido: $action",
        )

        if (!isBootAction(action)) {
            return
        }

        val launchIntent =
            createLaunchIntent(context)

        try {
            context.startActivity(
                launchIntent,
            )

            Log.i(
                TAG,
                "IndoorPlayer iniciado automaticamente.",
            )
        } catch (error: Exception) {
            Log.e(
                TAG,
                "Erro ao iniciar o IndoorPlayer.",
                error,
            )
        }
    }

    private fun isBootAction(
        action: String?,
    ): Boolean {
        return (
            action == Intent.ACTION_BOOT_COMPLETED ||
            action == QUICKBOOT_POWERON ||
            action == HTC_QUICKBOOT_POWERON
        )
    }

    private fun createLaunchIntent(
        context: Context,
    ): Intent {
        val packageLaunchIntent =
            context.packageManager
                .getLaunchIntentForPackage(
                    context.packageName,
                )

        val launchIntent =
            packageLaunchIntent
                ?: Intent(
                    context,
                    MainActivity::class.java,
                )

        return launchIntent.apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP,
            )
        }
    }
}
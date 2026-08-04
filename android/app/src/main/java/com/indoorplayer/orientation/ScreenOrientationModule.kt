package com.indoorplayer.orientation

import android.content.pm.ActivityInfo
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScreenOrientationModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(
        reactContext,
    ) {
    override fun getName(): String = NAME

    @ReactMethod
    fun setOrientation(
        orientation: String,
        promise: Promise,
    ) {
        val activity = reactApplicationContext.currentActivity

        if (activity == null) {
            promise.reject(
                "ACTIVITY_UNAVAILABLE",
                "A tela do player ainda não está disponível.",
            )

            return
        }

        val requestedOrientation =
            when (orientation) {
                "PORTRAIT" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                "LANDSCAPE" -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                else -> {
                    promise.reject(
                        "INVALID_ORIENTATION",
                        "Orientação inválida: $orientation",
                    )

                    return
                }
            }

        activity.runOnUiThread {
            activity.requestedOrientation = requestedOrientation
            promise.resolve(orientation)
        }
    }

    companion object {
        const val NAME = "ScreenOrientation"
    }
}

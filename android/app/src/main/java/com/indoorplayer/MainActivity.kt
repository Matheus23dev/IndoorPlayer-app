package com.indoorplayer

import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
    private val mainHandler =
        Handler(
            Looper.getMainLooper(),
        )

    override fun onCreate(
        savedInstanceState: Bundle?,
    ) {
        super.onCreate(
            savedInstanceState,
        )

        keepScreenOn()
        hideSystemBars()
        scheduleHideSystemBars()
    }

    override fun onResume() {
        super.onResume()

        keepScreenOn()
        hideSystemBars()
        scheduleHideSystemBars()
    }

    override fun onWindowFocusChanged(
        hasFocus: Boolean,
    ) {
        super.onWindowFocusChanged(
            hasFocus,
        )

        if (hasFocus) {
            hideSystemBars()
            scheduleHideSystemBars()
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(
            null,
        )

        super.onDestroy()
    }

    private fun keepScreenOn() {
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
        )
    }

    private fun scheduleHideSystemBars() {
        mainHandler.postDelayed(
            {
                hideSystemBars()
            },
            500,
        )

        mainHandler.postDelayed(
            {
                hideSystemBars()
            },
            1_500,
        )
    }

    private fun hideSystemBars() {
        if (
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.R
        ) {
            window.insetsController
                ?.let { controller ->
                    controller.hide(
                        WindowInsets.Type.statusBars() or
                            WindowInsets.Type.navigationBars(),
                    )

                    controller.systemBarsBehavior =
                        WindowInsetsController
                            .BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }

            return
        }

        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }

    override fun getMainComponentName(): String =
        "IndoorPlayer"

    override fun createReactActivityDelegate():
        ReactActivityDelegate =
        DefaultReactActivityDelegate(
            this,
            mainComponentName,
            fabricEnabled,
        )
}
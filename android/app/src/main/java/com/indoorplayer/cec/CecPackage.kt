package com.indoorplayer.cec

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class CecPackage :
    ReactPackage {

    override fun createNativeModules(
        reactContext:
            ReactApplicationContext,
    ): List<NativeModule> =
        listOf(
            CecModule(
                reactContext,
            ),
        )

    override fun createViewManagers(
        reactContext:
            ReactApplicationContext,
    ): List<ViewManager<*, *>> =
        emptyList()
}
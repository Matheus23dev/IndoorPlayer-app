package com.indoorplayer.cec;

import android.content.Context;
import android.os.Looper;
import android.util.Log;

import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

public final class CecControl {

    private static final String TAG =
        "INDOOR_CEC";

    private CecControl() {
    }

    public static void main(
        String[] args
    ) {
        try {
            prepareLooper();

            final String action =
                args.length > 0
                    ? args[0]
                        .trim()
                        .toLowerCase()
                    : "status";

            Log.i(
                TAG,
                "CecControl iniciado. action=" +
                    action
            );

            final Context context =
                getSystemContext();

            final Object manager =
                context.getSystemService(
                    "hdmi_control"
                );

            if (
                manager == null
            ) {
                throw new IllegalStateException(
                    "Serviço hdmi_control não encontrado."
                );
            }

            final Method getPlaybackClient =
                manager
                    .getClass()
                    .getMethod(
                        "getPlaybackClient"
                    );

            final Object playbackClient =
                getPlaybackClient.invoke(
                    manager
                );

            if (
                playbackClient == null
            ) {
                throw new IllegalStateException(
                    "HdmiPlaybackClient não disponível."
                );
            }

            switch (
                action
            ) {
                case "on":
                    turnOn(
                        playbackClient
                    );

                    break;

                case "off":
                case "standby":
                    turnOff(
                        playbackClient
                    );

                    break;

                case "status":
                    printStatus(
                        manager,
                        playbackClient
                    );

                    break;

                default:
                    throw new IllegalArgumentException(
                        "Ação CEC inválida: " +
                            action
                    );
            }

            Log.i(
                TAG,
                "CecControl concluído. action=" +
                    action
            );
        } catch (
            Throwable error
        ) {
            Log.e(
                TAG,
                "Falha no CecControl.",
                error
            );

            System.err.println(
                "[CEC] Falha: " +
                    error
            );

            error.printStackTrace(
                System.err
            );

            System.exit(
                1
            );
        }
    }

    private static void prepareLooper() {
        if (
            Looper.myLooper() ==
                null
        ) {
            Looper.prepare();
        }
    }

    private static Context getSystemContext()
        throws Exception {
        final Class<?> activityThreadClass =
            Class.forName(
                "android.app.ActivityThread"
            );

        final Method systemMain =
            activityThreadClass
                .getDeclaredMethod(
                    "systemMain"
                );

        systemMain.setAccessible(
            true
        );

        final Object activityThread =
            systemMain.invoke(
                null
            );

        final Method getSystemContext =
            activityThreadClass
                .getDeclaredMethod(
                    "getSystemContext"
                );

        getSystemContext.setAccessible(
            true
        );

        return (
            Context
        ) getSystemContext.invoke(
            activityThread
        );
    }

    private static void turnOn(
        Object playbackClient
    ) throws Exception {
        Log.i(
            TAG,
            "Enviando One Touch Play."
        );

        final Class<?> callbackClass =
            Class.forName(
                "android.hardware.hdmi." +
                    "HdmiPlaybackClient$" +
                    "OneTouchPlayCallback"
            );

        final Object callback =
            Proxy.newProxyInstance(
                callbackClass
                    .getClassLoader(),

                new Class<?>[] {
                    callbackClass,
                },

                (
                    proxy,
                    method,
                    args
                ) -> {
                    if (
                        "onComplete".equals(
                            method.getName()
                        )
                    ) {
                        final Object result =
                            args != null &&
                            args.length > 0
                                ? args[0]
                                : "desconhecido";

                        Log.i(
                            TAG,
                            "One Touch Play concluído. result=" +
                                result
                        );

                        System.out.println(
                            "[CEC] One Touch Play concluído. Resultado: " +
                                result
                        );
                    }

                    return null;
                }
            );

        final Method oneTouchPlay =
            playbackClient
                .getClass()
                .getMethod(
                    "oneTouchPlay",
                    callbackClass
                );

        oneTouchPlay.invoke(
            playbackClient,
            callback
        );

        System.out.println(
            "[CEC] Comando One Touch Play enviado."
        );

        Thread.sleep(
            5_000
        );
    }

    private static void turnOff(
        Object playbackClient
    ) throws Exception {
        Log.i(
            TAG,
            "Enviando standby para a TV."
        );

        final Method sendStandby =
            playbackClient
                .getClass()
                .getMethod(
                    "sendStandby"
                );

        sendStandby.invoke(
            playbackClient
        );

        System.out.println(
            "[CEC] Comando standby enviado para a TV."
        );

        Thread.sleep(
            2_000
        );
    }

    private static void printStatus(
        Object manager,
        Object playbackClient
    ) {
        final String message =
            "[CEC] Serviço: " +
                manager
                    .getClass()
                    .getName() +
                " Playback client: " +
                playbackClient
                    .getClass()
                    .getName() +
                " Controle disponível.";

        Log.i(
            TAG,
            message
        );

        System.out.println(
            message
        );
    }
}

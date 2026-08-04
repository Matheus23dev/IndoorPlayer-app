package com.indoorplayer.cec;

import android.content.Context;
import android.os.Looper;
import android.util.Log;

import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public final class CecControl {
    private static final String TAG =
        "INDOOR_CEC";

    private static final long CALLBACK_TIMEOUT_SECONDS =
        6L;

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

            if (manager == null) {
                throw new IllegalStateException(
                    "Serviço hdmi_control não encontrado."
                );
            }

            final Object playbackClient =
                getPlaybackClient(
                    manager
                );

            if (playbackClient == null) {
                throw new IllegalStateException(
                    "HdmiPlaybackClient não disponível."
                );
            }

            switch (action) {
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
        } catch (Throwable error) {
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
        if (Looper.myLooper() == null) {
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

        return (Context) getSystemContext.invoke(
            activityThread
        );
    }

    private static Object getPlaybackClient(
        Object manager
    ) throws Exception {
        final Method getPlaybackClient =
            manager
                .getClass()
                .getMethod(
                    "getPlaybackClient"
                );

        return getPlaybackClient.invoke(
            manager
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

        final CountDownLatch latch =
            new CountDownLatch(
                1
            );

        final AtomicInteger callbackResult =
            new AtomicInteger(
                Integer.MIN_VALUE
            );

        final Object callback =
            Proxy.newProxyInstance(
                callbackClass.getClassLoader(),
                new Class<?>[] {
                    callbackClass,
                },
                (
                    proxy,
                    method,
                    callbackArgs
                ) -> {
                    if (
                        "onComplete".equals(
                            method.getName()
                        )
                    ) {
                        final int result =
                            getIntArg(
                                callbackArgs,
                                0,
                                Integer.MIN_VALUE
                            );

                        callbackResult.set(
                            result
                        );

                        Log.i(
                            TAG,
                            "One Touch Play concluído. result=" +
                                result
                        );

                        System.out.println(
                            "[CEC] One Touch Play concluído. Resultado: " +
                                result
                        );

                        latch.countDown();
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

        latch.await(
            CALLBACK_TIMEOUT_SECONDS,
            TimeUnit.SECONDS
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
    ) throws Exception {
        final String powerStatus =
            queryDisplayStatus(
                playbackClient
            );

        final String message =
            "[CEC] Serviço: " +
                manager
                    .getClass()
                    .getName() +
                " Playback client: " +
                playbackClient
                    .getClass()
                    .getName() +
                " Status: " +
                powerStatus;

        Log.i(
            TAG,
            message
        );

        /*
         * Importante:
         * A última linha simples facilita o parser
         * do CecCommandExecutor.
         */
        System.out.println(
            message
        );

        System.out.println(
            powerStatus
        );
    }

    private static String queryDisplayStatus(
        Object playbackClient
    ) {
        try {
            final Class<?> callbackClass =
                Class.forName(
                    "android.hardware.hdmi." +
                        "HdmiPlaybackClient$" +
                        "DisplayStatusCallback"
                );

            final CountDownLatch latch =
                new CountDownLatch(
                    1
                );

            final AtomicInteger statusResult =
                new AtomicInteger(
                    Integer.MIN_VALUE
                );

            final Object callback =
                Proxy.newProxyInstance(
                    callbackClass.getClassLoader(),
                    new Class<?>[] {
                        callbackClass,
                    },
                    (
                        proxy,
                        method,
                        callbackArgs
                    ) -> {
                        if (
                            "onComplete".equals(
                                method.getName()
                            )
                        ) {
                            final int status =
                                getIntArg(
                                    callbackArgs,
                                    0,
                                    Integer.MIN_VALUE
                                );

                            statusResult.set(
                                status
                            );

                            Log.i(
                                TAG,
                                "Display status recebido: " +
                                    status
                            );

                            latch.countDown();
                        }

                        return null;
                    }
                );

            final Method queryDisplayStatus =
                playbackClient
                    .getClass()
                    .getMethod(
                        "queryDisplayStatus",
                        callbackClass
                    );

            queryDisplayStatus.invoke(
                playbackClient,
                callback
            );

            final boolean completed =
                latch.await(
                    CALLBACK_TIMEOUT_SECONDS,
                    TimeUnit.SECONDS
                );

            if (!completed) {
                Log.w(
                    TAG,
                    "Tempo limite ao consultar status da TV."
                );

                return "UNKNOWN";
            }

            return mapPowerStatus(
                statusResult.get()
            );
        } catch (Throwable error) {
            Log.e(
                TAG,
                "Falha ao consultar status da TV.",
                error
            );

            System.err.println(
                "[CEC] Falha ao consultar status da TV: " +
                    error
            );

            return "UNKNOWN";
        }
    }

    private static String mapPowerStatus(
        int status
    ) {
        switch (status) {
            case 0:
                return "ON";

            case 1:
                return "STANDBY";

            case 2:
                return "TRANSIENT_TO_ON";

            case 3:
                return "TRANSIENT_TO_STANDBY";

            default:
                return "UNKNOWN";
        }
    }

    private static int getIntArg(
        Object[] args,
        int index,
        int fallback
    ) {
        if (
            args == null ||
            args.length <= index ||
            args[index] == null
        ) {
            return fallback;
        }

        final Object value =
            args[index];

        if (value instanceof Number) {
            return ((Number) value).intValue();
        }

        try {
            return Integer.parseInt(
                String.valueOf(
                    value
                )
            );
        } catch (Throwable ignored) {
            return fallback;
        }
    }
}
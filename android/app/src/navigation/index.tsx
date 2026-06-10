import React from 'react';

import {
  NavigationContainer,
} from '@react-navigation/native';

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import {
  ActivationScreen,
} from '../screens/ActivationScreen';

import {
  PlayerScreen,
} from '../screens/PlayerScreen';

import {
  useDeviceStore,
} from '../store/device.store';

const Stack =
  createNativeStackNavigator();

export function Routes() {
  const token =
    useDeviceStore(
      state => state.token,
    );

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {!token ? (
          <Stack.Screen
            name="Activation"
            component={
              ActivationScreen
            }
          />
        ) : (
          <Stack.Screen
            name="Player"
            component={
              PlayerScreen
            }
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
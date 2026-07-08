import {
  NavigationContainer,
} from '@react-navigation/native';

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import {
  navigationRef,
  flushPendingNavigation,
  type RootStackParamList,
} from '../navigation/RootNavigation';

import {
  ActivationScreen,
} from '../screens/ActivationScreen';

import {
  PlayerScreen,
} from '../screens/PlayerScreen';

const Stack =
  createNativeStackNavigator<RootStackParamList>();

export function Routes() {
  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={
        flushPendingNavigation
      }
    >
      <Stack.Navigator
        initialRouteName="Activation"
        screenOptions={{
          headerShown:
            false,

          animation:
            'none',
        }}
      >
        <Stack.Screen
          name="Activation"
          component={
            ActivationScreen
          }
        />

        <Stack.Screen
          name="Player"
          component={
            PlayerScreen
          }
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

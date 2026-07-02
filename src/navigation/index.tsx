import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ActivationScreen } from '../screens/ActivationScreen';
import { PlayerScreen } from '../screens/PlayerScreen';

const Stack = createNativeStackNavigator();

export function Routes() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}>
        <Stack.Screen
          name="Activation"
          component={ActivationScreen}
        />

        <Stack.Screen
          name="Player"
          component={PlayerScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
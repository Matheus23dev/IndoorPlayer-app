import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ActivationScreen } from '../features/activation/screens/ActivationScreen';
import { PlayerScreen } from '../features/player/screens/PlayerScreen';

export type RootStackParamList = {
  Activation: undefined;
  Player: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Activation"
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: '#000000' },
        }}
      >
        <Stack.Screen name="Activation" component={ActivationScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default App;

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';

export function ActivationScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Indoor Player
      </Text>

      <Text style={styles.code}>
        ABCD-1234
      </Text>

      <Text style={styles.subtitle}>
        Cadastre este código
        no painel administrativo
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  title: {
    fontSize: 32,
    fontWeight: 'bold',
  },

  code: {
    fontSize: 40,
    marginTop: 20,
  },

  subtitle: {
    marginTop: 20,
  },
});
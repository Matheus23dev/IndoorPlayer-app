import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Indoor Player</Text>
      <Text style={styles.code}>TV-ABCD1234</Text>
      <Text style={styles.status}>Aguardando ativação...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 50,
    color: '#fff',
    fontWeight: 'bold',
  },
  code: {
    fontSize: 32,
    color: '#00ff88',
    marginTop: 20,
  },
  status: {
    fontSize: 20,
    color: '#999',
    marginTop: 20,
  },
});
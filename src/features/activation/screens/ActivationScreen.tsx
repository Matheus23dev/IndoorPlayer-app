import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../app/App';
import { useDeviceActivation } from '../hooks/useDeviceActivation';

type ActivationNavigation = NativeStackNavigationProp<
  RootStackParamList,
  'Activation'
>;

export function ActivationScreen() {
  const navigation = useNavigation<ActivationNavigation>();

  const openPlayer = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Player' }],
    });
  }, [navigation]);

  const { code, loading, message } = useDeviceActivation(openPlayer);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ativação do Player</Text>

      <Text style={styles.description}>
        Use este código no painel administrador para vincular esta TV.
      </Text>

      <View style={styles.codeBox}>
        <Text style={styles.code}>{code ?? '------'}</Text>
      </View>

      <View style={styles.statusBox}>
        {loading && <ActivityIndicator size="small" color="#FFFFFF" />}

        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#000000',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    marginTop: 16,
    maxWidth: 620,
    color: '#A3A3A3',
    fontSize: 18,
    lineHeight: 26,
    textAlign: 'center',
  },
  codeBox: {
    marginTop: 40,
    paddingVertical: 28,
    paddingHorizontal: 52,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#111111',
  },
  code: {
    color: '#FFFFFF',
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 8,
    textAlign: 'center',
  },
  statusBox: {
    marginTop: 32,
    alignItems: 'center',
    gap: 12,
  },
  message: {
    maxWidth: 620,
    color: '#D4D4D4',
    fontSize: 16,
    textAlign: 'center',
  },
});

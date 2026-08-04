jest.mock('react-native-config', () => ({
  SERVER_BASE_URL: 'http://127.0.0.1',
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
}));

jest.mock('react-native-video', () => 'Video');

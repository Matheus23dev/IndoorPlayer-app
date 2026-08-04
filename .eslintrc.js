module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['jest.setup.js', '__tests__/**/*.{js,ts,tsx}'],
      env: {
        jest: true,
        node: true,
      },
    },
  ],
  rules: {
    // Fire-and-forget assíncrono é intencional nos managers do player.
    'no-void': 'off',
  },
};

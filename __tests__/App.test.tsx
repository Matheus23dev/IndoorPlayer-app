/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/features/activation/hooks/useDeviceActivation', () => ({
  useDeviceActivation: () => ({
    code: 'ABC123',
    loading: false,
    message: 'Aguardando vínculo no painel...',
  }),
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

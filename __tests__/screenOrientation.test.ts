import { resolveOrientationViewport } from '../src/core/native/screenOrientation';

describe('adaptação visual da orientação', () => {
  test('gira e troca as dimensões quando a TV Box ignora o modo vertical', () => {
    expect(resolveOrientationViewport('PORTRAIT', 1920, 1080)).toEqual({
      width: 1080,
      height: 1920,
      rotation: '90deg',
      usesFallback: true,
    });
  });

  test('não gira novamente quando o Android já aplicou o modo vertical', () => {
    expect(resolveOrientationViewport('PORTRAIT', 1080, 1920)).toEqual({
      width: 1080,
      height: 1920,
      rotation: '0deg',
      usesFallback: false,
    });
  });

  test('restaura o canvas horizontal quando a janela continua vertical', () => {
    expect(resolveOrientationViewport('LANDSCAPE', 1080, 1920)).toEqual({
      width: 1920,
      height: 1080,
      rotation: '-90deg',
      usesFallback: true,
    });
  });
});

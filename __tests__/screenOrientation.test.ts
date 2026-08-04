import { resolveOrientationViewport } from '../src/core/native/screenOrientation';

describe('adaptação visual da orientação', () => {
  test('sempre deixa a mídia vertical deitada no canvas landscape da TV', () => {
    expect(resolveOrientationViewport('PORTRAIT', 1920, 1080)).toEqual({
      width: 1080,
      height: 1920,
      rotation: '90deg',
      rotated: true,
    });
  });

  test('mantém a mídia horizontal sem rotação', () => {
    expect(resolveOrientationViewport('LANDSCAPE', 1920, 1080)).toEqual({
      width: 1920,
      height: 1080,
      rotation: '0deg',
      rotated: false,
    });
  });
});

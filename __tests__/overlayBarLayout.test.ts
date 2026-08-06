import { getOverlayContentInsetStyle } from '../src/features/player/components/OverlayBarsLayer';
import {
  getMediaFrameStyle,
  getOverlayBarInsets,
  getOverlayBarPositionStyle,
  getOverlayBarSafeContentStyle,
  getOverlayLayoutScale,
  getOverlayTextBlockPadding,
} from '../src/features/player/domain/overlayBarLayout';

describe('layout das barras do player', () => {
  test('usa o recuo apenas nas laterais de uma barra horizontal', () => {
    expect(getOverlayContentInsetStyle(true, 120)).toEqual({
      paddingHorizontal: 120,
    });
  });

  test('usa o recuo apenas no topo e rodapé de uma barra lateral', () => {
    expect(getOverlayContentInsetStyle(false, 120)).toEqual({
      paddingVertical: 120,
    });
  });

  test('reserva o centro para o vídeo e termina a barra lateral abaixo do topo', () => {
    const insets = getOverlayBarInsets([
      { position: 'TOP', sizePercent: 12 },
      { position: 'LEFT', sizePercent: 20 },
      { position: 'BOTTOM', sizePercent: 8 },
    ]);

    expect(insets).toEqual({ top: 12, right: 0, bottom: 8, left: 20 });
    expect(getMediaFrameStyle(insets)).toEqual({
      top: '12%',
      right: '0%',
      bottom: '8%',
      left: '20%',
    });
    expect(getOverlayBarPositionStyle('LEFT', 20, insets)).toEqual({
      top: '12%',
      bottom: '8%',
      width: '20%',
      left: 0,
    });
  });

  test('mantém medidas proporcionais em resoluções diferentes', () => {
    expect(getOverlayLayoutScale(960, 540)).toBe(1);
    expect(getOverlayLayoutScale(1920, 1080)).toBe(2);
    expect(getOverlayLayoutScale(0, 0)).toBe(1);
  });

  test('protege o conteúdo no lado externo sujeito ao overscan da TV', () => {
    expect(getOverlayBarSafeContentStyle('TOP', 1)).toEqual({ paddingTop: 16 });
    expect(getOverlayBarSafeContentStyle('BOTTOM', 1.5)).toEqual({
      paddingBottom: 24,
    });
    expect(getOverlayBarSafeContentStyle('LEFT', 1)).toEqual({
      paddingLeft: 16,
    });
    expect(getOverlayBarSafeContentStyle('RIGHT', 1)).toEqual({
      paddingRight: 16,
    });
  });

  test('limita o padding do bloco no eixo estreito sem alterar o outro eixo', () => {
    expect(getOverlayTextBlockPadding('BOTTOM', 10, 18, 60, 1)).toEqual({
      paddingHorizontal: 18,
      paddingVertical: 5.7,
    });
    expect(getOverlayTextBlockPadding('LEFT', 10, 60, 18, 1)).toEqual({
      paddingHorizontal: 12,
      paddingVertical: 18,
    });
  });
});

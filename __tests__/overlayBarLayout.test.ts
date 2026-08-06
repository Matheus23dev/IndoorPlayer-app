import { getOverlayContentInsetStyle } from '../src/features/player/components/OverlayBarsLayer';

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
});

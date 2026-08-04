import {
  normalizePlaylistOrientation,
  normalizeProgrammingPlaylist,
} from '../src/features/player/domain/programming';

describe('orientação da playlist', () => {
  test.each([
    ['PORTRAIT', 'PORTRAIT'],
    ['LANDSCAPE', 'LANDSCAPE'],
    [undefined, 'LANDSCAPE'],
    ['INVALID', 'LANDSCAPE'],
  ])('normaliza %p como %p', (input, expected) => {
    expect(normalizePlaylistOrientation(input)).toBe(expected);
  });

  test('preserva a orientação vertical recebida na programação', () => {
    const playlist = normalizeProgrammingPlaylist({
      id: 'playlist-1',
      name: 'Totem',
      orientation: 'PORTRAIT',
      updatedAt: '2026-08-04T12:00:00.000Z',
      items: [],
    });

    expect(playlist.orientation).toBe('PORTRAIT');
  });
});

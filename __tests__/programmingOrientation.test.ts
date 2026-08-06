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

  test('normaliza e ordena barras reutilizaveis da playlist', () => {
    const playlist = normalizeProgrammingPlaylist({
      id: 'playlist-1',
      name: 'Totem',
      orientation: 'LANDSCAPE',
      updatedAt: '2026-08-05T12:00:00.000Z',
      items: [],
      bars: [
        {
          id: 'bar-2',
          name: 'Lateral',
          position: 'INVALID',
          sizePercent: 90,
          backgroundColor: 'invalid',
          opacity: -10,
          fit: 'INVALID',
          contentPosition: 'INVALID',
          contentAlignment: 'INVALID',
          imageSizePercent: 500,
          contentPadding: 500,
          contentGap: -1,
          contentItems: [{ id: 'empty', type: 'TEXT', text: '   ' }],
          textContent: '   ',
          textColor: 'invalid',
          fontSize: 5,
          widgetType: 'INVALID',
          weatherLocation: '   ',
          order: 2,
          updatedAt: '2026-08-05T12:00:00.000Z',
          media: null,
        },
        {
          id: 'bar-1',
          name: 'Topo',
          position: 'TOP',
          sizePercent: 8,
          backgroundColor: '#abcdef',
          opacity: 75,
          fit: 'COVER',
          contentPosition: 'END',
          contentAlignment: 'START',
          imageSizePercent: 55,
          contentPadding: 18,
          contentGap: 24,
          contentItems: [
            {
              id: 'message',
              type: 'TEXT',
              text: ' Bem-vindo {{hora}} ',
              textColor: '#ffcc00',
              fontSize: 42,
              fontWeight: 'SEMIBOLD',
              fontFamily: 'MONOSPACE',
              italic: true,
              backgroundColor: '#001122',
              padding: 12,
              paddingHorizontal: 18,
              paddingVertical: 4,
              borderRadius: 10,
              spacerSize: 0,
            },
            {
              id: 'space',
              type: 'SPACER',
              textColor: '#ffffff',
              fontSize: 28,
              fontWeight: 'BOLD',
              padding: 0,
              borderRadius: 0,
              spacerSize: 32,
            },
          ],
          textContent: 'Agora: {{hora}}',
          textColor: '#12abef',
          fontSize: 36,
          widgetType: 'WEATHER',
          weatherLocation: ' São Paulo ',
          order: 1,
          updatedAt: '2026-08-05T12:00:00.000Z',
          media: null,
        },
      ],
    });

    expect(playlist.bars.map(bar => bar.id)).toEqual(['bar-1', 'bar-2']);
    expect(playlist.bars[0]).toMatchObject({
      position: 'TOP',
      sizePercent: 8,
      backgroundColor: '#ABCDEF',
      opacity: 75,
      fit: 'COVER',
      contentPosition: 'END',
      contentAlignment: 'START',
      imageSizePercent: 55,
      contentPadding: 18,
      contentGap: 24,
      contentItems: [
        expect.objectContaining({
          id: 'message',
          text: 'Bem-vindo {{hora}}',
          textColor: '#FFCC00',
          fontSize: 42,
          fontWeight: 'SEMIBOLD',
          fontFamily: 'MONOSPACE',
          italic: true,
          backgroundColor: '#001122',
          paddingHorizontal: 18,
          paddingVertical: 4,
        }),
        expect.objectContaining({
          id: 'space',
          type: 'SPACER',
          spacerSize: 32,
        }),
      ],
      textContent: 'Agora: {{hora}}',
      textColor: '#12ABEF',
      fontSize: 36,
      widgetType: 'WEATHER',
      weatherLocation: 'São Paulo',
    });
    expect(playlist.bars[1]).toMatchObject({
      position: 'BOTTOM',
      sizePercent: 40,
      backgroundColor: '#000000',
      opacity: 0,
      fit: 'CONTAIN',
      contentPosition: 'CENTER',
      contentAlignment: 'CENTER',
      imageSizePercent: 100,
      contentPadding: 120,
      contentGap: 0,
      contentItems: [],
      textContent: null,
      textColor: '#FFFFFF',
      fontSize: 10,
      widgetType: 'NONE',
      weatherLocation: null,
    });
  });
});

import {
  createPlayerItemsSignature,
  normalizeMuted,
  normalizePlayerItem,
} from '../src/features/player/domain/playerItem';

describe('normalização de áudio do player', () => {
  test.each([
    [true, true],
    [1, true],
    ['true', true],
    ['1', true],
    [false, false],
    [0, false],
    ['false', false],
    [undefined, false],
  ])('normaliza %p como %p', (input, expected) => {
    expect(normalizeMuted(input)).toBe(expected);
  });

  test('preserva o item e torna muted obrigatório', () => {
    const item = normalizePlayerItem({
      id: 'item-1',
      order: 1,
      muted: 'true',
      media: {
        id: 'media-1',
        name: 'video.mp4',
        type: 'VIDEO',
        fileUrl: 'video.mp4',
      },
    });

    expect(item.muted).toBe(true);
    expect(item.media.id).toBe('media-1');
  });

  test('detecta uma alteração somente no muted da playlist', () => {
    const audibleItem = normalizePlayerItem({
      id: 'item-1',
      order: 1,
      muted: false,
      media: {
        id: 'media-1',
        name: 'video.mp4',
        type: 'VIDEO',
        fileUrl: 'video.mp4',
      },
    });

    const mutedItem = normalizePlayerItem({
      ...audibleItem,
      muted: true,
    });

    expect(createPlayerItemsSignature([audibleItem])).not.toBe(
      createPlayerItemsSignature([mutedItem]),
    );
  });
});

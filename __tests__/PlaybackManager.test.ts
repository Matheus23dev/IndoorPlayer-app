import { PlaybackManager } from '../src/features/player/managers/PlaybackManager';
import type { PlayerItem } from '../src/features/player/types/media';

function videoItem(overrides: Partial<PlayerItem> = {}): PlayerItem {
  return {
    id: 'item-1',
    order: 1,
    duration: 31,
    muted: false,
    media: {
      id: 'media-1',
      name: 'video.mp4',
      type: 'VIDEO',
      fileUrl: 'video.mp4',
      localPath: 'file:///cache/video.mp4',
      duration: 31,
      updatedAt: '2026-07-30T12:00:00.000Z',
    },
    ...overrides,
  };
}

describe('PlaybackManager', () => {
  test('aplica a mudança de muted imediatamente ao vídeo atual', () => {
    const manager = new PlaybackManager();

    manager.load([videoItem()]);
    const initialKey = manager.getSnapshot().playbackKey;

    manager.load([videoItem({ muted: true })]);

    expect(manager.getCurrentItem()?.muted).toBe(true);
    expect(manager.getSnapshot()).toMatchObject({
      playbackKey: initialKey + 1,
      hasPendingPlaylist: false,
    });
  });

  test('não reinicia o vídeo quando a playlist recebida é idêntica', () => {
    const manager = new PlaybackManager();
    const item = videoItem();

    manager.load([item]);
    const initialKey = manager.getSnapshot().playbackKey;

    manager.load([{ ...item, media: { ...item.media } }]);

    expect(manager.getSnapshot().playbackKey).toBe(initialKey);
    expect(manager.getSnapshot().hasPendingPlaylist).toBe(false);
  });

  test('mantém outras alterações pendentes até a mídia atual terminar', () => {
    const manager = new PlaybackManager();

    manager.load([videoItem()]);
    manager.load([videoItem({ duration: 45 })]);

    expect(manager.getCurrentItem()?.duration).toBe(31);
    expect(manager.getSnapshot().hasPendingPlaylist).toBe(true);

    manager.videoFinished();

    expect(manager.getCurrentItem()?.duration).toBe(45);
    expect(manager.getSnapshot().hasPendingPlaylist).toBe(false);
  });
});

jest.mock('../src/core/api/client', () => ({
  api: {
    post: jest.fn(),
  },
}));

jest.mock('../src/core/storage/deviceStorage', () => ({
  getDeviceToken: jest.fn(),
}));

jest.mock('../src/features/player/managers/PlaybackManager', () => ({
  playbackManager: {
    getPlaybackState: jest.fn(),
  },
}));

jest.mock('../src/features/player/managers/PlaylistManager', () => ({
  playlistManager: {
    getPlaylistId: jest.fn(),
  },
}));

import { api } from '../src/core/api/client';
import { getDeviceToken } from '../src/core/storage/deviceStorage';
import { HeartbeatManager } from '../src/features/player/managers/HeartbeatManager';
import { playbackManager } from '../src/features/player/managers/PlaybackManager';

describe('HeartbeatManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);

    jest.mocked(getDeviceToken).mockResolvedValue('device-token');
    jest.mocked(playbackManager.getPlaybackState).mockReturnValue({
      currentItem: null,
      currentTime: null,
      duration: null,
      startedAt: null,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('envia novamente quando o estado muda durante uma requisição em andamento', async () => {
    let finishFirstRequest: (() => void) | undefined;
    const firstRequest = new Promise<void>(resolve => {
      finishFirstRequest = resolve;
    });

    jest
      .mocked(api.post)
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValueOnce({ data: { success: true } });

    const manager = new HeartbeatManager();
    const sending = manager.send();

    await Promise.resolve();
    await Promise.resolve();

    expect(api.post).toHaveBeenCalledTimes(1);

    void manager.send();

    finishFirstRequest?.();
    await sending;

    expect(api.post).toHaveBeenCalledTimes(2);
  });
});

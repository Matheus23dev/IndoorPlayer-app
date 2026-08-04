import { normalizePlayerItem } from './playerItem';

import type {
  PlaylistOrientation,
  ProgrammingPlaylist,
  ProgrammingPlaylistInput,
  ProgrammingResponse,
  ProgrammingResponseInput,
} from '../types/programming';

export function normalizeProgrammingPlaylist(
  playlist: ProgrammingPlaylistInput | ProgrammingPlaylist,
): ProgrammingPlaylist {
  return {
    ...playlist,
    orientation: normalizePlaylistOrientation(playlist.orientation),
    items: Array.isArray(playlist.items)
      ? playlist.items.map(normalizePlayerItem)
      : [],
  };
}

export function normalizePlaylistOrientation(
  orientation: unknown,
): PlaylistOrientation {
  return orientation === 'PORTRAIT' ? 'PORTRAIT' : 'LANDSCAPE';
}

export function normalizeProgrammingResponse(
  response: ProgrammingResponseInput,
): ProgrammingResponse {
  return {
    ...response,
    playlists: Array.isArray(response.playlists)
      ? response.playlists.map(normalizeProgrammingPlaylist)
      : [],
  };
}

import type { PlayerItem, PlayerItemInput } from './media';

export type PlaylistOrientation = 'LANDSCAPE' | 'PORTRAIT';

export interface ProgrammingOccurrence {
  occurrenceId: string;

  scheduleId: string;
  scheduleName: string;

  playlistId: string;

  startAt: string;
  endAt: string;

  priority: number;
}

export interface ProgrammingPlaylist {
  id: string;
  name: string;
  orientation: PlaylistOrientation;
  updatedAt: string;

  items: PlayerItem[];
}

export interface ProgrammingPlaylistInput
  extends Omit<ProgrammingPlaylist, 'items' | 'orientation'> {
  orientation?: unknown;
  items: PlayerItemInput[];
}

export interface ProgrammingWindow {
  hours: number;
  limit: number;

  startsAt: string;
  endsAt: string;

  hasMore: boolean;
}

export interface ProgrammingDevice {
  id: string;
  code: string;
  name: string | null;
}

export interface ProgrammingResponse {
  serverTime: string;

  localDate: string;
  localTime: string;

  timeZone: string;

  version: string;

  programmingUpdatedAt: string | null;

  window: ProgrammingWindow;

  device: ProgrammingDevice;

  currentOccurrenceId: string | null;

  currentScheduleId: string | null;

  occurrences: ProgrammingOccurrence[];

  playlists: ProgrammingPlaylist[];
}

export interface ProgrammingResponseInput
  extends Omit<ProgrammingResponse, 'playlists'> {
  playlists: ProgrammingPlaylistInput[];
}

export interface ProgrammingSnapshot {
  version: string | null;

  serverTime: string | null;

  timeZone: string;

  clockOffsetMs: number;

  syncedAt: number | null;

  occurrences: ProgrammingOccurrence[];

  playlists: ProgrammingPlaylist[];
}

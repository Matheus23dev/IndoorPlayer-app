import type { PlayerItem, PlayerItemInput, PlayerMedia } from './media';

export type PlaylistOrientation = 'LANDSCAPE' | 'PORTRAIT';
export type OverlayBarPosition = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
export type OverlayBarFit = 'CONTAIN' | 'COVER' | 'FILL';
export type OverlayBarContentPosition = 'START' | 'CENTER' | 'END';
export type OverlayBarWidgetType = 'NONE' | 'CLOCK' | 'DATE' | 'WEATHER';
export type OverlayBarContentType =
  | 'TEXT'
  | 'CLOCK'
  | 'DATE'
  | 'WEATHER'
  | 'SPACER';
export type OverlayBarFontWeight = 'NORMAL' | 'SEMIBOLD' | 'BOLD';
export type OverlayBarFontFamily =
  | 'SYSTEM'
  | 'SANS_SERIF'
  | 'SANS_SERIF_CONDENSED'
  | 'SERIF'
  | 'MONOSPACE';

export interface ProgrammingOverlayBarContentItem {
  id: string;
  type: OverlayBarContentType;
  text: string | null;
  textColor: string;
  fontSize: number;
  fontWeight: OverlayBarFontWeight;
  fontFamily: OverlayBarFontFamily;
  italic: boolean;
  backgroundColor: string | null;
  padding: number;
  paddingHorizontal: number;
  paddingVertical: number;
  borderRadius: number;
  spacerSize: number;
}

export interface ProgrammingOverlayBar {
  id: string;
  name: string;
  position: OverlayBarPosition;
  sizePercent: number;
  backgroundColor: string;
  opacity: number;
  fit: OverlayBarFit;
  contentPosition: OverlayBarContentPosition;
  contentAlignment: OverlayBarContentPosition;
  imageSizePercent: number;
  contentPadding: number;
  contentGap: number;
  contentItems: ProgrammingOverlayBarContentItem[];
  textContent: string | null;
  textColor: string;
  fontSize: number;
  widgetType: OverlayBarWidgetType;
  weatherLocation: string | null;
  order: number;
  updatedAt: string;
  media: PlayerMedia | null;
}

export interface ProgrammingOverlayBarInput
  extends Omit<
    ProgrammingOverlayBar,
    | 'position'
    | 'sizePercent'
    | 'backgroundColor'
    | 'opacity'
    | 'fit'
    | 'contentPosition'
    | 'contentAlignment'
    | 'imageSizePercent'
    | 'contentPadding'
    | 'contentGap'
    | 'contentItems'
    | 'textContent'
    | 'textColor'
    | 'fontSize'
    | 'widgetType'
    | 'weatherLocation'
  > {
  position?: unknown;
  sizePercent?: unknown;
  backgroundColor?: unknown;
  opacity?: unknown;
  fit?: unknown;
  contentPosition?: unknown;
  contentAlignment?: unknown;
  imageSizePercent?: unknown;
  contentPadding?: unknown;
  contentGap?: unknown;
  contentItems?: unknown;
  textContent?: unknown;
  textColor?: unknown;
  fontSize?: unknown;
  widgetType?: unknown;
  weatherLocation?: unknown;
}

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

  bars: ProgrammingOverlayBar[];
  items: PlayerItem[];
}

export interface ProgrammingPlaylistInput
  extends Omit<ProgrammingPlaylist, 'items' | 'orientation' | 'bars'> {
  orientation?: unknown;
  bars?: ProgrammingOverlayBarInput[];
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

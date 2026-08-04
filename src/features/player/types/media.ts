export type MediaType = 'IMAGE' | 'VIDEO';

export interface PlayerMedia {
  id: string;
  name: string;
  type: MediaType;
  fileUrl: string;

  localPath?: string;

  duration?: number | null;
  fileSize?: number | null;
  mimeType?: string | null;

  createdAt?: string;
  updatedAt?: string;
}

export interface PlayerItem {
  id: string;
  order: number;

  duration?: number | null;
  muted: boolean;

  playlistId?: string;
  mediaId?: string;

  media: PlayerMedia;
}

export interface PlayerItemInput extends Omit<PlayerItem, 'muted'> {
  muted?: unknown;
}

export interface PlayerPlaylist {
  id: string;
  name: string;

  companyId?: string;

  createdAt?: string;
  updatedAt?: string;

  items: PlayerItem[];
}

export interface PlayerSchedule {
  id: string;

  name?: string;

  startDate?: string;
  endDate?: string;

  startTime?: string;
  endTime?: string;

  active?: boolean;
  priority?: number;

  playlistId?: string;
  playerId?: string;
  companyId?: string;
}

export interface CurrentPlaylistResponse {
  scheduleId?: string | null;
  schedule?: PlayerSchedule | null;
  playlist?: PlayerPlaylist | null;
  generatedAt?: string;
}

export interface LocalPlayerMedia extends PlayerMedia {
  localPath: string;
}

export interface LocalPlayerItem extends Omit<PlayerItem, 'media'> {
  media: LocalPlayerMedia;
}

export interface LocalPlayerPlaylist extends Omit<PlayerPlaylist, 'items'> {
  items: LocalPlayerItem[];
}

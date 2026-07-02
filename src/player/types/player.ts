export type MediaType =
  | 'IMAGE'
  | 'VIDEO';

export interface PlayerMedia {
  id: string;

  name: string;

  type: MediaType;

  fileUrl: string;

  /**
   * Caminho local criado depois
   * que a mídia for baixada.
   *
   * Exemplo:
   * file:///data/user/0/.../media/video.mp4
   */
  localPath?: string;

  /**
   * Duração original da mídia,
   * quando fornecida pelo backend.
   */
  duration?: number | null;

  fileSize?: number | null;

  mimeType?: string | null;

  createdAt?: string;

  updatedAt?: string;
}

export interface PlayerItem {
  id: string;

  order: number;

  /**
   * Tempo em segundos.
   *
   * Usado principalmente para imagens.
   * Vídeos avançam através do onEnd.
   */
  duration?: number | null;

  playlistId?: string;

  mediaId?: string;

  media: PlayerMedia;
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
  /**
   * Formato antigo da resposta da API.
   */
  scheduleId?: string | null;

  /**
   * Formato novo, retornando o
   * agendamento completo.
   */
  schedule?: PlayerSchedule | null;

  playlist?: PlayerPlaylist | null;

  generatedAt?: string;
}

export interface LocalPlayerMedia
  extends PlayerMedia {
  localPath: string;
}

export interface LocalPlayerItem
  extends Omit<PlayerItem, 'media'> {
  media: LocalPlayerMedia;
}

export interface LocalPlayerPlaylist
  extends Omit<PlayerPlaylist, 'items'> {
  items: LocalPlayerItem[];
}
import { normalizePlayerItem } from './playerItem';

import type {
  PlaylistOrientation,
  OverlayBarFit,
  OverlayBarContentPosition,
  OverlayBarPosition,
  OverlayBarWidgetType,
  ProgrammingOverlayBarContentItem,
  ProgrammingOverlayBar,
  ProgrammingOverlayBarInput,
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
    bars: Array.isArray(playlist.bars)
      ? playlist.bars.map(normalizeOverlayBar).sort((first, second) => {
          return first.order - second.order;
        })
      : [],
    items: Array.isArray(playlist.items)
      ? playlist.items.map(normalizePlayerItem)
      : [],
  };
}

export function normalizeOverlayBar(
  bar: ProgrammingOverlayBarInput | ProgrammingOverlayBar,
): ProgrammingOverlayBar {
  return {
    ...bar,
    position: normalizeOverlayBarPosition(bar.position),
    sizePercent: clampNumber(bar.sizePercent, 2, 40, 12),
    backgroundColor:
      typeof bar.backgroundColor === 'string' &&
      /^#[0-9a-fA-F]{6}$/.test(bar.backgroundColor)
        ? bar.backgroundColor.toUpperCase()
        : '#000000',
    opacity: clampNumber(bar.opacity, 0, 100, 100),
    fit: normalizeOverlayBarFit(bar.fit),
    contentPosition: normalizeContentPosition(bar.contentPosition),
    contentAlignment: normalizeContentPosition(bar.contentAlignment),
    imageSizePercent: clampNumber(bar.imageSizePercent, 10, 100, 80),
    contentPadding: clampNumber(bar.contentPadding, 0, 120, 6),
    contentGap: clampNumber(bar.contentGap, 0, 120, 8),
    contentItems: normalizeContentItems(bar.contentItems),
    textContent:
      typeof bar.textContent === 'string' && bar.textContent.trim()
        ? bar.textContent.trim()
        : null,
    textColor:
      typeof bar.textColor === 'string' &&
      /^#[0-9a-fA-F]{6}$/.test(bar.textColor)
        ? bar.textColor.toUpperCase()
        : '#FFFFFF',
    fontSize: clampNumber(bar.fontSize, 10, 120, 28),
    widgetType: normalizeWidgetType(bar.widgetType),
    weatherLocation:
      typeof bar.weatherLocation === 'string' && bar.weatherLocation.trim()
        ? bar.weatherLocation.trim()
        : null,
    order: Number.isFinite(bar.order) ? Math.max(1, bar.order) : 1,
    media: bar.media ?? null,
  };
}

function normalizeContentItems(
  value: unknown,
): ProgrammingOverlayBarContentItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 20).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      return [];
    }

    const item = candidate as Record<string, unknown>;
    const type = normalizeContentType(item.type);
    const legacyPadding = clampNumber(item.padding, 0, 60, 0);

    if (
      type === 'TEXT' &&
      (typeof item.text !== 'string' || !item.text.trim())
    ) {
      return [];
    }

    return [
      {
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : `content-${index + 1}`,
        type,
        text:
          typeof item.text === 'string' && item.text.trim()
            ? item.text.trim()
            : null,
        textColor: normalizeHexColor(item.textColor, '#FFFFFF'),
        fontSize: clampNumber(item.fontSize, 10, 120, 28),
        fontWeight: normalizeFontWeight(item.fontWeight),
        fontFamily: normalizeFontFamily(item.fontFamily),
        italic: item.italic === true,
        backgroundColor:
          typeof item.backgroundColor === 'string' && item.backgroundColor
            ? normalizeHexColor(item.backgroundColor, '#000000')
            : null,
        padding: legacyPadding,
        paddingHorizontal: clampNumber(
          item.paddingHorizontal,
          0,
          60,
          legacyPadding,
        ),
        paddingVertical: clampNumber(item.paddingVertical, 0, 60, 0),
        borderRadius: clampNumber(item.borderRadius, 0, 60, 0),
        spacerSize: clampNumber(item.spacerSize, 0, 200, 24),
      },
    ];
  });
}

function normalizeContentType(
  value: unknown,
): ProgrammingOverlayBarContentItem['type'] {
  if (
    value === 'CLOCK' ||
    value === 'DATE' ||
    value === 'WEATHER' ||
    value === 'SPACER'
  ) {
    return value;
  }

  return 'TEXT';
}

function normalizeFontWeight(
  value: unknown,
): ProgrammingOverlayBarContentItem['fontWeight'] {
  if (value === 'NORMAL' || value === 'SEMIBOLD') {
    return value;
  }

  return 'BOLD';
}

function normalizeFontFamily(
  value: unknown,
): ProgrammingOverlayBarContentItem['fontFamily'] {
  if (
    value === 'SANS_SERIF' ||
    value === 'SANS_SERIF_CONDENSED' ||
    value === 'SERIF' ||
    value === 'MONOSPACE'
  ) {
    return value;
  }

  return 'SYSTEM';
}

function normalizeHexColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toUpperCase()
    : fallback;
}

function normalizeContentPosition(value: unknown): OverlayBarContentPosition {
  if (value === 'START' || value === 'END') {
    return value;
  }

  return 'CENTER';
}

function normalizeWidgetType(value: unknown): OverlayBarWidgetType {
  if (value === 'CLOCK' || value === 'DATE' || value === 'WEATHER') {
    return value;
  }

  return 'NONE';
}

function normalizeOverlayBarPosition(value: unknown): OverlayBarPosition {
  if (value === 'TOP' || value === 'LEFT' || value === 'RIGHT') {
    return value;
  }

  return 'BOTTOM';
}

function normalizeOverlayBarFit(value: unknown): OverlayBarFit {
  if (value === 'COVER' || value === 'FILL') {
    return value;
  }

  return 'CONTAIN';
}

function clampNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
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

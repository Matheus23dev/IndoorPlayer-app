import type { PlayerItem, PlayerItemInput } from '../types/media';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function normalizeMuted(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    return TRUE_VALUES.has(value.trim().toLowerCase());
  }

  return false;
}

export function normalizePlayerItem(
  item: PlayerItemInput | PlayerItem,
): PlayerItem {
  return {
    ...item,
    muted: normalizeMuted(item.muted),
  };
}

export function sortPlayerItems(items: readonly PlayerItem[]) {
  return [...items].sort((first, second) => first.order - second.order);
}

export function getPlayerItemSignatureData(item: PlayerItem) {
  return {
    itemId: item.id,
    order: item.order,
    duration: item.duration ?? null,
    muted: item.muted,
    mediaId: item.media.id,
    localPath: item.media.localPath ?? null,
    updatedAt: item.media.updatedAt ?? null,
  };
}

export function createPlayerItemsSignature(items: readonly PlayerItem[]) {
  if (items.length === 0) {
    return '';
  }

  return JSON.stringify(items.map(getPlayerItemSignatureData));
}

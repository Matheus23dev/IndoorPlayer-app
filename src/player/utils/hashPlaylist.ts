export function hashPlaylist(items: any[]) {
  return JSON.stringify(
    items.map(item => ({
      id: item.id,
      media: item.media.id,
      duration: item.duration,
      order: item.order,
    })),
  );
}
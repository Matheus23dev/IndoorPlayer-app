// services/player.ts
export function createPlayer(setIndex: any, playlist: any[]) {
  let index = 0;

  function next() {
    if (playlist.length === 0) return;

    index = (index + 1) % playlist.length;
    setIndex(index);
  }

  function start() {
    setInterval(() => {
      next();
    }, 5000);
  }

  return { start };
}
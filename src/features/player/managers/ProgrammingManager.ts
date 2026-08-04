import { programmingState } from '../state/ProgrammingState';

import { normalizeProgrammingPlaylist } from '../domain/programming';

import {
  getPlayerItemSignatureData,
  sortPlayerItems,
} from '../domain/playerItem';

import type {
  ProgrammingOccurrence,
  ProgrammingPlaylist,
  ProgrammingResponse,
  ProgrammingSnapshot,
} from '../types/programming';

type ProgrammingListener = (snapshot: ProgrammingSnapshot) => void;

const DEFAULT_TIME_ZONE = 'America/Fortaleza';

class ProgrammingManager {
  private version: string | null = null;
  private serverTime: string | null = null;
  private timeZone = DEFAULT_TIME_ZONE;
  private clockOffsetMs = 0;
  private syncedAt: number | null = null;

  private occurrences: ProgrammingOccurrence[] = [];
  private playlists: ProgrammingPlaylist[] = [];

  private listeners = new Set<ProgrammingListener>();

  async hydrate() {
    try {
      const saved = await programmingState.load();

      if (!saved) {
        return false;
      }

      const clockOffsetMs = this.normalizeClockOffset(saved.clockOffsetMs);

      const correctedNow = Date.now() + clockOffsetMs;

      const occurrences = this.normalizeOccurrences(saved.occurrences).filter(
        occurrence => new Date(occurrence.endAt).getTime() > correctedNow,
      );

      if (occurrences.length === 0) {
        await programmingState.clear();
        return false;
      }

      const playlistIds = new Set(
        occurrences.map(occurrence => occurrence.playlistId),
      );

      const playlists = this.normalizePlaylists(saved.playlists).filter(
        playlist => playlistIds.has(playlist.id),
      );

      this.version = saved.version;
      this.serverTime = saved.serverTime;
      this.timeZone = saved.timeZone || DEFAULT_TIME_ZONE;
      this.clockOffsetMs = clockOffsetMs;
      this.syncedAt = Number.isFinite(saved.syncedAt)
        ? saved.syncedAt
        : Date.now();

      this.occurrences = occurrences;
      this.playlists = playlists;

      await programmingState.save(this.getSnapshot());

      console.log('[PROGRAMMING] Programação local restaurada:', {
        occurrences: occurrences.length,
        playlists: playlists.length,
      });

      this.emit();

      return true;
    } catch (error) {
      console.log('[PROGRAMMING] Erro ao restaurar programação:', error);

      await programmingState.clear();

      return false;
    }
  }

  async setProgramming(
    programming: ProgrammingResponse,
    receivedAt = Date.now(),
  ) {
    const normalizedOccurrences = this.normalizeOccurrences(
      programming.occurrences,
    );

    const normalizedPlaylists = this.normalizePlaylists(programming.playlists);

    const nextClockOffset = this.calculateClockOffset(
      programming.serverTime,
      receivedAt,
    );

    const contentChanged =
      this.version !== programming.version ||
      !this.hasSameContent(normalizedOccurrences, normalizedPlaylists);

    this.version = programming.version;

    this.serverTime = programming.serverTime;

    this.timeZone = programming.timeZone || DEFAULT_TIME_ZONE;

    this.clockOffsetMs = nextClockOffset;

    this.syncedAt = receivedAt;

    this.occurrences = normalizedOccurrences;

    this.playlists = normalizedPlaylists;

    await programmingState.save(this.getSnapshot());

    this.emit();

    if (contentChanged) {
      console.log('[PROGRAMMING] Programação atualizada:', {
        version: this.version,
        occurrences: this.occurrences.length,
        playlists: this.playlists.length,
        clockOffsetMs: this.clockOffsetMs,
      });
    }

    return contentChanged;
  }

  clear() {
    if (this.isEmpty()) {
      return false;
    }

    this.reset();

    void programmingState.clear().catch(error => {
      console.log('[PROGRAMMING] Erro ao limpar programação:', error);
    });

    this.emit();

    return true;
  }

  getCorrectedNow() {
    return Date.now() + this.clockOffsetMs;
  }

  getActiveOccurrence(timestamp = this.getCorrectedNow()) {
    let activeOccurrence: ProgrammingOccurrence | null = null;

    for (const occurrence of this.occurrences) {
      const startAt = new Date(occurrence.startAt).getTime();

      const endAt = new Date(occurrence.endAt).getTime();

      const isActive = startAt <= timestamp && timestamp < endAt;

      if (!isActive) {
        continue;
      }

      if (
        !activeOccurrence ||
        this.compareOccurrencePriority(occurrence, activeOccurrence) < 0
      ) {
        activeOccurrence = occurrence;
      }
    }

    return activeOccurrence;
  }

  getNextBoundary(timestamp = this.getCorrectedNow()) {
    let nextBoundary: number | null = null;

    for (const occurrence of this.occurrences) {
      const boundaries = [
        new Date(occurrence.startAt).getTime(),

        new Date(occurrence.endAt).getTime(),
      ];

      for (const boundary of boundaries) {
        if (!Number.isFinite(boundary) || boundary <= timestamp) {
          continue;
        }

        if (nextBoundary === null || boundary < nextBoundary) {
          nextBoundary = boundary;
        }
      }
    }

    return nextBoundary;
  }

  getPlaylist(playlistId: string) {
    const playlist = this.playlists.find(item => item.id === playlistId);

    if (!playlist) {
      return null;
    }

    return {
      ...playlist,

      items: [...playlist.items],
    };
  }

  getOccurrence(occurrenceId: string) {
    return (
      this.occurrences.find(
        occurrence => occurrence.occurrenceId === occurrenceId,
      ) ?? null
    );
  }

  getVersion() {
    return this.version;
  }

  hasProgramming() {
    return this.occurrences.length > 0;
  }

  getSnapshot(): ProgrammingSnapshot {
    return {
      version: this.version,
      serverTime: this.serverTime,
      timeZone: this.timeZone,
      clockOffsetMs: this.clockOffsetMs,
      syncedAt: this.syncedAt,

      occurrences: this.occurrences.map(occurrence => ({
        ...occurrence,
      })),

      playlists: this.playlists.map(playlist => ({
        ...playlist,

        items: [...playlist.items],
      })),
    };
  }

  subscribe(listener: ProgrammingListener) {
    this.listeners.add(listener);

    this.notifyListener(listener, this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const snapshot = this.getSnapshot();

    this.listeners.forEach(listener => this.notifyListener(listener, snapshot));
  }

  private notifyListener(
    listener: ProgrammingListener,
    snapshot: ProgrammingSnapshot,
  ) {
    try {
      listener(snapshot);
    } catch (error) {
      console.log('[PROGRAMMING] Erro no listener:', error);
    }
  }

  private normalizeOccurrences(occurrences: ProgrammingOccurrence[]) {
    const uniqueOccurrences = new Map<string, ProgrammingOccurrence>();

    for (const occurrence of occurrences) {
      if (
        !occurrence.occurrenceId ||
        !occurrence.scheduleId ||
        !occurrence.playlistId
      ) {
        continue;
      }

      const startAt = new Date(occurrence.startAt).getTime();

      const endAt = new Date(occurrence.endAt).getTime();

      if (
        !Number.isFinite(startAt) ||
        !Number.isFinite(endAt) ||
        endAt <= startAt
      ) {
        continue;
      }

      uniqueOccurrences.set(occurrence.occurrenceId, {
        ...occurrence,

        priority: Number.isFinite(occurrence.priority)
          ? occurrence.priority
          : 1,
      });
    }

    return Array.from(uniqueOccurrences.values()).sort((first, second) =>
      this.compareOccurrenceOrder(first, second),
    );
  }

  private normalizePlaylists(playlists: ProgrammingPlaylist[]) {
    const uniquePlaylists = new Map<string, ProgrammingPlaylist>();

    for (const playlist of playlists) {
      if (!playlist.id) {
        continue;
      }

      const normalizedPlaylist = normalizeProgrammingPlaylist(playlist);

      uniquePlaylists.set(playlist.id, {
        ...normalizedPlaylist,

        items: sortPlayerItems(normalizedPlaylist.items),
      });
    }

    return Array.from(uniquePlaylists.values());
  }

  private calculateClockOffset(serverTime: string, receivedAt: number) {
    const serverTimestamp = new Date(serverTime).getTime();

    if (!Number.isFinite(serverTimestamp)) {
      return this.clockOffsetMs;
    }

    return serverTimestamp - receivedAt;
  }

  private normalizeClockOffset(clockOffsetMs: number) {
    return Number.isFinite(clockOffsetMs) ? clockOffsetMs : 0;
  }

  private hasSameContent(
    occurrences: ProgrammingOccurrence[],
    playlists: ProgrammingPlaylist[],
  ) {
    return (
      this.createOccurrencesSignature(this.occurrences) ===
        this.createOccurrencesSignature(occurrences) &&
      this.createPlaylistsSignature(this.playlists) ===
        this.createPlaylistsSignature(playlists)
    );
  }

  private createOccurrencesSignature(occurrences: ProgrammingOccurrence[]) {
    return JSON.stringify(
      occurrences.map(occurrence => ({
        occurrenceId: occurrence.occurrenceId,

        scheduleId: occurrence.scheduleId,

        playlistId: occurrence.playlistId,

        startAt: occurrence.startAt,

        endAt: occurrence.endAt,

        priority: occurrence.priority,
      })),
    );
  }

  private createPlaylistsSignature(playlists: ProgrammingPlaylist[]) {
    return JSON.stringify(
      playlists.map(playlist => ({
        id: playlist.id,

        orientation: playlist.orientation,

        updatedAt: playlist.updatedAt,

        items: playlist.items.map(getPlayerItemSignatureData),
      })),
    );
  }

  private compareOccurrencePriority(
    first: ProgrammingOccurrence,
    second: ProgrammingOccurrence,
  ) {
    if (first.priority !== second.priority) {
      return second.priority - first.priority;
    }

    return (
      new Date(second.startAt).getTime() - new Date(first.startAt).getTime()
    );
  }

  private compareOccurrenceOrder(
    first: ProgrammingOccurrence,
    second: ProgrammingOccurrence,
  ) {
    const firstStart = new Date(first.startAt).getTime();

    const secondStart = new Date(second.startAt).getTime();

    if (firstStart !== secondStart) {
      return firstStart - secondStart;
    }

    return second.priority - first.priority;
  }

  private isEmpty() {
    return (
      this.version === null &&
      this.serverTime === null &&
      this.syncedAt === null &&
      this.occurrences.length === 0 &&
      this.playlists.length === 0
    );
  }

  private reset() {
    this.version = null;
    this.serverTime = null;
    this.timeZone = DEFAULT_TIME_ZONE;
    this.clockOffsetMs = 0;
    this.syncedAt = null;
    this.occurrences = [];
    this.playlists = [];
  }
}

export const programmingManager = new ProgrammingManager();

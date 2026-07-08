import {
  programmingState,
} from '../state/ProgrammingState';

import type {
  ProgrammingOccurrence,
  ProgrammingPlaylist,
  ProgrammingResponse,
  ProgrammingSnapshot,
} from '../types/Programming';

type ProgrammingListener = (
  snapshot:
    ProgrammingSnapshot,
) => void;

class ProgrammingManager {
  private version:
    string | null = null;

  private serverTime:
    string | null = null;

  private timeZone =
    'America/Fortaleza';

  private clockOffsetMs =
    0;

  private syncedAt:
    number | null = null;

  private occurrences:
    ProgrammingOccurrence[] = [];

  private playlists:
    ProgrammingPlaylist[] = [];

  private listeners =
    new Set<ProgrammingListener>();

  async hydrate() {
    try {
      const saved =
        await programmingState.load();

      if (!saved) {
        return false;
      }

      const correctedNow =
        Date.now() +
        saved.clockOffsetMs;

      const occurrences =
        this.normalizeOccurrences(
          saved.occurrences,
        ).filter(
          occurrence =>
            new Date(
              occurrence.endAt,
            ).getTime() >
            correctedNow,
        );

      if (
        occurrences.length ===
        0
      ) {
        await programmingState.clear();

        return false;
      }

      const playlistIds =
        new Set(
          occurrences.map(
            occurrence =>
              occurrence.playlistId,
          ),
        );

      const playlists =
        this.normalizePlaylists(
          saved.playlists,
        ).filter(
          playlist =>
            playlistIds.has(
              playlist.id,
            ),
        );

      this.version =
        saved.version;

      this.serverTime =
        saved.serverTime;

      this.timeZone =
        saved.timeZone ||
        'America/Fortaleza';

      this.clockOffsetMs =
        Number.isFinite(
          saved.clockOffsetMs,
        )
          ? saved.clockOffsetMs
          : 0;

      this.syncedAt =
        Number.isFinite(
          saved.syncedAt,
        )
          ? saved.syncedAt
          : Date.now();

      this.occurrences =
        occurrences;

      this.playlists =
        playlists;

      await programmingState.save(
        this.getSnapshot(),
      );

      console.log(
        '[PROGRAMMING] Programação local restaurada:',
        {
          occurrences:
            occurrences.length,

          playlists:
            playlists.length,
        },
      );

      this.emit();

      return true;
    } catch (error) {
      console.log(
        '[PROGRAMMING] Erro ao restaurar programação:',
        error,
      );

      await programmingState.clear();

      return false;
    }
  }

  async setProgramming(
    programming:
      ProgrammingResponse,
    receivedAt =
      Date.now(),
  ) {
    const normalizedOccurrences =
      this.normalizeOccurrences(
        programming.occurrences,
      );

    const normalizedPlaylists =
      this.normalizePlaylists(
        programming.playlists,
      );

    const serverTimestamp =
      new Date(
        programming.serverTime,
      ).getTime();

    const nextClockOffset =
      Number.isFinite(
        serverTimestamp,
      )
        ? serverTimestamp -
          receivedAt
        : this.clockOffsetMs;

    const contentChanged =
      this.version !==
        programming.version ||
      !this.hasSameContent(
        normalizedOccurrences,
        normalizedPlaylists,
      );

    this.version =
      programming.version;

    this.serverTime =
      programming.serverTime;

    this.timeZone =
      programming.timeZone ||
      'America/Fortaleza';

    this.clockOffsetMs =
      nextClockOffset;

    this.syncedAt =
      receivedAt;

    this.occurrences =
      normalizedOccurrences;

    this.playlists =
      normalizedPlaylists;

    await programmingState.save(
      this.getSnapshot(),
    );

    /*
     * Emitimos mesmo quando a versão é igual,
     * pois o clockOffset pode ter sido corrigido
     * por uma nova resposta do servidor.
     */
    this.emit();

    if (contentChanged) {
      console.log(
        '[PROGRAMMING] Programação atualizada:',
        {
          version:
            this.version,

          occurrences:
            this.occurrences.length,

          playlists:
            this.playlists.length,

          clockOffsetMs:
            this.clockOffsetMs,
        },
      );
    }

    return contentChanged;
  }

  clear() {
    const alreadyEmpty =
      this.version ===
        null &&
      this.occurrences.length ===
        0 &&
      this.playlists.length ===
        0;

    if (alreadyEmpty) {
      return false;
    }

    this.version =
      null;

    this.serverTime =
      null;

    this.clockOffsetMs =
      0;

    this.syncedAt =
      null;

    this.occurrences =
      [];

    this.playlists =
      [];

    void programmingState
      .clear()
      .catch(error => {
        console.log(
          '[PROGRAMMING] Erro ao limpar programação:',
          error,
        );
      });

    this.emit();

    return true;
  }

  getCorrectedNow() {
    return (
      Date.now() +
      this.clockOffsetMs
    );
  }

  getActiveOccurrence(
    timestamp =
      this.getCorrectedNow(),
  ) {
    return (
      this.occurrences
        .filter(
          occurrence => {
            const startAt =
              new Date(
                occurrence.startAt,
              ).getTime();

            const endAt =
              new Date(
                occurrence.endAt,
              ).getTime();

            return (
              startAt <=
                timestamp &&
              timestamp <
                endAt
            );
          },
        )
        .sort(
          (
            first,
            second,
          ) => {
            if (
              first.priority !==
              second.priority
            ) {
              return (
                second.priority -
                first.priority
              );
            }

            return (
              new Date(
                second.startAt,
              ).getTime() -
              new Date(
                first.startAt,
              ).getTime()
            );
          },
        )[0] ??
      null
    );
  }

  getNextBoundary(
    timestamp =
      this.getCorrectedNow(),
  ) {
    const boundaries =
      this.occurrences
        .flatMap(
          occurrence => [
            new Date(
              occurrence.startAt,
            ).getTime(),

            new Date(
              occurrence.endAt,
            ).getTime(),
          ],
        )
        .filter(
          value =>
            Number.isFinite(
              value,
            ) &&
            value >
              timestamp,
        )
        .sort(
          (
            first,
            second,
          ) =>
            first -
            second,
        );

    return (
      boundaries[0] ??
      null
    );
  }

  getPlaylist(
    playlistId: string,
  ) {
    const playlist =
      this.playlists.find(
        item =>
          item.id ===
          playlistId,
      );

    if (!playlist) {
      return null;
    }

    return {
      ...playlist,

      items: [
        ...playlist.items,
      ],
    };
  }

  getOccurrence(
    occurrenceId: string,
  ) {
    return (
      this.occurrences.find(
        occurrence =>
          occurrence
            .occurrenceId ===
          occurrenceId,
      ) ??
      null
    );
  }

  getVersion() {
    return this.version;
  }

  hasProgramming() {
    return (
      this.occurrences.length >
      0
    );
  }

  getSnapshot():
    ProgrammingSnapshot {
    return {
      version:
        this.version,

      serverTime:
        this.serverTime,

      timeZone:
        this.timeZone,

      clockOffsetMs:
        this.clockOffsetMs,

      syncedAt:
        this.syncedAt,

      occurrences:
        this.occurrences.map(
          occurrence => ({
            ...occurrence,
          }),
        ),

      playlists:
        this.playlists.map(
          playlist => ({
            ...playlist,

            items: [
              ...playlist.items,
            ],
          }),
        ),
    };
  }

  subscribe(
    listener:
      ProgrammingListener,
  ) {
    this.listeners.add(
      listener,
    );

    listener(
      this.getSnapshot(),
    );

    return () => {
      this.listeners.delete(
        listener,
      );
    };
  }

  private emit() {
    const snapshot =
      this.getSnapshot();

    this.listeners.forEach(
      listener => {
        try {
          listener(
            snapshot,
          );
        } catch (error) {
          console.log(
            '[PROGRAMMING] Erro no listener:',
            error,
          );
        }
      },
    );
  }

  private normalizeOccurrences(
    occurrences:
      ProgrammingOccurrence[],
  ) {
    const uniqueOccurrences =
      new Map<
        string,
        ProgrammingOccurrence
      >();

    for (
      const occurrence
      of occurrences
    ) {
      if (
        !occurrence.occurrenceId ||
        !occurrence.scheduleId ||
        !occurrence.playlistId
      ) {
        continue;
      }

      const startAt =
        new Date(
          occurrence.startAt,
        ).getTime();

      const endAt =
        new Date(
          occurrence.endAt,
        ).getTime();

      if (
        !Number.isFinite(
          startAt,
        ) ||
        !Number.isFinite(
          endAt,
        ) ||
        endAt <=
          startAt
      ) {
        continue;
      }

      uniqueOccurrences.set(
        occurrence.occurrenceId,
        {
          ...occurrence,

          priority:
            Number.isFinite(
              occurrence.priority,
            )
              ? occurrence.priority
              : 1,
        },
      );
    }

    return Array
      .from(
        uniqueOccurrences.values(),
      )
      .sort(
        (
          first,
          second,
        ) => {
          const firstStart =
            new Date(
              first.startAt,
            ).getTime();

          const secondStart =
            new Date(
              second.startAt,
            ).getTime();

          if (
            firstStart !==
            secondStart
          ) {
            return (
              firstStart -
              secondStart
            );
          }

          return (
            second.priority -
            first.priority
          );
        },
      );
  }

  private normalizePlaylists(
    playlists:
      ProgrammingPlaylist[],
  ) {
    const uniquePlaylists =
      new Map<
        string,
        ProgrammingPlaylist
      >();

    for (
      const playlist
      of playlists
    ) {
      if (!playlist.id) {
        continue;
      }

      uniquePlaylists.set(
        playlist.id,
        {
          ...playlist,

          items: [
            ...playlist.items,
          ].sort(
            (
              first,
              second,
            ) =>
              first.order -
              second.order,
          ),
        },
      );
    }

    return Array.from(
      uniquePlaylists.values(),
    );
  }

  private hasSameContent(
    occurrences:
      ProgrammingOccurrence[],

    playlists:
      ProgrammingPlaylist[],
  ) {
    return (
      JSON.stringify(
        this.occurrences,
      ) ===
        JSON.stringify(
          occurrences,
        ) &&
      JSON.stringify(
        this.playlists,
      ) ===
        JSON.stringify(
          playlists,
        )
    );
  }
}

export const programmingManager =
  new ProgrammingManager();

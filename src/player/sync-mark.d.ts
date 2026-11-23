declare module '*/tools/beat/sync-mark.js' {
  export interface FilmClockOptions {
    url?: string
    arrayBuffer?: ArrayBuffer
    duration?: number
    lead?: number
    tail?: number
    markAt?: number
    markHoldMs?: number
    blipHz?: number
    blips?: boolean
    avMs?: number
  }
  export interface FilmClock {
    ctx: AudioContext
    buffer: AudioBuffer
    duration: number
    lead: number
    tail: number
    start(): Promise<void>
    stop(): void
    started(): boolean
    time(): number
    markOn(): boolean
    done(): boolean
  }
  export function createFilmClock(options: FilmClockOptions): Promise<FilmClock>
}

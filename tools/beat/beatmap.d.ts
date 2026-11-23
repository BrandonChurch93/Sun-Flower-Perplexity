export interface Bar { bar: number; t: number; source_bar: number; cells: string; level_db: number }
export interface Section { name: string; bars?: [number, number]; from_s?: number; to_s?: number }
export interface Position { bar: number; beat: number; cell: number; inBar: number; inBeat: number }
export interface BeatMapFile {
  schema: string;
  fps?: number;
  source: { file: string; bytes: number; sha256: string; sample_rate: number; samples: number; seconds: number };
  tempo: { bpm: number; constant: boolean };
  meter: { beats_per_bar: number; cells_per_bar: number; beat_s: number; bar_s: number };
  grid: { bar1_s: number; pickup: { t: number; hit: string }[] };
  arrangement?: { name: string; samples: number; seconds: number; sha256: string };
  bars: Bar[];
  sections: Section[];
  events: { type: string; at?: string; bars?: number[]; t?: number; strongest?: boolean }[];
  energy: { per: string; unit: string; values: number[] };
}
export interface Beatmap {
  map: BeatMapFile;
  bpm: number;
  beat: number;
  bar: number;
  bars: number;
  duration: number;
  at(bar: number, beat?: number): number;
  time(pos: string | [number, number]): number;
  parse(pos: string | [number, number]): [number, number];
  barAt(t: number): Position;
  phase(t: number, unit?: 'beat' | 'bar'): number;
  section(t: number): Section | null;
  hits(bar: number): string;
  hitAt(bar: number, beat: number): string;
  frame(t: number, fps?: number): number;
}
export function createBeatmap(map: BeatMapFile): Beatmap;

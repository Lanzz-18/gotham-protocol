export type PillarId = string;

export interface LogEntry {
  id: string;
  ts: number;
  pillar: PillarId;
  action: string;
  xp: number;
  note: string;
}

export interface PillarAction {
  label: string;
  xp: number;
}

export interface PillarConfig {
  id: PillarId;
  name: string;
  theme: string;
  icon: string;
  accent: string;
  actions: PillarAction[];
  /** The villain that gains ground whenever this pillar goes untouched. */
  nemesis?: string;
}

export interface NemesisConfig {
  xpPerMissedDay: number;
}

export interface RankConfig {
  tier: number;
  title: string;
  threshold: number;
  aura: string;
}

export interface XpCurve {
  base: number;
  growth: number;
}

export interface EngineConfig {
  appName: string;
  xpCurve: XpCurve;
  pillars: PillarConfig[];
  ranks: RankConfig[];
  /** Hour at which a new day starts. 4 = a 1am log still counts for the night before. */
  dayBoundaryHour: number;
  nemesis: NemesisConfig;
}

export interface LevelResult {
  level: number;
  xp: number;
  need: number;
}

export interface PillarProgress {
  xp: number;
  level: number;
  lastActivity: number | null;
}

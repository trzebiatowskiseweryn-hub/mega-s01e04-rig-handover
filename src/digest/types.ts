// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as "—"
  runs: number; // lines for this job
  retries: number; // lines with status "retry"
  lastStatus: RunStatus;
  lastError: string | null; // the latest error this job logged, if any
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; empty for a night where nothing ran
  badLines: number; // lines that didn't parse, counted, never thrown
  counts: Record<RunStatus, number>; // parsed lines per status, for the board (§ 2c)
};

// null: no file for that night (the routes answer 404).
// Implemented in src/digest/reader.ts.
export type ReadNight = (runsDir: string, night: string) => Night | null;

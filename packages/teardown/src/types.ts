// ---------- Rubric (§5 — versioned in a file, never embedded in a prompt) ----------

export interface RubricAxis {
  id: string;
  n: number;
  name: string;
  buyerQuestion: string;
  dealStage: string;
  probes: string[];
}

export interface Rubric {
  version: string;
  name: string;
  scope: string;
  maxGaps: number;
  calibration: { expectDominant: string[]; note: string };
  spine: { minBeats: number; maxBeats: number; beatOneAxis: string; requireBoringCase: boolean };
  objections: { count: number; mandatoryAxes: string[] };
  axes: RubricAxis[];
}

// ---------- Public web surface (§4 — the only permitted input) ----------

export type PageKind =
  | 'landing' | 'pricing' | 'docs' | 'how-it-works'
  | 'security' | 'faq' | 'about' | 'other';

export interface SurfacePage {
  url: string;
  kind: PageKind;
  title: string;
  description: string;
  text: string;
  chars: number;
  truncated: boolean;
}

export interface VideoRef {
  url: string;
  provider: string;
  foundOn: string;
  transcript: string | null;
}

export interface WebSurface {
  rootUrl: string;
  host: string;
  fetchedAt: string;
  pages: SurfacePage[];
  videos: VideoRef[];
  notes: string[];
}

// ---------- Claim inventory (S1) ----------

export type ClaimKind =
  | 'capability' | 'outcome' | 'integration'
  | 'pricing' | 'proof' | 'constraint';

export interface Claim {
  id: string;
  kind: ClaimKind;
  text: string;
  quote: string;
  sourceUrl: string;
  /** Set by the verifier: did `quote` actually occur in the fetched surface? */
  verified?: boolean;
}

export interface UnitOfWork {
  stated: boolean;
  unit: string | null;
  evidence: string | null;
}

export interface ClaimInventory {
  claims: Claim[];
  unitOfWork: UnitOfWork;
}

// ---------- Gaps (S2, S3) ----------

export interface Evidence {
  quote: string;
  sourceUrl: string;
  verified?: boolean;
}

export interface Gap {
  rank: number;
  axisId: string;
  axisName: string;
  title: string;
  buyerQuestion: string;
  dealStage: string;
  whatThePageSays: string;
  whatsMissing: string;
  costOfTheGap: string;
  evidence: Evidence[];
}

// ---------- Demo spine (S4, S5, S6) ----------

export interface Beat {
  n: number;
  name: string;
  shown: string;
  claimProved: string;
  deliberatelyOmitted: string;
  boringCase: boolean;
}

export interface Objection {
  rank: number;
  objection: string;
  axisId: string;
  landsAtStage: string;
  defusedByBeat: number;
  howItIsDefused: string;
}

export interface Spine {
  beats: Beat[];
  objections: Objection[];
}

// ---------- Report ----------

export interface Calibration {
  expected: string[];
  observed: string[];
  dominant: boolean;
  note: string;
}

export interface Integrity {
  claimsTotal: number;
  claimsVerified: number;
  claimsDropped: number;
  droppedQuotes: string[];
  voided: boolean;
}

export interface TeardownReport {
  schemaVersion: string;
  rubricVersion: string;
  generatedAt: string;
  target: { url: string; host: string };
  model: string;
  effort: string;
  surface: {
    pages: { url: string; kind: PageKind; title: string; chars: number; truncated: boolean }[];
    videos: VideoRef[];
    notes: string[];
  };
  claims: ClaimInventory;
  gaps: Gap[];
  spine: Spine;
  calibration: Calibration;
  integrity: Integrity;
}

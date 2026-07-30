import { readFile, readdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { PageKind, Rubric } from './types.js';

const PAGE_KINDS: PageKind[] = [
  'landing', 'pricing', 'docs', 'how-it-works', 'security', 'faq', 'about', 'other',
];

/** `<pkg>/rubric/` — resolved from this module, so it survives `npm link` and global installs. */
export function rubricDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'rubric');
}

/**
 * Load a rubric by version ("0.1"), by explicit file path, or the newest
 * bundled version when neither is given.
 *
 * Every report is tagged with the version that produced it (§5), which is what
 * makes three teardowns an eval set rather than three anecdotes (S7).
 */
export async function loadRubric(ref?: string): Promise<Rubric> {
  const path = ref && (ref.endsWith('.json') || ref.includes('/'))
    ? resolve(ref)
    : join(rubricDir(), `v${ref ?? await latestVersion()}.json`);

  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`Rubric not found: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Rubric is not valid JSON (${path}): ${(err as Error).message}`);
  }

  return validateRubric(parsed, path);
}

export async function listVersions(): Promise<string[]> {
  const entries = await readdir(rubricDir());
  return entries
    .filter(f => /^v[\d.]+\.json$/.test(f))
    .map(f => f.slice(1, -5))
    .sort(compareVersions);
}

async function latestVersion(): Promise<string> {
  const versions = await listVersions();
  if (versions.length === 0) throw new Error(`No rubric files in ${rubricDir()}`);
  return versions[versions.length - 1];
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Structural validation. A malformed rubric must fail loudly at load time —
 * a rubric that silently loses an axis produces a report that looks complete
 * and is not.
 */
export function validateRubric(value: unknown, source: string): Rubric {
  const fail = (msg: string): never => {
    throw new Error(`Invalid rubric (${source}): ${msg}`);
  };

  if (typeof value !== 'object' || value === null) fail('expected a JSON object');
  const r = value as Record<string, unknown>;

  if (typeof r.version !== 'string' || r.version.length === 0) fail('missing "version"');
  if (typeof r.maxGaps !== 'number' || r.maxGaps < 1) fail('"maxGaps" must be a positive number');
  if (!Array.isArray(r.axes) || r.axes.length === 0) fail('"axes" must be a non-empty array');

  const seen = new Set<string>();
  for (const [i, axis] of (r.axes as unknown[]).entries()) {
    const a = axis as Record<string, unknown>;
    if (typeof a?.id !== 'string' || a.id.length === 0) fail(`axes[${i}] missing "id"`);
    if (seen.has(a.id as string)) fail(`duplicate axis id "${a.id}"`);
    seen.add(a.id as string);
    for (const field of ['name', 'buyerQuestion', 'dealStage']) {
      if (typeof a[field] !== 'string' || (a[field] as string).length === 0) {
        fail(`axes[${i}] ("${a.id}") missing "${field}"`);
      }
    }
    if (!Array.isArray(a.probes) || a.probes.length === 0) {
      fail(`axes[${i}] ("${a.id}") must have at least one probe`);
    }
    if (!Array.isArray(a.evidencePages) || a.evidencePages.length === 0) {
      fail(`axes[${i}] ("${a.id}") must list at least one "evidencePages" kind`);
    }
    for (const kind of a.evidencePages as string[]) {
      if (!PAGE_KINDS.includes(kind as PageKind)) {
        fail(`axes[${i}] ("${a.id}") lists unknown page kind "${kind}"`);
      }
    }
  }

  const spine = r.spine as Record<string, unknown> | undefined;
  if (!spine) fail('missing "spine"');
  if (typeof spine!.minBeats !== 'number' || typeof spine!.maxBeats !== 'number') {
    fail('"spine.minBeats" and "spine.maxBeats" must be numbers');
  }
  if ((spine!.minBeats as number) > (spine!.maxBeats as number)) {
    fail('"spine.minBeats" exceeds "spine.maxBeats"');
  }
  if (typeof spine!.beatOneAxis !== 'string' || !seen.has(spine!.beatOneAxis as string)) {
    fail(`"spine.beatOneAxis" must name a defined axis (got "${spine!.beatOneAxis}")`);
  }

  const calibration = r.calibration as Record<string, unknown> | undefined;
  if (!calibration || !Array.isArray(calibration.expectDominant)) {
    fail('missing "calibration.expectDominant"');
  }
  for (const id of calibration!.expectDominant as string[]) {
    if (!seen.has(id)) fail(`"calibration.expectDominant" names unknown axis "${id}"`);
  }

  const objections = r.objections as Record<string, unknown> | undefined;
  if (!objections || typeof objections.count !== 'number') fail('missing "objections.count"');
  for (const id of (objections!.mandatoryAxes as string[] | undefined) ?? []) {
    if (!seen.has(id)) fail(`"objections.mandatoryAxes" names unknown axis "${id}"`);
  }

  return value as Rubric;
}

export function axisById(rubric: Rubric, id: string) {
  return rubric.axes.find(a => a.id === id);
}

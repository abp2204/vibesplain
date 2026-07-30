import { ArtifactBundleWriter, type Artifact } from '@vibesplain/brain';
import type { Rubric, TeardownReport, WebSurface } from './types.js';
import { crawlSurface, type CrawlOptions } from './surface/fetch.js';
import { extractClaims } from './grill/claims.js';
import { grillSurface } from './grill/gaps.js';
import { buildQuoteIndex, quoteIsPresent, verifyClaims, verifyEvidence } from './grill/verify.js';
import { renderMarkdown } from './report/markdown.js';
import type { GrillEngine } from './grill/client.js';

export const SCHEMA_VERSION = '1.0.0';

export interface RunOptions extends CrawlOptions {
  rubric: Rubric;
  engine: GrillEngine;
  onProgress?: (message: string) => void;
}

/**
 * Fetch → inventory → verify → grill → verify → assemble.
 *
 * Verification runs twice on purpose: once as the S1 trust gate before the
 * critique is written, and once over the critique's own evidence.
 */
export async function runTeardown(url: string, options: RunOptions): Promise<TeardownReport> {
  const onProgress = options.onProgress ?? (() => {});
  onProgress(`Fetching public web surface for ${url}`);
  const surface = await crawlSurface(url, options);
  onProgress(`Read ${surface.pages.length} page(s): ${surface.pages.map(p => p.kind).join(', ')}`);
  return runTeardownOnSurface(surface, options);
}

/**
 * The pipeline minus the fetch, so an already-crawled surface can be re-grilled
 * against a new rubric version without re-fetching the company's pages.
 */
export async function runTeardownOnSurface(
  surface: WebSurface,
  options: Omit<RunOptions, keyof CrawlOptions>,
): Promise<TeardownReport> {
  const { rubric, engine, onProgress = () => {} } = options;

  onProgress('Building claim inventory');
  const raw = await extractClaims(engine, surface, rubric);

  const index = buildQuoteIndex(surface);
  const { kept, dropped } = verifyClaims(index, raw.claims);
  onProgress(`Verified ${kept.length}/${raw.claims.length} claims against the fetched pages`);

  // A stated unit of work only counts if its own evidence quote checks out;
  // an unverifiable unit is the same finding as no unit at all (S3).
  const unitVerified = Boolean(
    raw.unitOfWork.stated &&
    raw.unitOfWork.evidence &&
    quoteIsPresent(index, raw.unitOfWork.evidence)
  );

  const inventory = {
    claims: kept,
    unitOfWork: unitVerified ? raw.unitOfWork : { stated: false, unit: null, evidence: null },
  };

  const voided = raw.claims.length > 0 && kept.length === 0;

  let gaps: TeardownReport['gaps'] = [];
  let spine: TeardownReport['spine'] = { beats: [], objections: [] };

  if (!voided) {
    onProgress(`Grilling against rubric v${rubric.version}`);
    const result = await grillSurface(engine, surface, inventory, rubric);
    gaps = result.gaps.map(gap => ({ ...gap, evidence: verifyEvidence(index, gap.evidence) }));
    spine = result.spine;
    onProgress(`Found ${gaps.length} gap(s); spine has ${spine.beats.length} beat(s)`);
  } else {
    onProgress('No claim survived verification — report voided, critique skipped');
  }

  const observed = gaps.filter(g => g.rank <= 3).map(g => g.axisId);
  const expected = rubric.calibration.expectDominant;

  return {
    schemaVersion: SCHEMA_VERSION,
    rubricVersion: rubric.version,
    generatedAt: new Date().toISOString(),
    target: { url: surface.rootUrl, host: surface.host },
    model: engine.model,
    effort: engine.effort,
    surface: {
      pages: surface.pages.map(({ url, kind, title, chars, truncated }) => ({
        url, kind, title, chars, truncated,
      })),
      videos: surface.videos,
      notes: surface.notes,
    },
    claims: inventory,
    gaps,
    spine,
    calibration: {
      expected,
      observed,
      dominant: observed.some(id => expected.includes(id)),
      note: rubric.calibration.note,
    },
    integrity: {
      claimsTotal: raw.claims.length,
      claimsVerified: kept.length,
      claimsDropped: dropped.length,
      droppedQuotes: dropped.map(c => c.quote),
      voided,
    },
  };
}

/**
 * Writes report.md, report.json and the crawled surface into `<out>/.teardown`
 * via vibesplain's atomic bundle writer, so a partial run never leaves a
 * half-written report behind and every file is checksummed in the manifest.
 */
export async function writeTeardownBundle(
  outRoot: string,
  report: TeardownReport,
  surface?: WebSurface,
): Promise<void> {
  const artifacts: Artifact[] = [
    { type: 'teardown-report', path: 'report.md', content: renderMarkdown(report) },
    { type: 'teardown-data', path: 'report.json', content: JSON.stringify(report, null, 2) },
  ];
  if (surface) {
    artifacts.push({ type: 'teardown-surface', path: 'surface.json', content: JSON.stringify(surface, null, 2) });
  }
  await new ArtifactBundleWriter(outRoot, '.teardown').writeBundle(artifacts);
}

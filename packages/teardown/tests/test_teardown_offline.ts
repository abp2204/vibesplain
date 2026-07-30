import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { readFile } from 'fs/promises';

import { assert, assertThrows, assertThrowsAsync, FakeGrill } from './helpers.js';
import { loadRubric, validateRubric, listVersions } from '../src/rubric.js';
import { htmlToText, extractLinks, extractVideoUrls, decodeEntities } from '../src/surface/extract.js';
import { buildQuoteIndex, quoteIsPresent, verifyClaims } from '../src/grill/verify.js';
import { normalize } from '../src/grill/gaps.js';
import { runTeardownOnSurface, writeTeardownBundle } from '../src/teardown.js';
import { renderMarkdown } from '../src/report/markdown.js';
import { diffReports, renderDiffMarkdown } from '../src/report/diff.js';
import type { Rubric, WebSurface } from '../src/types.js';

const LANDING_TEXT = [
  'Rezolve resolves your support tickets automatically.',
  'Our agent reads the ticket, checks your knowledge base, and drafts a reply.',
  'Teams using Rezolve close 40% more tickets per week.',
  'Connects to Zendesk, Intercom and Front in minutes.',
].join('\n');

function fixtureSurface(): WebSurface {
  return {
    rootUrl: 'https://rezolve.example/',
    host: 'rezolve.example',
    fetchedAt: '2026-07-30T00:00:00.000Z',
    pages: [
      {
        url: 'https://rezolve.example/',
        kind: 'landing',
        title: 'Rezolve — support that resolves itself',
        description: 'AI agents for support teams.',
        text: LANDING_TEXT,
        chars: LANDING_TEXT.length,
        truncated: false,
      },
      {
        url: 'https://rezolve.example/pricing',
        kind: 'pricing',
        title: 'Pricing',
        description: '',
        text: 'Starter is $500 per month for up to 5 seats. Enterprise pricing is custom.',
        chars: 72,
        truncated: false,
      },
    ],
    videos: [],
    notes: ['No docs page was linked from the landing page.'],
  };
}

async function testRubric() {
  const rubric = await loadRubric();
  assert(rubric.version === '0.1', `expected rubric v0.1, got v${rubric.version}`);
  assert(rubric.axes.length === 8, `expected 8 axes, got ${rubric.axes.length}`);
  assert(rubric.maxGaps === 6, 'rubric must cap gaps at 6 (S2)');
  assert(rubric.spine.beatOneAxis === 'time-to-first-value', 'beat 1 must be time-to-first-value (S4)');
  assert(rubric.spine.requireBoringCase === true, 'rubric must require a boring case (S6)');

  const byId = await loadRubric('0.1');
  assert(byId.version === '0.1', 'loading by explicit version must work');

  const versions = await listVersions();
  assert(versions.includes('0.1'), 'v0.1 must be discoverable');

  await assertThrowsAsync(() => loadRubric('9.9'), 'Rubric not found');

  const base = JSON.parse(JSON.stringify(rubric));
  assertThrows(() => validateRubric({ ...base, axes: [] }, 't'), 'non-empty array');
  assertThrows(() => validateRubric({ ...base, version: '' }, 't'), 'missing "version"');
  assertThrows(
    () => validateRubric({ ...base, spine: { ...base.spine, beatOneAxis: 'nope' } }, 't'),
    'must name a defined axis',
  );
  assertThrows(
    () => validateRubric({ ...base, calibration: { ...base.calibration, expectDominant: ['ghost'] } }, 't'),
    'unknown axis',
  );
  assertThrows(
    () => validateRubric({ ...base, axes: [base.axes[0], base.axes[0]] }, 't'),
    'duplicate axis id',
  );

  console.error('  [rubric] ok');
}

function testExtraction() {
  const html = `
    <html><head><title>Acme &amp; Co</title>
    <meta name="description" content="Agents that ship">
    <style>.x{color:red}</style></head>
    <body>
      <script>var evil = "<p>not text</p>";</script>
      <h1>Resolve tickets</h1>
      <p>We handle the boring&nbsp;ones.</p>
      <ul><li>Zendesk</li><li>Intercom</li></ul>
      <a href="/pricing">Pricing</a>
      <a href="https://elsewhere.test/x">Offsite</a>
      <a href="#top">Anchor</a>
      <a href="mailto:a@b.c">Mail</a>
      <iframe src="https://www.youtube.com/embed/abc123XYZ_-"></iframe>
    </body></html>`;

  const doc = htmlToText(html);
  assert(doc.title === 'Acme & Co', `title decode failed: "${doc.title}"`);
  assert(doc.description === 'Agents that ship', `description failed: "${doc.description}"`);
  assert(!doc.text.includes('evil'), 'script contents must be stripped');
  assert(!doc.text.includes('color:red'), 'style contents must be stripped');
  assert(doc.text.includes('Resolve tickets'), 'heading text must survive');
  assert(doc.text.includes('We handle the boring ones.'), `nbsp handling failed: "${doc.text}"`);
  assert(/Zendesk\nIntercom/.test(doc.text), 'list items must be newline-separated');

  const links = extractLinks(html, 'https://acme.test/');
  const hrefs = links.map(l => l.href);
  assert(hrefs.includes('https://acme.test/pricing'), 'relative link must resolve absolute');
  assert(hrefs.includes('https://elsewhere.test/x'), 'offsite links are returned (filtered later)');
  assert(!hrefs.some(h => h.startsWith('mailto:')), 'mailto must be skipped');
  assert(!hrefs.some(h => h.endsWith('#top')), 'bare anchors must be skipped');

  const videos = extractVideoUrls(html, 'https://acme.test/');
  assert(videos.length === 1 && videos[0].provider === 'youtube', 'youtube embed must be detected');

  assert(decodeEntities('&#8212;&hellip;&#x2014;') === '—…—', 'numeric entity decode failed');
  assert(decodeEntities('&unknownentity;') === '&unknownentity;', 'unknown entities must pass through');

  console.error('  [extract] ok');
}

function testVerification() {
  const index = buildQuoteIndex(fixtureSurface());

  assert(
    quoteIsPresent(index, 'Our agent reads the ticket, checks your knowledge base'),
    'verbatim quote must verify',
  );
  assert(
    quoteIsPresent(index, 'Our agent reads the  ticket,   checks your knowledge base'),
    'whitespace differences must be tolerated',
  );
  assert(
    quoteIsPresent(index, 'Our agent reads the ticket ... drafts a reply'),
    'ellipsis-joined fragments must verify',
  );
  assert(
    !quoteIsPresent(index, 'Rezolve is SOC 2 Type II certified and handles PII safely'),
    'a fabricated quote must NOT verify',
  );
  assert(!quoteIsPresent(index, 'the agent'), 'short fragments must not verify trivially');
  assert(
    quoteIsPresent(index, 'Starter is $500 per month', 'https://rezolve.example/pricing'),
    'source-scoped verification must work',
  );

  const { kept, dropped } = verifyClaims(index, [
    {
      id: 'C1', kind: 'capability',
      text: 'The agent drafts replies.',
      quote: 'checks your knowledge base, and drafts a reply',
      sourceUrl: 'https://rezolve.example/',
    },
    {
      id: 'C2', kind: 'proof',
      text: 'It is SOC 2 certified.',
      quote: 'Rezolve is SOC 2 Type II certified across all plans',
      sourceUrl: 'https://rezolve.example/',
    },
  ]);
  assert(kept.length === 1 && kept[0].id === 'C1', 'only the real claim survives');
  assert(dropped.length === 1 && dropped[0].id === 'C2', 'the invented claim is dropped');
  assert(kept[0].verified === true, 'kept claims are marked verified');

  console.error('  [verify] ok');
}

async function testNormalizationCaps() {
  const rubric = await loadRubric();

  const gaps = rubric.axes.map((axis, i) => ({
    rank: i + 1, axisId: axis.id, axisName: '', title: `Gap ${i}`,
    buyerQuestion: '', dealStage: '',
    whatThePageSays: 'x', whatsMissing: 'y', costOfTheGap: 'z', evidence: [],
  }));
  // A duplicate axis and an axis the rubric does not define.
  gaps.push({ ...gaps[0], rank: 99, title: 'Duplicate axis' });
  gaps.push({ ...gaps[0], axisId: 'not-an-axis', rank: 100, title: 'Unknown axis' });

  const beats = Array.from({ length: 9 }, (_, i) => ({
    n: i + 1, name: `Beat ${i}`, shown: 'x', claimProved: 'y',
    deliberatelyOmitted: 'z', boringCase: i === 0,
  }));
  const objections = Array.from({ length: 7 }, (_, i) => ({
    rank: i + 1, objection: `O${i}`, axisId: rubric.axes[0].id,
    landsAtStage: 's', defusedByBeat: 1, howItIsDefused: 'h',
  }));

  const result = normalize({ gaps, spine: { beats, objections } }, rubric);

  assert(result.gaps.length === rubric.maxGaps, `gaps must cap at ${rubric.maxGaps}, got ${result.gaps.length}`);
  assert(
    new Set(result.gaps.map(g => g.axisId)).size === result.gaps.length,
    'one gap per axis at most',
  );
  assert(!result.gaps.some(g => g.axisId === 'not-an-axis'), 'unknown axes must be discarded');
  assert(
    result.gaps.every((g, i) => g.rank === i + 1),
    'ranks must be contiguous from 1',
  );
  assert(result.gaps[0].axisName.length > 0, 'axis metadata must be hydrated from the rubric');
  assert(result.gaps[0].buyerQuestion.length > 0, 'buyer question must be hydrated (S2)');

  assert(
    result.spine.beats.length === rubric.spine.maxBeats,
    `beats must cap at ${rubric.spine.maxBeats}, got ${result.spine.beats.length}`,
  );
  assert(result.spine.beats.every((b, i) => b.n === i + 1), 'beats must be renumbered');
  assert(
    result.spine.objections.length === rubric.objections.count,
    `objections must cap at ${rubric.objections.count}`,
  );

  console.error('  [caps] ok');
}

function goodClaims() {
  return {
    claims: [
      {
        id: 'C1', kind: 'capability' as const,
        text: 'The agent drafts ticket replies.',
        quote: 'Our agent reads the ticket, checks your knowledge base, and drafts a reply',
        sourceUrl: 'https://rezolve.example/',
      },
      {
        id: 'C2', kind: 'outcome' as const,
        text: 'Customers close more tickets.',
        quote: 'close 40% more tickets per week',
        sourceUrl: 'https://rezolve.example/',
      },
      {
        id: 'C3', kind: 'proof' as const,
        text: 'It is certified to a security standard.',
        quote: 'Rezolve is ISO 27001 certified and audited quarterly',
        sourceUrl: 'https://rezolve.example/',
      },
    ],
    unitOfWork: {
      stated: true,
      unit: 'per seat per month',
      evidence: 'Starter is $500 per month for up to 5 seats',
    },
  };
}

function goodGrill(rubric: Rubric) {
  return {
    gaps: [
      {
        rank: 1, axisId: 'failure-behavior', axisName: '', title: 'Nothing says what happens on a wrong reply',
        buyerQuestion: '', dealStage: '',
        whatThePageSays: 'The agent drafts a reply.',
        whatsMissing: 'What happens when the draft is wrong.',
        costOfTheGap: 'Support leads cannot approve a pilot.',
        evidence: [
          { quote: 'checks your knowledge base, and drafts a reply', sourceUrl: 'https://rezolve.example/' },
          { quote: 'Rezolve guarantees 99.9% reply accuracy', sourceUrl: 'https://rezolve.example/' },
        ],
      },
      {
        rank: 2, axisId: 'unit-of-work', axisName: '', title: 'Pricing unit and value unit disagree',
        buyerQuestion: '', dealStage: '',
        whatThePageSays: 'Priced per seat.',
        whatsMissing: 'Value is per resolved ticket.',
        costOfTheGap: 'Buyer cannot build a business case.',
        evidence: [{ quote: 'Starter is $500 per month for up to 5 seats', sourceUrl: 'https://rezolve.example/pricing' }],
      },
    ],
    spine: {
      beats: [
        { n: 1, name: 'First value', shown: 'Connect Zendesk, resolve one live ticket.', claimProved: 'It works on your data.', deliberatelyOmitted: 'Bulk backlog.', boringCase: false },
        { n: 2, name: 'The Tuesday case', shown: 'Twenty password-reset tickets in a row.', claimProved: 'It works on the repeated case.', deliberatelyOmitted: 'Edge cases.', boringCase: true },
        { n: 3, name: 'When it is wrong', shown: 'A low-confidence ticket escalating to a human.', claimProved: 'Failure is handled.', deliberatelyOmitted: 'Accuracy stats.', boringCase: false },
      ],
      objections: [
        { rank: 1, objection: 'What if it answers wrong?', axisId: 'failure-behavior', landsAtStage: 'Technical evaluation', defusedByBeat: 3, howItIsDefused: 'Beat 3 shows the escalation path.' },
        { rank: 2, objection: 'What am I paying for?', axisId: 'unit-of-work', landsAtStage: 'First call', defusedByBeat: 1, howItIsDefused: 'Beat 1 ties value to a resolved ticket.' },
      ],
    },
  };
}

async function testPipeline() {
  const rubric = await loadRubric();
  const engine = new FakeGrill([goodClaims(), goodGrill(rubric)]);

  const report = await runTeardownOnSurface(fixtureSurface(), { rubric, engine });

  assert(report.rubricVersion === '0.1', 'report must be tagged with the rubric version (§5)');
  assert(report.integrity.claimsTotal === 3, 'three claims were extracted');
  assert(report.integrity.claimsVerified === 2, 'two claims verify');
  assert(report.integrity.claimsDropped === 1, 'the ISO 27001 claim is fabricated and must be dropped');
  assert(report.integrity.voided === false, 'a partially-verified report is not voided');
  assert(!report.claims.claims.some(c => c.id === 'C3'), 'the dropped claim must not appear in the inventory');
  assert(report.claims.unitOfWork.stated === true, 'a verified unit of work is kept (S3)');

  const failureGap = report.gaps.find(g => g.axisId === 'failure-behavior')!;
  assert(failureGap !== undefined, 'the failure-behavior gap survives');
  assert(failureGap.buyerQuestion.includes('wrong'), 'gap carries the rubric buyer question (S2)');
  assert(failureGap.dealStage.length > 0, 'gap carries the deal stage where it stalls (S2)');
  assert(
    failureGap.evidence.filter(e => e.verified).length === 1,
    'only the real evidence quote verifies',
  );
  assert(
    failureGap.evidence.some(e => e.verified === false),
    'the invented "99.9% accuracy" quote must be marked unverified',
  );

  assert(report.spine.beats.some(b => b.boringCase), 'spine contains the boring case (S6)');
  assert(report.spine.objections.length === 2, 'objections are carried through');
  assert(report.calibration.dominant === true, 'findings hit the expected dominant axes');

  // Two API calls, and the surface text was actually handed to both.
  assert(engine.requests.length === 2, 'exactly one claims pass and one grill pass');
  assert(
    engine.requests[1].user.includes('close 40% more tickets per week'),
    'the grill pass receives the verified inventory',
  );
  assert(
    !engine.requests[1].user.includes('ISO 27001'),
    'the grill pass must NOT receive the dropped claim',
  );

  const markdown = renderMarkdown(report);
  for (const section of [
    'Teardown — rezolve.example',
    'What was read',
    'Your claims, as a buyer reads them',
    'Unit of work',
    'The demo spine',
    'Where the objections land',
    'Method',
    'Rubric calibration',
  ]) {
    assert(markdown.includes(section), `report markdown missing section: ${section}`);
  }
  assert(markdown.includes('**Rubric** v0.1'), 'markdown must state the rubric version (§5)');
  assert(!markdown.includes('99.9% reply accuracy'), 'unverified evidence must not be printed');
  assert(
    !markdown.includes('ISO 27001'),
    'fabricated text must never reach the founder-facing report, not even as a dropped quote',
  );
  assert(markdown.includes('1 claim dropped'), 'method section must disclose the dropped claim count');
  assert(
    report.integrity.droppedQuotes.some(q => q.includes('ISO 27001')),
    'the dropped quote is retained in report.json for operator debugging',
  );

  console.error('  [pipeline] ok');
  return report;
}

async function testVoidedReport() {
  const rubric = await loadRubric();
  const engine = new FakeGrill([
    {
      claims: [
        { id: 'C1', kind: 'capability', text: 'Invented.', quote: 'This sentence appears on no page anywhere at all', sourceUrl: 'https://rezolve.example/' },
      ],
      unitOfWork: { stated: true, unit: 'per widget', evidence: 'We charge per widget processed each month' },
    },
  ]);

  const report = await runTeardownOnSurface(fixtureSurface(), { rubric, engine });

  assert(report.integrity.voided === true, 'zero verified claims must void the report (S1)');
  assert(report.gaps.length === 0, 'a voided report prints no critique');
  assert(engine.requests.length === 1, 'the grill pass must be skipped when the trust gate fails');
  assert(report.claims.unitOfWork.stated === false, 'an unverifiable unit of work is discarded');

  const markdown = renderMarkdown(report);
  assert(markdown.includes('Report voided'), 'voided reports must say so');
  assert(!markdown.includes('costing you deals'), 'voided reports must not print gaps');

  console.error('  [voided] ok');
}

async function testDiff(base: Awaited<ReturnType<typeof testPipeline>>) {
  const next = JSON.parse(JSON.stringify(base)) as typeof base;
  next.rubricVersion = '0.2';
  next.generatedAt = '2026-08-01T00:00:00.000Z';
  // failure-behavior drops to #2, blast-radius appears at #1, unit-of-work falls out.
  next.gaps = [
    { ...base.gaps[0], rank: 2 },
    {
      ...base.gaps[1], rank: 1, axisId: 'blast-radius', axisName: 'Blast radius',
      title: 'No statement of what the agent can write to',
    },
  ];

  const diff = diffReports(base, next);
  assert(diff.sameTarget === true, 'same host must be recognised');

  const byAxis = new Map(diff.axes.map(a => [a.axisId, a]));
  assert(byAxis.get('blast-radius')?.status === 'added', 'blast-radius is newly surfaced');
  assert(byAxis.get('unit-of-work')?.status === 'removed', 'unit-of-work dropped out');
  assert(byAxis.get('failure-behavior')?.status === 'moved', 'failure-behavior changed rank');
  assert(byAxis.get('failure-behavior')?.fromRank === 1, 'from-rank recorded');
  assert(byAxis.get('failure-behavior')?.toRank === 2, 'to-rank recorded');

  const markdown = renderDiffMarkdown(diff);
  assert(markdown.includes('v0.1') && markdown.includes('v0.2'), 'diff names both rubric versions (S7)');
  assert(markdown.includes('Blast radius'), 'diff lists the new axis');
  assert(markdown.includes('newly surfaced'), 'diff summarises movement');

  console.error('  [diff] ok');
}

async function testBundleWrite(report: Awaited<ReturnType<typeof testPipeline>>) {
  const dir = mkdtempSync(join(tmpdir(), 'teardown-test-'));
  try {
    await writeTeardownBundle(dir, report);

    const manifest = JSON.parse(await readFile(join(dir, '.teardown', 'artifact_manifest.json'), 'utf8'));
    const paths = manifest.artifacts.map((a: { path: string }) => a.path).sort();
    assert(
      JSON.stringify(paths) === JSON.stringify(['report.json', 'report.md']),
      `unexpected bundle contents: ${paths.join(', ')}`,
    );
    assert(
      manifest.artifacts.every((a: { checksum: string }) => a.checksum.startsWith('sha256:')),
      'every artifact must be checksummed',
    );

    const md = await readFile(join(dir, '.teardown', 'report.md'), 'utf8');
    assert(md.includes('Teardown — rezolve.example'), 'report.md written through the shared writer');

    const roundTrip = JSON.parse(await readFile(join(dir, '.teardown', 'report.json'), 'utf8'));
    assert(roundTrip.rubricVersion === '0.1', 'report.json round-trips');

    // Rewriting must swap atomically, not accumulate stale directories.
    await writeTeardownBundle(dir, report);
    const { existsSync } = await import('fs');
    assert(!existsSync(join(dir, '.teardown.tmp')), 'staging dir must not survive');
    assert(!existsSync(join(dir, '.teardown.old')), 'rollback dir must not survive');

    console.error('  [bundle] ok');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function testCustomRubricFile() {
  const dir = mkdtempSync(join(tmpdir(), 'teardown-rubric-'));
  try {
    const base = await loadRubric();
    const custom = { ...JSON.parse(JSON.stringify(base)), version: '0.2-experimental', maxGaps: 3 };
    const path = join(dir, 'custom.json');
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(custom), 'utf8');

    const loaded = await loadRubric(path);
    assert(loaded.version === '0.2-experimental', 'a rubric file path must load (§5: rubric is a file)');
    assert(loaded.maxGaps === 3, 'custom caps must apply');

    console.error('  [custom rubric] ok');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function run() {
  console.error('[teardown] offline suite — no network, no API key');
  await testRubric();
  testExtraction();
  testVerification();
  await testNormalizationCaps();
  const report = await testPipeline();
  await testVoidedReport();
  await testDiff(report);
  await testBundleWrite(report);
  await testCustomRubricFile();
  console.log('[teardown] PASS: rubric, extraction, verification, caps, pipeline, void gate, diff, bundle.');
}

run().catch(err => {
  console.error('[teardown] FAIL:', err);
  process.exit(1);
});

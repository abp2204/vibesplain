import type { ClaimInventory, Gap, Rubric, Spine, WebSurface } from '../types.js';
import { surfaceToPrompt } from '../surface/fetch.js';
import type { GrillEngine } from './client.js';

export interface GrillResult {
  gaps: Gap[];
  spine: Spine;
}

function buildSchema(rubric: Rubric): Record<string, unknown> {
  const axisIds = rubric.axes.map(a => a.id);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['gaps', 'spine'],
    properties: {
      gaps: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'rank', 'axisId', 'title', 'whatThePageSays', 'whatsMissing', 'costOfTheGap', 'evidence',
          ],
          properties: {
            rank: { type: 'integer', description: '1 is the gap costing the most deals.' },
            axisId: { type: 'string', enum: axisIds },
            title: { type: 'string', description: 'One line naming the gap concretely.' },
            whatThePageSays: { type: 'string', description: 'What the surface currently communicates on this axis.' },
            whatsMissing: { type: 'string', description: 'The specific thing a buyer needs and cannot find.' },
            costOfTheGap: { type: 'string', description: 'What this costs in the deal, concretely.' },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['quote', 'sourceUrl'],
                properties: {
                  quote: { type: 'string', description: 'Verbatim excerpt, copied exactly.' },
                  sourceUrl: { type: 'string' },
                },
              },
            },
          },
        },
      },
      spine: {
        type: 'object',
        additionalProperties: false,
        required: ['beats', 'objections'],
        properties: {
          beats: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['n', 'name', 'shown', 'claimProved', 'deliberatelyOmitted', 'boringCase'],
              properties: {
                n: { type: 'integer' },
                name: { type: 'string' },
                shown: { type: 'string', description: 'Exactly what is on screen during this beat.' },
                claimProved: { type: 'string', description: 'The claim this beat proves.' },
                deliberatelyOmitted: { type: 'string', description: 'What this beat leaves out on purpose, and why.' },
                boringCase: { type: 'boolean', description: 'True if this beat shows a high-frequency unglamorous workflow.' },
              },
            },
          },
          objections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['rank', 'objection', 'axisId', 'landsAtStage', 'defusedByBeat', 'howItIsDefused'],
              properties: {
                rank: { type: 'integer' },
                objection: { type: 'string', description: 'In the buyer\'s own voice.' },
                axisId: { type: 'string', enum: axisIds },
                landsAtStage: { type: 'string', description: 'The deal stage where this objection surfaces.' },
                defusedByBeat: { type: 'integer', description: 'The beat number that preempts it.' },
                howItIsDefused: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };
}

function buildSystem(rubric: Rubric): string {
  const axes = rubric.axes
    .map(a => [
      `${a.n}. ${a.name} (id: ${a.id})`,
      `   Buyer question: ${a.buyerQuestion}`,
      `   Where it stalls: ${a.dealStage}`,
      ...a.probes.map(p => `   - ${p}`),
    ].join('\n'))
    .join('\n\n');

  const mandatory = rubric.objections.mandatoryAxes
    .map(id => rubric.axes.find(a => a.id === id)?.name ?? id)
    .join(', ');

  return `You are running a positioning teardown of an AI agent company against rubric v${rubric.version}.

Agent products are structurally hard to demo: the output is probabilistic, the value is invisible, and the honest live demo is a bad demo. Founders respond by showing the flashiest case, which is the case buyers trust least. Your job is to find what the public web surface fails to answer, and the demo sequence that answers it.

=== RUBRIC v${rubric.version}: ${rubric.name} ===
${axes}

=== HARD CONSTRAINTS ===

INPUT. The supplied pages are your only source. You have no product access, no screenshots, no sandbox, and no prior knowledge of this company. Everything you assert must be derivable from what a buyer could have read themselves — that constraint is the report's honesty guarantee.

EVIDENCE. Every quote must be copied verbatim from the supplied text. Quotes are checked against the source automatically and unverifiable ones are stripped. Use "..." only to join two exact fragments. A gap whose evidence is that the page says nothing on the axis should quote the closest thing the page does say, or carry no evidence at all — never invent an absence quote.

GAPS. At most ${rubric.maxGaps}, ranked by what costs deals — not a flat list of everything wrong. A 40-item audit is noise. One gap per axis at most; pick the axis that best names it. Rank 1 is the gap losing the most deals. If fewer than ${rubric.maxGaps} gaps genuinely cost deals, return fewer.

SPINE. ${rubric.spine.minBeats}–${rubric.spine.maxBeats} beats that the founder can run on Monday without redesigning anything. Beat 1 is always ${
    rubric.axes.find(a => a.id === rubric.spine.beatOneAxis)?.name ?? rubric.spine.beatOneAxis
  } — the buyer sees it work before anything else.${
    rubric.spine.requireBoringCase
      ? ' At least one beat must show the repeated, unglamorous, high-frequency workflow, not the impressive one-off. Set boringCase=true on exactly the beats that do.'
      : ''
  } Every beat states what it deliberately omits — a beat that claims to show everything is a beat nobody believes.

OBJECTIONS. Exactly ${rubric.objections.count}, each mapped to the beat that defuses it, so the founder preempts instead of reacts. Coverage of these axes is mandatory: ${mandatory}. Handling the failure case is not optional.

TONE. Write for the founder. Be specific and concrete. No hedging, no consultant filler, no restating the rubric back at them. A stranger should be able to read this and find it useful without explanation.`;
}

export async function grillSurface(
  engine: GrillEngine,
  surface: WebSurface,
  inventory: ClaimInventory,
  rubric: Rubric,
): Promise<GrillResult> {
  const claimList = inventory.claims
    .map(c => `${c.id} [${c.kind}] ${c.text}\n    quote: "${c.quote}"\n    source: ${c.sourceUrl}`)
    .join('\n');

  const unit = inventory.unitOfWork.stated
    ? `The page states the unit of work as: ${inventory.unitOfWork.unit}`
    : 'The page never defines a unit of work. That is itself a finding.';

  const user = [
    `Company: ${surface.host}`,
    `Fetched: ${surface.fetchedAt}`,
    '',
    '=== VERIFIED CLAIM INVENTORY ===',
    claimList || '(no claims survived verification)',
    '',
    unit,
    '',
    surface.notes.length > 0
      ? `=== WHAT COULD NOT BE SEEN ===\n${surface.notes.map(n => `- ${n}`).join('\n')}\n`
      : '',
    '=== PUBLIC WEB SURFACE ===',
    surfaceToPrompt(surface),
  ].filter(Boolean).join('\n');

  const raw = await engine.run<GrillResult>({
    system: buildSystem(rubric),
    user,
    schema: buildSchema(rubric),
  });

  return normalize(raw, rubric);
}

/**
 * The schema cannot express "at most N items" (array constraints are
 * unsupported in structured outputs), so the rubric's caps are enforced here.
 */
export function normalize(raw: GrillResult, rubric: Rubric): GrillResult {
  const byAxis = new Map<string, Gap>();
  for (const gap of (raw.gaps ?? []).slice().sort((a, b) => a.rank - b.rank)) {
    const axis = rubric.axes.find(a => a.id === gap.axisId);
    if (!axis || byAxis.has(gap.axisId)) continue;
    byAxis.set(gap.axisId, {
      ...gap,
      axisName: axis.name,
      buyerQuestion: axis.buyerQuestion,
      dealStage: axis.dealStage,
      evidence: gap.evidence ?? [],
    });
  }

  const gaps = [...byAxis.values()]
    .slice(0, rubric.maxGaps)
    .map((gap, i) => ({ ...gap, rank: i + 1 }));

  const beats = (raw.spine?.beats ?? [])
    .slice()
    .sort((a, b) => a.n - b.n)
    .slice(0, rubric.spine.maxBeats)
    .map((beat, i) => ({ ...beat, n: i + 1 }));

  const objections = (raw.spine?.objections ?? [])
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, rubric.objections.count)
    .map((objection, i) => ({ ...objection, rank: i + 1 }));

  return { gaps, spine: { beats, objections } };
}

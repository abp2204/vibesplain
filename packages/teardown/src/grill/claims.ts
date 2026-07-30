import type { ClaimInventory, Rubric, WebSurface } from '../types.js';
import { surfaceToPrompt } from '../surface/fetch.js';
import type { GrillEngine } from './client.js';

const CLAIM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claims', 'unitOfWork'],
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'text', 'quote', 'sourceUrl'],
        properties: {
          id: { type: 'string', description: 'Sequential identifier: C1, C2, C3...' },
          kind: {
            type: 'string',
            enum: ['capability', 'outcome', 'integration', 'pricing', 'proof', 'constraint'],
          },
          text: {
            type: 'string',
            description: 'The claim restated in one neutral sentence, in the company\'s own terms.',
          },
          quote: {
            type: 'string',
            description:
              'Verbatim excerpt from the page that makes this claim. Copy it exactly, character for character. Use ... only to join two exact fragments.',
          },
          sourceUrl: { type: 'string', description: 'The PAGE url the quote came from.' },
        },
      },
    },
    unitOfWork: {
      type: 'object',
      additionalProperties: false,
      required: ['stated', 'unit', 'evidence'],
      properties: {
        stated: { type: 'boolean', description: 'True only if the page actually names a unit.' },
        // `anyOf` rather than a `type: [...]` array — structured outputs
        // document the former for unions and do not list the latter.
        unit: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'The unit in buyer terms (per resolved ticket, per document, per seat), or null.',
        },
        evidence: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Verbatim quote naming the unit, or null when the page never defines one.',
        },
      },
    },
  },
} as const;

const SYSTEM = `You are building a claim inventory for a positioning teardown of an AI agent company.

This pass is a gate. The company will read their own claims reflected back before they read any critique — if the inventory is wrong, nothing downstream gets read.

Rules:
1. Record only what the supplied pages actually say. You have no other knowledge of this company; anything you recall from training is off-limits.
2. Every claim MUST carry a verbatim quote copied exactly from the supplied text. Quotes are checked against the source automatically, and a claim whose quote cannot be found is discarded.
3. Never paraphrase inside a quote, never repair grammar, never merge sentences. To skip material inside a quote, use "..." between two exact fragments.
4. Characterize claims fairly and neutrally. This is not the critique — do not editorialize, rank, or judge.
5. Marketing superlatives are claims too, but record them as the page states them.
6. If a demo video was detected, do not draw any claim from it. You cannot see it.

For the unit of work: report what the page states, not what you infer it must be. If the page never says what the buyer is buying one of, set stated=false and unit=null. An honest null is the finding.`;

export async function extractClaims(
  engine: GrillEngine,
  surface: WebSurface,
  rubric: Rubric,
): Promise<ClaimInventory> {
  const user = [
    `Company web surface for ${surface.host}, fetched ${surface.fetchedAt}.`,
    `Rubric ${rubric.version} defines the unit of work as the answer to: "${
      rubric.axes.find(a => a.id === 'unit-of-work')?.buyerQuestion ?? 'What am I buying one of?'
    }"`,
    '',
    'Build the claim inventory from the pages below and nothing else.',
    '',
    surfaceToPrompt(surface),
  ].join('\n');

  const result = await engine.run<ClaimInventory>({
    system: SYSTEM,
    user,
    schema: CLAIM_SCHEMA as unknown as Record<string, unknown>,
  });

  return {
    claims: Array.isArray(result.claims) ? result.claims : [],
    unitOfWork: result.unitOfWork ?? { stated: false, unit: null, evidence: null },
  };
}

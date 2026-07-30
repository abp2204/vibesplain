import type { Claim, Evidence, WebSurface } from '../types.js';

/**
 * S1's acceptance criterion is "zero hallucinated claims — one invented claim
 * voids the report." That is too important to leave to a prompt instruction, so
 * it is enforced mechanically: every claim and every piece of gap evidence
 * carries a verbatim quote, and the quote must occur in the bytes we fetched.
 */

/** Fold the cosmetic differences a model reliably introduces when quoting. */
function normalize(input: string): string {
  return input
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface QuoteIndex {
  /** Normalized text of the whole surface, plus per-URL text for source checking. */
  all: string;
  byUrl: Map<string, string>;
}

export function buildQuoteIndex(surface: WebSurface): QuoteIndex {
  const byUrl = new Map<string, string>();
  for (const page of surface.pages) {
    const parts = [page.title, page.description, page.text].filter(Boolean).join('\n');
    byUrl.set(page.url, normalize(parts));
  }
  return { all: [...byUrl.values()].join('\n'), byUrl };
}

/**
 * A quote counts as present when every ellipsis-separated fragment appears.
 * Fragments shorter than 12 characters are ignored — they match trivially and
 * would let a fabricated quote through on the strength of "the agent".
 */
export function quoteIsPresent(index: QuoteIndex, quote: string, sourceUrl?: string): boolean {
  const fragments = quote
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .map(normalize)
    .filter(f => f.length >= 12);

  if (fragments.length === 0) return false;

  const scoped = sourceUrl ? index.byUrl.get(sourceUrl) : undefined;
  const haystacks = scoped ? [scoped, index.all] : [index.all];

  return haystacks.some(haystack => fragments.every(f => haystack.includes(f)));
}

export interface VerificationResult<T> {
  kept: T[];
  dropped: T[];
}

export function verifyClaims(index: QuoteIndex, claims: Claim[]): VerificationResult<Claim> {
  const kept: Claim[] = [];
  const dropped: Claim[] = [];
  for (const claim of claims) {
    const verified = typeof claim.quote === 'string' && quoteIsPresent(index, claim.quote, claim.sourceUrl);
    const marked = { ...claim, verified };
    if (verified) kept.push(marked);
    else dropped.push(marked);
  }
  return { kept, dropped };
}

export function verifyEvidence(index: QuoteIndex, evidence: Evidence[]): Evidence[] {
  return (evidence ?? []).map(e => ({
    ...e,
    verified: typeof e.quote === 'string' && quoteIsPresent(index, e.quote, e.sourceUrl),
  }));
}

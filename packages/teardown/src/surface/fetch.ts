import type { PageCoverage, PageKind, SurfacePage, VideoRef, WebSurface } from '../types.js';
import { extractLinks, extractVideoUrls, htmlToText } from './extract.js';

export interface CrawlOptions {
  /** Total pages including the landing page. */
  maxPages?: number;
  /** Per-page character cap; keeps the grill pass inside a sane token budget. */
  maxCharsPerPage?: number;
  timeoutMs?: number;
  userAgent?: string;
}

const DEFAULTS: Required<CrawlOptions> = {
  maxPages: 8,
  maxCharsPerPage: 20000,
  timeoutMs: 15000,
  userAgent: 'teardown/0.1 (+positioning audit; public pages only)',
};

/**
 * Path patterns worth following, in priority order. §4 names pricing, docs and
 * "how it works" explicitly; security and FAQ carry blast-radius and refusal
 * evidence that landing pages almost never state.
 */
const LINK_PRIORITIES: { kind: PageKind; test: RegExp; weight: number }[] = [
  { kind: 'pricing', test: /(^|\/)(pricing|plans?|price)(\/|$)/i, weight: 100 },
  { kind: 'how-it-works', test: /(^|\/)(how-it-works|how|product|platform|overview|solution)s?(\/|$)/i, weight: 90 },
  { kind: 'docs', test: /(^|\/)(docs?|documentation|developers?|api|guides?|quickstart|getting-started)(\/|$)/i, weight: 80 },
  { kind: 'security', test: /(^|\/)(security|trust|privacy|compliance)(\/|$)/i, weight: 70 },
  { kind: 'faq', test: /(^|\/)(faq|questions|support)(\/|$)/i, weight: 60 },
  { kind: 'about', test: /(^|\/)(about|company|customers?|case-stud(y|ies))(\/|$)/i, weight: 40 },
];

const ANCHOR_HINTS: { kind: PageKind; test: RegExp; weight: number }[] = [
  { kind: 'pricing', test: /\bpricing\b|\bplans\b/i, weight: 95 },
  { kind: 'how-it-works', test: /how it works|how it’s done|the product|see it work/i, weight: 88 },
  { kind: 'docs', test: /\bdocs\b|documentation|developer|\bapi\b|quickstart|get started/i, weight: 78 },
  { kind: 'security', test: /security|trust center|privacy/i, weight: 68 },
  { kind: 'faq', test: /\bfaq\b|frequently asked/i, weight: 58 },
];

const SKIP_EXTENSIONS = /\.(pdf|zip|png|jpe?g|gif|svg|webp|ico|css|js|mp4|webm|xml|rss|woff2?|ttf)$/i;

export function normalizeRootUrl(input: string): string {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withScheme);
  url.hash = '';
  return url.toString();
}

function classify(url: string, anchorText: string): { kind: PageKind; weight: number } | null {
  const path = new URL(url).pathname;
  let best: { kind: PageKind; weight: number } | null = null;

  for (const rule of LINK_PRIORITIES) {
    if (rule.test.test(path) && (!best || rule.weight > best.weight)) {
      best = { kind: rule.kind, weight: rule.weight };
    }
  }
  for (const rule of ANCHOR_HINTS) {
    if (rule.test.test(anchorText) && (!best || rule.weight > best.weight)) {
      best = { kind: rule.kind, weight: rule.weight };
    }
  }
  return best;
}

/** Same registrable site, allowing docs.x.com / www.x.com to count as x.com. */
function sameSite(a: string, b: string): boolean {
  const strip = (h: string) => h.replace(/^www\./i, '').toLowerCase();
  const ha = strip(new URL(a).hostname);
  const hb = strip(new URL(b).hostname);
  if (ha === hb) return true;
  const rootOf = (h: string) => h.split('.').slice(-2).join('.');
  return rootOf(ha) === rootOf(hb);
}

async function fetchPage(
  url: string,
  opts: Required<CrawlOptions>,
): Promise<{ html: string; finalUrl: string } | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': opts.userAgent,
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) {
      // Include a slice of the body. A bare "HTTP 403" is ambiguous between
      // the site defending itself and something in front of you refusing to
      // connect — a corporate proxy, a sandbox egress allowlist, a WAF. The
      // body almost always says which, and mistaking one for the other leads
      // to the wrong conclusion about whether a target is reachable.
      let hint = '';
      try {
        const body = (await response.text()).replace(/\s+/g, ' ').trim();
        if (body && body.length <= 300 && !/^<!?[a-z]/i.test(body)) {
          hint = ` — ${body}`;
        }
      } catch {
        // Body unreadable; the status alone will have to do.
      }
      return { error: `HTTP ${response.status}${hint}` };
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      return { error: `unsupported content-type "${contentType}"` };
    }
    return { html: await response.text(), finalUrl: response.url || url };
  } catch (err) {
    const message = (err as Error).name === 'AbortError'
      ? `timed out after ${opts.timeoutMs}ms`
      : (err as Error).message;
    return { error: message };
  } finally {
    clearTimeout(timer);
  }
}

function toPage(url: string, kind: PageKind, html: string, maxChars: number): SurfacePage {
  const { title, description, text } = htmlToText(html);
  const truncated = text.length > maxChars;
  return {
    url,
    kind,
    title,
    description,
    text: truncated ? text.slice(0, maxChars) : text,
    chars: text.length,
    truncated,
  };
}

/**
 * Fetch the landing page plus its highest-signal linked pages.
 *
 * Public web surface only — no auth, no product access, no sandbox (§4). Every
 * failure is recorded in `notes` rather than swallowed, so the report can say
 * what it could not see.
 */
export async function crawlSurface(rootInput: string, options: CrawlOptions = {}): Promise<WebSurface> {
  const opts = { ...DEFAULTS, ...options };
  const rootUrl = normalizeRootUrl(rootInput);
  const notes: string[] = [];
  const pages: SurfacePage[] = [];
  const videos = new Map<string, VideoRef>();

  const landing = await fetchPage(rootUrl, opts);
  if ('error' in landing) {
    throw new Error(`Could not fetch ${rootUrl}: ${landing.error}`);
  }

  const landingUrl = landing.finalUrl;
  if (landingUrl !== rootUrl) notes.push(`${rootUrl} redirected to ${landingUrl}.`);
  pages.push(toPage(landingUrl, 'landing', landing.html, opts.maxCharsPerPage));

  for (const video of extractVideoUrls(landing.html, landingUrl)) {
    videos.set(video.url, { ...video, foundOn: landingUrl, transcript: null });
  }

  // Rank candidate links, keeping the best URL per page kind.
  const bestByKind = new Map<PageKind, { url: string; weight: number }>();
  const offsiteByKind = new Map<PageKind, string>();

  for (const link of extractLinks(landing.html, landingUrl)) {
    if (SKIP_EXTENSIONS.test(new URL(link.href).pathname)) continue;
    if (link.href === landingUrl) continue;

    const hit = classify(link.href, link.text);
    if (!hit) continue;

    // Classified but on another domain — commonly docs.company.io, a help
    // centre, or the company's previous domain after a rename. We do not
    // follow it by default (that is how a crawler wanders onto third-party
    // sites), but it must not vanish silently: an unread docs page is the
    // difference between "they never say what happens when it's wrong" being
    // a finding and being a false accusation.
    if (!sameSite(link.href, landingUrl)) {
      if (!offsiteByKind.has(hit.kind)) offsiteByKind.set(hit.kind, link.href);
      continue;
    }

    const current = bestByKind.get(hit.kind);
    if (!current || hit.weight > current.weight) {
      bestByKind.set(hit.kind, { url: link.href, weight: hit.weight });
    }
  }

  const ranked = [...bestByKind.entries()].sort((a, b) => b[1].weight - a[1].weight);
  const budget = Math.max(0, opts.maxPages - 1);
  const queue = ranked.slice(0, budget);
  const overflow = ranked.slice(budget);

  const coverage = new Map<PageKind, PageCoverage>([['landing', { kind: 'landing', status: 'fetched', url: landingUrl }]]);

  const visited = new Set<string>([landingUrl]);
  for (const [kind, candidate] of queue) {
    if (visited.has(candidate.url)) continue;
    visited.add(candidate.url);

    const result = await fetchPage(candidate.url, opts);
    if ('error' in result) {
      notes.push(`Could not fetch ${kind} page ${candidate.url}: ${result.error}.`);
      coverage.set(kind, { kind, status: 'fetch-failed', url: candidate.url, reason: result.error });
      continue;
    }
    pages.push(toPage(result.finalUrl, kind, result.html, opts.maxCharsPerPage));
    coverage.set(kind, { kind, status: 'fetched', url: result.finalUrl });
    for (const video of extractVideoUrls(result.html, result.finalUrl)) {
      if (!videos.has(video.url)) {
        videos.set(video.url, { ...video, foundOn: result.finalUrl, transcript: null });
      }
    }
  }

  for (const [kind, candidate] of overflow) {
    notes.push(`Skipped ${kind} page ${candidate.url} — the --max-pages budget of ${opts.maxPages} was already spent.`);
    coverage.set(kind, { kind, status: 'skipped-cap', url: candidate.url });
  }

  for (const [kind, url] of offsiteByKind) {
    if (coverage.has(kind)) continue;
    notes.push(`A ${kind} page is linked at ${url}, on a different domain, and was not fetched.`);
    coverage.set(kind, { kind, status: 'offsite', url, reason: 'linked on a different domain' });
  }

  const ALL_KINDS: PageKind[] = ['landing', 'pricing', 'docs', 'how-it-works', 'security', 'faq', 'about', 'other'];
  for (const kind of ALL_KINDS) {
    if (!coverage.has(kind)) coverage.set(kind, { kind, status: 'not-linked' });
  }

  for (const kind of ['pricing', 'docs', 'how-it-works'] as PageKind[]) {
    if (coverage.get(kind)?.status === 'not-linked') {
      notes.push(`No ${kind} page was linked from the landing page.`);
    }
  }
  for (const page of pages) {
    if (page.truncated) {
      notes.push(`${page.url} was truncated to ${opts.maxCharsPerPage} characters (${page.chars} total).`);
    }
    if (page.text.length < 200) {
      notes.push(`${page.url} yielded almost no text (${page.text.length} chars) — likely client-rendered.`);
    }
  }
  if (videos.size > 0) {
    notes.push(
      `${videos.size} demo video(s) detected; transcripts were not retrievable, so no claim in this report is drawn from video.`
    );
  }

  return {
    rootUrl: landingUrl,
    host: new URL(landingUrl).hostname,
    fetchedAt: new Date().toISOString(),
    pages,
    videos: [...videos.values()],
    coverage: [...coverage.values()],
    notes,
  };
}

/**
 * Page kinds we know exist but failed to read. These are the ones that make an
 * "the page never says X" finding unsafe — unlike a kind that was never linked,
 * which is itself evidence.
 */
export function unreadKinds(surface: WebSurface): PageCoverage[] {
  return surface.coverage.filter(
    c => c.status === 'fetch-failed' || c.status === 'skipped-cap' || c.status === 'offsite'
  );
}

/** The exact text handed to the grill pass — also the corpus quotes are verified against. */
export function surfaceToPrompt(surface: WebSurface): string {
  const blocks = surface.pages.map(page => {
    const header = [
      `### PAGE: ${page.url}`,
      `KIND: ${page.kind}`,
      page.title ? `TITLE: ${page.title}` : null,
      page.description ? `META DESCRIPTION: ${page.description}` : null,
      page.truncated ? `NOTE: truncated at ${page.text.length} of ${page.chars} characters` : null,
    ].filter(Boolean).join('\n');
    return `${header}\n\n${page.text}`;
  });

  const videoBlock = surface.videos.length > 0
    ? `\n\n### DEMO VIDEOS DETECTED (no transcript available — do not draw claims from these)\n` +
      surface.videos.map(v => `- ${v.url} (${v.provider}, found on ${v.foundOn})`).join('\n')
    : '';

  return blocks.join('\n\n---\n\n') + videoBlock;
}

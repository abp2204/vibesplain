/**
 * Dependency-free HTML → text. Not a parser — a tolerant stripper tuned for
 * marketing pages, where the signal is headings, paragraphs and list items.
 *
 * Correctness bar: never invent text. Everything this returns must be bytes
 * that were actually in the fetched document, because §4's honesty guarantee
 * is enforced downstream by matching model quotes against this output.
 */

const DROP_ELEMENTS = ['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'head'];
const BLOCK_ELEMENTS = [
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'td', 'th',
  'blockquote', 'pre', 'figcaption', 'dt', 'dd', 'summary', 'details',
];

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', times: '×', middot: '·', bull: '•',
  copy: '©', reg: '®', trade: '™', deg: '°', euro: '€', pound: '£', shy: '',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named !== undefined ? named : match;
  });
}

function stripDroppedElements(html: string): string {
  let out = html;
  for (const tag of DROP_ELEMENTS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
    // Unclosed <script src=...> and friends
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), ' ');
  }
  return out.replace(/<!--[\s\S]*?-->/g, ' ');
}

export interface ExtractedDocument {
  title: string;
  description: string;
  text: string;
}

export function htmlToText(html: string): ExtractedDocument {
  const title = decodeEntities(
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''
  ).replace(/\s+/g, ' ').trim();

  const description = decodeEntities(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1]
    ?? /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1]
    ?? ''
  ).replace(/\s+/g, ' ').trim();

  let body = stripDroppedElements(html);

  // Preserve block structure as newlines before tags disappear.
  body = body.replace(/<br\s*\/?>/gi, '\n');
  for (const tag of BLOCK_ELEMENTS) {
    body = body.replace(new RegExp(`</?${tag}\\b[^>]*>`, 'gi'), '\n');
  }
  body = body.replace(/<[^>]+>/g, ' ');
  body = decodeEntities(body);

  const text = body
    .split('\n')
    .map(line => line.replace(/[ \t\r\f\v ]+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return { title, description, text };
}

export interface ExtractedLink {
  href: string;
  text: string;
}

export function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const cleaned = stripDroppedElements(html);
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    const rawHref = decodeEntities(match[1]).trim();
    if (!rawHref || rawHref.startsWith('#')) continue;
    if (/^(mailto:|tel:|javascript:|data:)/i.test(rawHref)) continue;

    let absolute: string;
    try {
      const url = new URL(rawHref, baseUrl);
      url.hash = '';
      absolute = url.toString();
    } catch {
      continue;
    }
    if (seen.has(absolute)) continue;
    seen.add(absolute);

    const text = decodeEntities(match[2].replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();

    links.push({ href: absolute, text });
  }
  return links;
}

/** Demo-video URLs, so the report can say the transcript was unavailable rather than invent one. */
export function extractVideoUrls(html: string, baseUrl: string): { url: string; provider: string }[] {
  const found = new Map<string, string>();
  const patterns: [RegExp, string][] = [
    [/https?:\/\/(?:www\.)?youtube\.com\/(?:watch\?v=|embed\/)[\w-]+/gi, 'youtube'],
    [/https?:\/\/youtu\.be\/[\w-]+/gi, 'youtube'],
    [/https?:\/\/(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?\d+/gi, 'vimeo'],
    [/https?:\/\/(?:fast\.)?wistia\.(?:net|com)\/embed\/[\w/]+/gi, 'wistia'],
    [/https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/[\w-]+/gi, 'loom'],
  ];
  for (const [re, provider] of patterns) {
    for (const match of html.matchAll(re)) {
      found.set(decodeEntities(match[0]), provider);
    }
  }

  // Self-hosted <video src> / <source src>
  for (const match of html.matchAll(/<(?:video|source)\b[^>]*?src=["']([^"']+\.(?:mp4|webm|mov))["']/gi)) {
    try {
      found.set(new URL(decodeEntities(match[1]), baseUrl).toString(), 'self-hosted');
    } catch {
      // Unresolvable src — nothing to record.
    }
  }

  return [...found].map(([url, provider]) => ({ url, provider }));
}

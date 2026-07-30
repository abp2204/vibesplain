import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve, join, dirname } from 'path';
import { Command } from 'commander';
import { loadRubric, listVersions } from './rubric.js';
import { crawlSurface, surfaceToPrompt } from './surface/fetch.js';
import { AnthropicGrill, parseEffort, EFFORT_LEVELS } from './grill/client.js';
import { runTeardown, writeTeardownBundle } from './teardown.js';
import { diffReports, renderDiffMarkdown } from './report/diff.js';
import type { TeardownReport } from './types.js';

const program = new Command();

program
  .name('teardown')
  .description(
    'Reads an AI agent company\'s public web surface and returns the positioning gaps costing them deals, plus the demo spine that closes them.'
  )
  .version('0.1.0');

program
  .command('run')
  .argument('<url>', 'Company landing page URL')
  .description('Run a teardown and write report.md + report.json')
  .option('--out <dir>', 'Directory to write the .teardown bundle into', '.')
  .option('--rubric <ref>', 'Rubric version ("0.1") or path to a rubric JSON file')
  .option('--model <model>', 'Anthropic model id', 'claude-opus-5')
  .option('--effort <level>', EFFORT_LEVELS.join(' | '), 'high')
  .option('--max-pages <n>', 'Total pages to fetch, including the landing page', '8')
  .option('--max-chars <n>', 'Per-page character cap', '20000')
  .option('--max-tokens <n>', 'Output token ceiling per grill pass', '32000')
  .option('--dry-run', 'Fetch and print the web surface without calling the model', false)
  .action(async (url: string, options) => {
    try {
      const rubric = await loadRubric(options.rubric);
      const crawlOptions = {
        maxPages: Number(options.maxPages),
        maxCharsPerPage: Number(options.maxChars),
      };

      if (options.dryRun) {
        const surface = await crawlSurface(url, crawlOptions);
        process.stderr.write(
          `\nRubric v${rubric.version} · ${surface.pages.length} page(s) · ` +
          `${surface.pages.reduce((n, p) => n + p.text.length, 0).toLocaleString()} chars\n\n`
        );
        for (const note of surface.notes) process.stderr.write(`  note: ${note}\n`);
        process.stdout.write(surfaceToPrompt(surface) + '\n');
        return;
      }

      const engine = new AnthropicGrill({
        model: options.model,
        effort: parseEffort(options.effort),
        maxTokens: Number(options.maxTokens),
      });

      const report = await runTeardown(url, {
        ...crawlOptions,
        rubric,
        engine,
        onProgress: message => process.stderr.write(`  ${message}\n`),
      });

      const outRoot = resolve(options.out);
      await writeTeardownBundle(outRoot, report);

      process.stderr.write(`\nWrote ${join(outRoot, '.teardown', 'report.md')}\n`);
      if (report.integrity.voided) {
        process.stderr.write('Report is VOIDED — no claim survived verification.\n');
        process.exitCode = 2;
      }
    } catch (err) {
      process.stderr.write(`teardown: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
  });

program
  .command('sweep')
  .argument('[urls...]', 'Company URLs to probe')
  .description('Probe many URLs for fetchability and emit CSV — the screen before you spend a token')
  .option('--file <path>', 'Read URLs from a file, one per line (# comments allowed)')
  .option('--max-pages <n>', 'Pages per company', '6')
  .option('--max-chars <n>', 'Per-page character cap', '20000')
  .option('--min-chars <n>', 'Below this total, treat the surface as too thin to grill', '1500')
  .option('--out <file>', 'Write CSV to a file instead of stdout')
  .action(async (urls: string[], options) => {
    try {
      const targets = [...urls];
      if (options.file) {
        const lines = (await readFile(resolve(options.file), 'utf8')).split('\n');
        for (const line of lines) {
          const trimmed = line.split('#')[0].trim();
          if (trimmed) targets.push(trimmed);
        }
      }
      if (targets.length === 0) {
        throw new Error('No URLs given. Pass them as arguments or via --file.');
      }

      const minChars = Number(options.minChars);
      const rows = [
        'url,ok,pages,total_chars,kinds_fetched,kinds_unread,videos,note',
      ];

      for (const [i, target] of targets.entries()) {
        process.stderr.write(`[${i + 1}/${targets.length}] ${target} ... `);
        try {
          const surface = await crawlSurface(target, {
            maxPages: Number(options.maxPages),
            maxCharsPerPage: Number(options.maxChars),
          });
          const totalChars = surface.pages.reduce((n, p) => n + p.text.length, 0);
          const fetched = surface.coverage.filter(c => c.status === 'fetched').map(c => c.kind);
          const unread = surface.coverage
            .filter(c => c.status === 'fetch-failed' || c.status === 'skipped-cap')
            .map(c => c.kind);
          const ok = totalChars >= minChars;
          const note = ok
            ? ''
            : `only ${totalChars} chars of text — likely client-rendered, report would void`;

          rows.push([
            csv(surface.rootUrl), ok ? 'yes' : 'NO', String(surface.pages.length),
            String(totalChars), csv(fetched.join(' ')), csv(unread.join(' ')),
            String(surface.videos.length), csv(note),
          ].join(','));

          process.stderr.write(`${ok ? 'ok' : 'THIN'} — ${surface.pages.length} page(s), ${totalChars.toLocaleString()} chars\n`);
        } catch (err) {
          const message = (err as Error).message;
          rows.push([csv(target), 'NO', '0', '0', '', '', '0', csv(message)].join(','));
          process.stderr.write(`FAILED — ${message}\n`);
        }
      }

      const csvText = rows.join('\n') + '\n';
      if (options.out) {
        const target = resolve(options.out);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, csvText, 'utf8');
        process.stderr.write(`\nWrote ${target}\n`);
      } else {
        process.stdout.write(csvText);
      }

      const usable = rows.length - 1 - rows.slice(1).filter(r => r.includes(',NO,')).length;
      process.stderr.write(`\n${usable}/${targets.length} usable. Only usable rows are worth a teardown.\n`);
    } catch (err) {
      process.stderr.write(`teardown: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
  });

program
  .command('diff')
  .argument('<before>', 'Path to the earlier report.json')
  .argument('<after>', 'Path to the later report.json')
  .description('Diff two reports so rubric versions are an eval set, not three anecdotes')
  .option('--out <file>', 'Write the diff to a file instead of stdout')
  .action(async (before: string, after: string, options) => {
    try {
      const [from, to] = await Promise.all([readReport(before), readReport(after)]);
      const markdown = renderDiffMarkdown(diffReports(from, to));
      if (options.out) {
        const target = resolve(options.out);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, markdown, 'utf8');
        process.stderr.write(`Wrote ${target}\n`);
      } else {
        process.stdout.write(markdown);
      }
    } catch (err) {
      process.stderr.write(`teardown: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
  });

program
  .command('rubric')
  .description('Show the loaded rubric — the asset the reports are built from')
  .option('--rubric <ref>', 'Rubric version or path')
  .action(async (options) => {
    try {
      const rubric = await loadRubric(options.rubric);
      const available = await listVersions();
      const lines = [
        `${rubric.name} — v${rubric.version}`,
        `Scope: ${rubric.scope}`,
        `Max gaps: ${rubric.maxGaps} · Spine: ${rubric.spine.minBeats}-${rubric.spine.maxBeats} beats · Objections: ${rubric.objections.count}`,
        `Versions available: ${available.map(v => `v${v}`).join(', ')}`,
        '',
        ...rubric.axes.map(a => `${String(a.n).padStart(2)}. ${a.name.padEnd(22)} ${a.buyerQuestion}`),
        '',
        `Expected to dominate: ${rubric.calibration.expectDominant.join(', ')}`,
      ];
      process.stdout.write(lines.join('\n') + '\n');
    } catch (err) {
      process.stderr.write(`teardown: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
  });

function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function readReport(path: string): Promise<TeardownReport> {
  const resolved = resolve(path);
  let raw: string;
  try {
    raw = await readFile(resolved, 'utf8');
  } catch {
    throw new Error(`Report not found: ${resolved}`);
  }
  const parsed = JSON.parse(raw) as TeardownReport;
  if (!parsed.rubricVersion || !Array.isArray(parsed.gaps)) {
    throw new Error(`${resolved} is not a teardown report.`);
  }
  return parsed;
}

program.parse();

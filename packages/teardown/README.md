# teardown

A CLI that reads an AI agent company's public web surface and returns the positioning gaps costing them deals, plus the demo spine that closes them.

Spec: [`docs/teardown-prd-v0.1.md`](../../docs/teardown-prd-v0.1.md). Design: [`ADR-035`](../../docs/adr/ADR-035-teardown-consumes-vibesplain.md).

## Why

Agent products are structurally hard to demo. The output is probabilistic, the value is invisible, and the honest live demo is a bad demo. Founders respond by showing the flashiest possible case — the case buyers trust least.

The demo tooling category (Navattic, Storylane, Arcade, Reprise) solves demo *mechanics*: record, annotate, make clickable. None of them address what story the demo should tell. That's where demos actually fail.

## Usage

```bash
npm run build -w packages/teardown
export ANTHROPIC_API_KEY=sk-ant-...

# Full teardown → .teardown/report.md + report.json
node packages/teardown/dist/index.js run https://example-agent-co.com

# See exactly what would be sent to the model, without calling it
node packages/teardown/dist/index.js run https://example-agent-co.com --dry-run

# Probe a whole target list for fetchability → CSV. No API key needed.
# Run this before spending a token: a company whose surface does not fetch
# produces a voided report, and there is nothing to sell.
node packages/teardown/dist/index.js sweep --file packages/teardown/targets.txt --out sweep.csv

# Inspect the rubric
node packages/teardown/dist/index.js rubric

# Diff two runs — this is what makes teardowns an eval set
node packages/teardown/dist/index.js diff before/report.json after/report.json
```

### `run` options

| Flag | Default | Notes |
|---|---|---|
| `--out <dir>` | `.` | Bundle is written to `<dir>/.teardown/` |
| `--rubric <ref>` | newest bundled | A version (`0.1`) or a path to any rubric JSON |
| `--model <id>` | `claude-opus-5` | |
| `--effort <level>` | `high` | `low`, `medium`, `high`, `xhigh`, `max` |
| `--max-pages <n>` | `8` | Total fetched, including the landing page |
| `--max-chars <n>` | `20000` | Per-page cap |
| `--max-tokens <n>` | `32000` | Output ceiling per pass |
| `--dry-run` | off | Fetch and print the surface; no API call, no key needed |

Exit codes: `0` ok, `1` error, `2` report voided (see below).

## What it does

1. **Crawl.** Landing page plus the highest-signal linked pages — pricing, how-it-works, docs, security, FAQ. Same-site only, unauthenticated, HTML only. Demo videos are detected and disclosed; transcripts are not retrievable, so no claim is ever drawn from one.
2. **Inventory.** Extract every claim the pages make, each with a verbatim quote and source URL.
3. **Verify.** Match each quote against the fetched bytes. This is the trust gate, and it is mechanical rather than prompted.
4. **Grill.** Score the verified surface against the rubric. Max 6 gaps, ranked by what costs deals, one per axis.
5. **Spine.** 3–5 runnable beats plus the three objections they preempt.
6. **Write.** `report.md` and `report.json`, written atomically with a checksummed manifest via vibesplain's `ArtifactBundleWriter`.

## The rubric is the asset

The scraper is commodity. The rubric is the IP, and it lives in [`rubric/v0.1.json`](rubric/v0.1.json) — data, not prompt text. Prompts are assembled from it at runtime, and every report is tagged with the version that produced it.

Eight axes, each phrased as the buyer question it answers:

| # | Axis | Buyer question |
|---|---|---|
| 1 | Unit of work | What am I buying one of? |
| 2 | Failure behavior | What happens when it's wrong? |
| 3 | Blast radius | What does it touch — auth, permissions, data? |
| 4 | Human position | Where am I in the loop, and can I get out? |
| 5 | Latency shape | Real-time or async, and does that match my workflow? |
| 6 | Boring-case proof | Does it work on the repeated case, not just the demo case? |
| 7 | Refusal surface | What does it explicitly not do? |
| 8 | Time-to-first-value | How long until I see it work on my own data? |

Axes 1, 2 and 8 are where most agent landing pages fail. The rubric declares that expectation, and each report states whether findings actually landed there. When they don't, that is a signal the rubric is miscalibrated — not that the company is fine.

To try a new version: copy the file, edit it, `--rubric ./my-rubric.json`, then `diff` the two reports.

## Two honesty guarantees

**Public web surface only.** No auth, no product access, no screenshots, no sandbox. Everything a report asserts is derivable from what a buyer could have read themselves. That is what lets it run cold on any company — and what `--dry-run` exists to prove.

**Every quote is checked.** Claims and gap evidence carry verbatim quotes, matched against the fetched bytes with whitespace and smart-quote folding. Unverifiable claims are dropped before the critique is written. If *no* claim verifies, the report is **voided**: the critique is skipped entirely and `report.md` says why (usually a client-rendered page that served no readable copy). Fabricated text never appears in the founder-facing report — dropped quotes are counted in `report.md` and kept only in `report.json` under `integrity.droppedQuotes`.

## Development

```bash
npm run test -w packages/teardown
```

The suite runs offline — no API key, no network. The model sits behind a `GrillEngine` interface, so the crawl, verification, capping, rendering, diff and bundle-write paths are all tested against fixtures. Keep new logic behind that seam.

## Relationship to vibesplain

teardown depends on `@vibesplain/brain`; vibesplain never depends on teardown. It reuses vibesplain's atomic artifact writer and checksummed manifest, so a teardown report gets the same integrity guarantees as a dossier.

Network and LLM access are scoped to this package. `brain/` and `cli/` stay zero-network and zero-API-key — that is vibesplain's whole promise, and teardown existing next door must not erode it.

PRD §9a — running vibesplain's scanner over a company's public repo and diffing what the code does against what the page claims — is deliberately **not** built. It is out of v1 scope and waits on a paying customer. The dependency seam that makes it cheap is already here.

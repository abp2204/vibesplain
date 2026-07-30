# TEARDOWN — PRD v0.1

**Working name.** Placeholder until customer #1.
**Owner:** Aayush
**Status:** Pre-build
**Scope of this doc:** v1 only. Stage 2 captured in §9 explicitly so it stops competing for attention.

---

## 1. One-liner

A CLI that reads an AI agent company's public web surface and returns the six positioning gaps costing them deals, plus the demo spine that closes them.

## 2. Problem

Agent products are structurally hard to demo. The output is probabilistic, the value is invisible, and the honest live demo — watch it work for four minutes — is a bad demo. Founders respond by showing the flashiest possible case, which is the case buyers trust least.

The existing tooling category (Navattic, Storylane, Supademo, Arcade, Reprise, Walnut) solves demo *mechanics*: screen-record, annotate, make clickable. None of them address what story the demo should tell. That's where demos actually fail, and it's unserved.

## 3. Customer

Seed to Series A companies selling an AI agent as the primary product.

Chosen over B2B SaaS generally (incumbent-occupied, well-funded) and agencies (their demo problem is case-study-shaped, not walkthrough-shaped — different product wearing the same name).

**Known risk:** this buyer is technical, pre-revenue, and inclined to build it themselves. Accepted, not solved. The mitigation is that the rubric is the asset, not the code.

**Market is enumerable.** Every seriously-fundable agent company fits in a spreadsheet. This is an outreach motion, not a marketing motion.

## 4. v1 scope

**In:**
- CLI, single URL input
- Fetch landing page + linked pricing, docs, "how it works", demo video transcript where available
- Structured claim inventory
- Grill pass against versioned rubric
- Max 6 ranked gaps
- Demo spine (3–5 beats)
- Markdown report output

**Out (v1):**
- Any UI or web app
- Auth, accounts, hosting
- Generated demo artifacts (video, clickable walkthrough)
- Atlas repo analysis — see §9
- Anything requiring product access, screenshots, or sandbox

**Explicit constraint:** the input is public web surface only. Everything the report says must be derivable from what a buyer could have read themselves. This constraint is the product's honesty guarantee and the reason it can be run cold on any prospect.

## 5. The rubric

The rubric is the IP. The scraper is commodity.

Versioned in a file, not embedded in a prompt. Every report is tagged with the rubric version that produced it.

**Rubric v0.1 — gap axes for agent products:**

| # | Axis | The buyer question it answers |
|---|---|---|
| 1 | Unit of work | What am I buying one of? |
| 2 | Failure behavior | What happens when it's wrong? |
| 3 | Blast radius | What does it touch — auth, permissions, data? |
| 4 | Human position | Where am I in the loop, and can I get out? |
| 5 | Latency shape | Real-time or async, and does that match my workflow? |
| 6 | Boring-case proof | Does it work on the repeated case, not just the demo case? |
| 7 | Refusal surface | What does it explicitly not do? |
| 8 | Time-to-first-value | How long until I see it work on my own data? |

Axes 1, 2, and 8 are where most agent landing pages fail. Expect them to dominate early findings — if they don't, that's signal the rubric is miscalibrated, not that the companies are fine.

## 6. User stories

Story 1 is a gate. If it fails, nothing downstream gets read.

**S1 — Trust.**
*As a founder, I want to see my product's claims reflected back accurately, so that I trust the critique that follows.*
Accept: claim inventory drawn from page + docs + pricing; founder marks ≥80% as fair characterization; **zero hallucinated claims — one invented claim voids the report.**

**S2 — Ranked, not exhaustive.**
*As a founder, I want gaps ranked by what costs me deals, not a flat list of everything wrong.*
Accept: max 6 gaps, each tied to the buyer question it provokes and the deal stage where it stalls. A 40-item audit is noise.

**S3 — Unit of work.**
*As a founder, I want my agent's unit of work stated in buyer terms, so that I can price and demo it.*
Accept: report names the unit (per resolved ticket / per document / per hour saved) or flags that the page never defines one.

**S4 — Runnable spine.**
*As the person giving the demo, I want a beat-by-beat sequence I can run Monday without redesigning anything.*
Accept: 3–5 beats, each with what's shown, what claim it proves, what it deliberately omits. Beat 1 is always time-to-first-value.

**S5 — Objection mapping.**
*As the person giving the demo, I want to know where each objection lands, so that I preempt instead of react.*
Accept: top 3 objections each mapped to the beat that defuses it; failure-case handling is mandatory, not optional.

**S6 — Boring case.**
*As the eventual buyer, I want the demo to show the repeated case, not the impressive one-off.*
Accept: spine contains at least one unglamorous high-frequency workflow. North star story — the buyer isn't paying, but they're who the product is for.

**S7 — Operator.**
*As the operator, I want rubric versions diffable across the same companies, so that three teardowns are an eval set and not three anecdotes.*
Accept: re-running v0.2 on the same three URLs produces a readable diff against v0.1 output.

## 7. Done

v1 is done when:

1. It runs end-to-end on one real agent company URL
2. A stranger reads the output and finds it useful without explanation
3. The rubric lives in a versioned file, separable from the code

Estimate: a week of evenings. If it's taking a month, scope has leaked — check it against §4 "Out."

## 8. Go-to-market

**The three free teardowns go to non-prospects.** Well-known agent companies you have no intention of selling to. Publish the full report including the spine.

Two reasons. It demonstrates the method on a company everyone recognizes, which is more persuasive than auditing the reader's own site. And it doesn't hand a prospect the deliverable — free samples of the thing you sell teach people the thing is free.

Three is also the minimum eval set. It's what tells you whether the rubric generalizes or whether you've built something that only works on one company.

**First paying engagement:** same report on themselves, live 60-minute grill session, demo spine written out as a delivered script. $1.5–3k. Priced and sold as consulting, not software. Charge from customer #1.

## 9. Stage 2 — deferred, not dropped

Nothing here gets built until someone has paid. Each is triggered by an observed signal, not chosen in advance.

**9a. Atlas claim-vs-implementation diff.**
For agent companies with public repos: run Atlas on the repo, diff what the code actually does against what the page claims. This is a gap axis no demo tooling company can touch, and it's the most defensible thing in this document.

Deferred on scope grounds, not readiness. It roughly doubles v1 surface area, only applies to OSS companies, and adds a differentiator that isn't needed until there's a paying customer to differentiate for. Ship URL-only first, then bolt this on as axis 9.

**9b. Self-serve scored scan.**
Trigger: rubric holds unchanged across all three teardowns. If it needed per-company tuning, this fork is closed.

**9c. Grill-as-agent.**
Trigger: customers rave about the live session more than the report. Twenty minutes of adaptive questioning with the founder. Closest to existing strengths; most defensible product form.

**9d. Sleeper — eval harness.**
Same rubric pointed at the product instead of the page. Named metrics, structural diagnosis of agent behavior. Atlas's shape on a different substrate. Worth noticing, not worth starting.

## 10. Non-goals

- Not becoming a demo *builder*. If customers pull hard toward generated demo artifacts, that's a deliberate second product decision, not scope creep into v1.
- Not a free-audit funnel. Free audits convert badly: unsolicited critique makes people defensive, and a good report gets self-served.
- Not multi-vertical. Agent companies only until the rubric is proven.

---

## Implementation notes (added at build time)

Where the code lives and how it maps back to this document:

| PRD reference | Implementation |
|---|---|
| §4 in — CLI, single URL | `packages/teardown/src/index.ts` (`teardown run <url>`) |
| §4 in — fetch landing + linked pages | `src/surface/fetch.ts`, `src/surface/extract.ts` |
| §4 in — demo video transcript where available | Videos are detected and disclosed; transcripts are not retrievable, so the report says so rather than inventing one |
| §4 constraint — public web surface only | `crawlSurface` fetches unauthenticated HTML only; every gap is recorded in `surface.notes` |
| §5 — rubric in a versioned file | `packages/teardown/rubric/v0.1.json`, loaded by `src/rubric.ts`, validated on load |
| §5 — every report tagged with its rubric version | `TeardownReport.rubricVersion` |
| §5 — calibration signal on axes 1/2/8 | `rubric.calibration.expectDominant`; surfaced in the report's Method section |
| S1 — zero hallucinated claims | `src/grill/verify.ts` matches every quote against fetched bytes; unverifiable claims are dropped, and zero verified claims voids the report |
| S2 — max 6 ranked gaps, one per axis | `normalize()` in `src/grill/gaps.ts` |
| S3 — unit of work or an explicit null | `ClaimInventory.unitOfWork`; an unverifiable unit is treated as absent |
| S4 — 3–5 beats, beat 1 is time-to-first-value | `rubric.spine`; enforced in the prompt and capped in `normalize()` |
| S5 — top 3 objections mapped to beats | `rubric.objections`, mandatory axis coverage on failure behavior |
| S6 — boring case | `rubric.spine.requireBoringCase`; the renderer warns when no beat carries it |
| S7 — diffable rubric versions | `teardown diff <before.json> <after.json>` → `src/report/diff.ts` |
| §7.3 — rubric separable from code | Rubric is data; `--rubric <path>` loads any external file |
| §9a — Atlas repo diff | Deliberately not built. Seam documented in `docs/adr/ADR-035-teardown-consumes-vibesplain.md` |

**Status of §7 "Done" at time of writing:** criteria 2 and 3 are met. Criterion 1 — a real end-to-end run against a live company URL — has not been executed, because the build environment's network policy blocks outbound HTTPS to arbitrary hosts and no `ANTHROPIC_API_KEY` is configured there. The fetch path is verified against a loopback server and the full pipeline against a fixture surface; the first real run needs a machine with egress and a key.

# Teardown — target screen

Working document for the outreach spreadsheet described in PRD §8. Two lists, because §8 splits them: **published teardowns go to non-prospects**, prospects get the paid engagement.

Confidence is marked on every claim. Nothing here is a substitute for checking the company's own site and a primary funding source — the whole product is built on not asserting things you haven't verified, and the target list should be held to the same bar.

---

## List A — the three published teardowns (non-prospects)

§8: well-known agent companies you have no intention of selling to. Publish the full report including the spine. Recognisability is the point; so is not handing a prospect the deliverable.

| Company | Category | Why this one | Confidence |
|---|---|---|---|
| **Cognition (Devin)** | Coding agent | The single most on-thesis subject available. The March 2024 launch demo was publicly picked apart — independent developers reproduced the Upwork tasks and found them simpler than portrayed, and the SWE-bench Lite number came with task-selection caveats the marketing glossed. A teardown arguing "the flashiest case is the case buyers trust least" writes itself, and the reader already knows the story. | High — widely documented |
| **Sierra** | Customer-service agent | The category-defining company, instantly recognisable, and the axes bite: an outcome-priced support agent lives or dies on failure behavior and blast radius. | High on recognisability; valuation figures from aggregators, treat as unverified |
| **Harvey** | Legal agent | High-stakes vertical where refusal surface and human position are the whole buying conversation. Legal buyers are the most failure-sensitive audience there is. | High on recognisability; funding figures unverified |

Bench: **Decagon** (support, direct Sierra comparison), **Glean** (enterprise search→agents), **Basis** (accounting).

Pick Cognition first. If the rubric can't produce something non-obvious about the most publicly-dissected agent demo in the category, that's a real signal about the rubric — and better to learn it on teardown one.

---

## List B — the prospect spreadsheet (seed → Series A)

I did **not** produce a list of seed-stage names with stage claims attached. The sources that aggregate this are SEO content farms whose funding data I could not corroborate, and a spreadsheet seeded with wrong stages is worse than an empty one. What follows is the screen and the sourcing method.

### Sourcing, best first

1. **YC company directory**, filtered by batch + AI. Authoritative, enumerable, self-described, and free. W26 and S26 are the relevant batches. Note the directory 403s automated fetches — browse it manually.
2. **Primary funding announcements** — Business Wire / PR Newswire / the company's own blog. This is the only funding data worth trusting. (Example that survived checking: Prophet Security's $30M Series A led by Accel with Bain Capital Ventures, announced July 2025 — an AI SOC analyst that triages and investigates alerts. By now likely past the target band, but the sourcing pattern is the point.)
3. **Crunchbase / PitchBook** if you have a seat. Otherwise their free tier plus the press release.
4. **Vertical trade press** — the insurance, healthcare-RCM, logistics and legal trades cover their own AI entrants earlier and more accurately than generalist AI blogs.

### Qualification screen

A row earns a place only if all five are true:

1. **The agent is the product**, not an AI feature bolted to a SaaS product. If the pricing page sells seats of a platform and the agent is one tab, they don't have your problem.
2. **Seed or Series A.** Pre-seed can't pay $1.5–3k. Series B has an in-house product marketer who owns this.
3. **B2B with a real sales motion.** They must actually give demos. Self-serve PLG companies have a landing-page problem, not a demo problem — different product.
4. **The public surface is fetchable.** Run `teardown run <url> --dry-run` before adding the row. If it returns near-empty, the report will void and you have nothing to sell. This is a hard gate, not a nice-to-have.
5. **At least one axis visibly fails on the landing page.** A thirty-second read. If you can't spot one, either they're genuinely good or the rubric doesn't fire on them — both are worth knowing before you spend a call.

### Spreadsheet columns

`company | url | category | stage | last_round_date | source_url | dry_run_chars | dry_run_ok | visible_gap_axis | founder | contact_path | teardown_run | notes`

`dry_run_chars` and `dry_run_ok` come free from step 4 and are the highest-signal columns in the sheet — they tell you your addressable list before you spend a token.

### Verticals with room

Insurance claims/underwriting, healthcare RCM and prior authorization, freight and logistics dispatch, construction scheduling, field services, clinical trials, government workflow. These skew less picked-over than support and coding, and their buyers are unusually failure-sensitive, which is exactly what axes 2, 3 and 7 are built for.

---

## Two findings that affect the ICP

**1. Automated fetching is blocked more than expected.** Three of the sources I tried returned 403 to an automated fetch: the YC company directory, and two funding trackers. That's the same class of failure the crawler will hit on target sites, and it's the reason the `--dry-run` sweep is the first thing to run — before writing outreach, before spending a token. If a large share of the target list is unfetchable, "the scraper is commodity" is wrong and the sequencing of the whole build changes.

**2. The seed/Series A band in the obvious vertical is thinning.** Reported figures for AI customer support put seed + Series A at ~62% of *deals* but only ~11% of *capital* over the trailing year, and only ~3% of 2026 year-to-date capital, with Series B+ taking the rest. Separately, YC's recent batches have shifted toward agent *infrastructure* — identity, payments, memory, sandboxes, browser access — rather than agent products. (Aggregator-sourced, directionally plausible, not verified.)

If that holds, two consequences. The support/coding verticals are consolidating past your band, so the underfunded verticals above are where the seed/Series A agent-product companies actually are. And agent-infrastructure companies are a different ICP than the PRD assumes: they demo to developers, and "what happens when it's wrong" lands differently when the buyer is an engineer wiring you into their stack. Rubric v0.1 is written for a business buyer. Don't stretch it onto infra companies without checking whether the axes still fire — and if you do, that's a v0.2, which is exactly what `teardown diff` exists to measure.

---

## Sources

- [Y Combinator — AI companies directory](https://www.ycombinator.com/companies/industry/Artificial%20Intelligence)
- [Business Wire — Prophet Security Series A](https://www.businesswire.com/news/home/20250729681026/en/Prophet-Security-Raises-$30M-Series-A-Announces-Industrys-Most-Comprehensive-Agentic-AI-SOC-Platform-to-Transform-Security-Operations)
- [SitePoint — Devin aftermath: AI engineers in production](https://www.sitepoint.com/devin-ai-engineers-production-realities/)
- [Zvi Mowshowitz — On Devin](https://thezvi.substack.com/p/on-devin)
- [New Market Pitch — AI customer support funding trends](https://newmarketpitch.com/blogs/news/ai-customer-support-funding-trends)
- [New Market Pitch — top agentic AI startups by fundraising](https://newmarketpitch.com/blogs/news/agentic-ai-top-startups-fundraising)
- [The Agent Report — YC W26 batch and the agent supply chain](https://the-agent-report.com/2026/07/ai-agent-startup-explosion-2026-yc-ecosystem/)
- [New Economies — Y Combinator Spring 2026 batch](https://www.neweconomies.co/p/y-combinator-spring-2026-batch)
- [Lindy — vertical AI agents](https://www.lindy.ai/blog/vertical-ai-agents)

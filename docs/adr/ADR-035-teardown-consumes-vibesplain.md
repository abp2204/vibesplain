# ADR-035: Teardown consumes vibesplain as a tool

**Status:** Accepted
**Date:** 2026-07-30
**Supersedes:** none
**Related:** ADR-031 (content-addressed integrity), ADR-032 (tool output discipline)

## Context

`teardown` is a second product (spec: `docs/teardown-prd-v0.1.md`): a CLI that reads an AI agent company's public web surface and returns the positioning gaps costing them deals, plus the demo spine that closes them.

It is not vibesplain. Vibesplain analyses code with zero network and zero API keys. Teardown fetches web pages and calls an LLM. Those are opposite requirements, and the decision was where teardown should live given that conflict.

Three options were considered:

1. **A fourth peer package that vibesplain also depends on.** Rejected: it inverts the dependency and drags network and LLM concerns into a published artifact whose entire promise is that it has neither.
2. **A separate repository.** Viable, but it duplicates the artifact-writing, atomic-swap and manifest machinery that already exists here, and splits one operator's tooling across two checkouts before there is a paying customer to justify it.
3. **A package in this repo that depends on vibesplain, one-way.** Chosen.

## Decision

`packages/teardown` is a private workspace package that depends on `@vibesplain/brain`. The dependency is strictly one-way: teardown imports vibesplain, never the reverse.

**Network and LLM access are scoped to teardown.** `brain/` and `cli/` remain zero-network, zero-API-key, pure static analysis. `@anthropic-ai/sdk` is a dependency of `teardown` alone.

**Shared machinery is lifted into `brain`, not duplicated.** `ArtifactBundleWriter` moved from `packages/cli/src/export/` to `packages/brain/src/artifacts.ts` and gained an `outputDirName` parameter (default `.vibesplain`; teardown passes `.teardown`). The old CLI path is now a re-export so the renderers' `import type { Artifact }` lines are unchanged and CLI behaviour is byte-identical. Teardown therefore inherits the same atomic tmp+rename swap and the same checksummed manifest as a vibesplain dossier — ADR-031's integrity guarantee applies to teardown reports for free.

**Teardown is excluded from the published artifact.** It builds last, after `bundle-ui`, and `npm run release` still publishes `packages/cli` only.

## Consequences

**Positive.**
- One atomic writer, one manifest schema, one integrity story across both products.
- Vibesplain's constraints are strengthened rather than eroded: "no network" is now an explicit boundary with a named exception on the other side of it, instead of an unstated assumption.
- Teardown's `--dry-run` and its whole offline test suite work with no API key, because the LLM sits behind a `GrillEngine` interface.

**Negative.**
- `npm install` at the repo root now pulls `@anthropic-ai/sdk` even for contributors who only touch vibesplain.
- One repo now holds two products with different release cadences. If teardown reaches a paying customer and needs its own versioning, extracting it is a package move plus a dependency swap — the one-way dependency is what keeps that cheap.

**Neutral.**
- Teardown reports land in `.teardown/` next to `.vibesplain/`, both gitignored.

## Deferred

PRD §9a proposes running vibesplain's scanner over an agent company's public repo and diffing what the code does against what the page claims — a gap axis no demo-tooling competitor can reach. This ADR deliberately does **not** build it: §4 puts it out of v1 scope, and it roughly doubles surface area while only applying to OSS companies.

The seam is nonetheless already in place, which is most of the point of choosing option 3. When it is built, it becomes axis 9 in a new rubric version and calls `scanProject` / `readAnalysis` from `@vibesplain/brain` — the dependency, the artifact writer and the rubric-versioning mechanism all exist and need no change. The trigger for building it is a paying customer, not readiness.

# 0463 - release build runtime substrate detail gate

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.44

## Context

ADR [0457](./0457-runtime-substrate-detail-report.md) added the detailed
runtime-substrate checker, and ADR
[0462](./0462-post-4-42-release-readiness-sync.md) made the pre-v0.2 release
readiness docs require `pnpm run check:runtime-substrate -- --details`. The
local `pnpm run build:release` workflow still ran only the summary substrate
checker before self-hosting and artifact copy, leaving the detailed residual
substrate report outside the release-build gate.

## Decision

Make `scripts/build-release.sh` run
`pnpm run check:runtime-substrate -- --details` alongside the existing runtime
header and prelude freshness checks. This aligns the local release artifact
builder with the post-4.42 readiness checklist without changing runtime
behavior, artifact shape, release publication state, or the pinned residual C
substrate policy.

Rejected alternatives: moving remaining C substrate helpers would reopen the
runtime migration boundary; making `build:release` publish or mutate release
state would cross the local-gate boundary; changing package versions, artifact
names, checksums, manifest/check/doctor/explain behavior, or permission
enforcement belongs to separate release or feature phases.

## Implementation

- `scripts/build-release.sh:38` now runs the detailed substrate checker before
  `pnpm run test:selfhost`.
- `.agents/skills/topaz-release/SKILL.md:62` names the runtime prelude,
  runtime header, and runtime substrate detail gates in release dry-run
  preflight before build/test/release-build.
- `tests/smoke.sh:401` statically protects the release script's header,
  prelude, and detailed substrate gates.
- `MEMO.md:377` records Phase 4.44 as a release-workflow/static-contract sync.

## Consequences

- **Accepted**: local release builds expose drift in the detailed residual
  substrate report before native artifacts are copied and checksummed.
- **Accepted**: `pnpm test` fails if the release script drops the runtime
  header, prelude, or detailed substrate gate.
- **Rejected**: runtime source, generated runtime, codegen, package version,
  artifact naming, checksum format, tags, GitHub Releases, and CLI guidance
  behavior are unchanged.
- **Regression**: `pnpm run check:runtime-prelude`,
  `pnpm run check:runtime-header`,
  `pnpm run check:runtime-substrate -- --details`, `pnpm run build`, and
  `pnpm test`.

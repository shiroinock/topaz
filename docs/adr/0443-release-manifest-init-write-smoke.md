# 0443 - release manifest init write smoke

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.24

## Context

ADR [0441](./0441-release-manifest-init-smoke.md) proved release-artifact
preview for `topaz manifest init <entry.ts>`, and ADR
[0442](./0442-manifest-init-write-flag.md) added explicit `--write`. That phase
left release-artifact write-mode coverage outside scope, so the shipped
`dist-release/topaz-*` binary still needed a create-and-check smoke.

## Decision

Extend `scripts/build-release.sh` guidance smoke with a second fixture that has
no existing `strict-ts.json`. The copied release artifact runs `manifest init
--write <entry.ts>`, verifies the success line, the entry-adjacent policy file,
the normalized `fs.read` / `fs.write` / `io.stdout` capabilities, then runs the
same artifact's `check <entry.ts>` and requires `missing capabilities: none` and
`status: ok`. Rejected alternatives: changing CLI semantics, writing by default,
adding prompt/force/policy options, duplicating every overwrite rejection in
release smoke, changing release packaging, or touching runtime/prelude/header.

## Implementation

- `scripts/build-release.sh:129` creates `build/release_guidance_write_smoke`
  separately from the preview fixture.
- `scripts/build-release.sh:142` invokes release artifact `manifest init
  --write "${guidance_write_entry}"` and requires `wrote <path>`.
- `scripts/build-release.sh:153` compares the written policy with the normalized
  `fs.read`, `fs.write`, and `io.stdout` expectation.
- `scripts/build-release.sh:163` runs artifact `check <entry.ts>` against the
  written policy and requires `missing capabilities: none` / `status: ok`.
- `tests/smoke.sh:405` extends the fast release guidance static contract so
  normal smoke pins the new write-mode artifact-smoke fragments without running
  `pnpm run build:release`.
- `MEMO.md:357` records the Phase 4.24 checkpoint.

## Consequences

- **Accepted**: `pnpm run build:release` proves the native artifact can create
  entry-adjacent `strict-ts.json` and immediately pass artifact `check`.
- **Accepted**: preview-mode release smoke still proves stdout preview does not
  modify its existing fixture.
- **Rejected**: overwrite refusal remains covered by normal CLI smoke rather
  than exhaustively duplicated in release smoke.
- **Scope outside**: prompts, `--force`, `--policy`, parent/package discovery,
  compile-time permission enforcement, runtime sandboxing, schema expansion,
  artifact naming, checksum format, tag/release publication, package version,
  and runtime/prelude/header changes.
- **Regression**: `pnpm run build`, `pnpm test`, and `pnpm run build:release`.

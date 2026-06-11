# 0446 - release artifact guidance fixture

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.27

## Context

ADR [0445](./0445-release-guidance-fixture.md) corrected the v0.2 guidance
fixture in `.agents/skills/topaz-release/SKILL.md`, but the actual release
artifact smoke in `scripts/build-release.sh` still wrote
`writeFileSync("build/release_guidance_write_smoke/out.txt", text, "utf8")`.
The current Topaz `std/fs.writeFileSync` API accepts exactly two arguments,
`(path: string, content: string)`, while `readFileSync(path, "utf8")` remains
the supported read fixture shape.

## Decision

Align the produced-artifact guidance smoke with the current stdlib surface by
changing the release script fixture to
`writeFileSync("build/release_guidance_write_smoke/out.txt", text)`. Keep the
same read call and `console.log(text.length)` so the black-box release smoke
continues to require `fs.read`, `fs.write`, and `io.stdout`. Rejected
alternatives: accepting an encoding argument in `std/fs.writeFileSync`, changing
CLI behavior, manifest schema, effect vocabulary, permission enforcement,
runtime sandboxing, artifact naming, checksum format, release publication flow,
or runtime/prelude/header files.

## Implementation

- `scripts/build-release.sh:138` updates the `manifest init --write` guidance
  fixture to call the two-argument write API.
- `tests/smoke.sh:427` keeps the release script guidance fragments pinned and
  rejects the stale three-argument release artifact fixture if it returns.
- `tests/smoke.sh:441` keeps the Phase 4.26 release skill fixture guard, so
  normal `pnpm test` now covers both guidance fixture copies.
- `MEMO.md:360` records Phase 4.27 as a release artifact fixture checkpoint.

## Consequences

- **Accepted**: `pnpm run build:release` now exercises a valid v0.2
  `manifest init --write` + `check` guidance round-trip with the produced
  native artifact.
- **Accepted**: normal `pnpm test` fails if either release guidance fixture
  regresses to the stale three-argument `writeFileSync(..., "utf8")` shape.
- **Rejected**: write-file encoding support, CLI behavior, manifest schema,
  permission enforcement, runtime sandboxing, release publication flow, artifact
  naming, checksum format, and runtime/prelude/header content remain unchanged.
- **Regression**: `pnpm run build`, `pnpm test`, and `pnpm run build:release`.

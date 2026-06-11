# 0445 - release guidance fixture

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.26

## Context

ADR [0444](./0444-v0-2-guidance-docs.md) added a v0.2 black-box release
guidance fixture to `.agents/skills/topaz-release/SKILL.md`, but that fixture
used `writeFileSync("guidance-smoke/out.txt", text, "utf8")`. The current
Topaz `std/fs.writeFileSync` surface accepts exactly two arguments,
`(path: string, content: string)`, while the read side still supports
`readFileSync(path, "utf8")`.

## Decision

Keep the release skill fixture aligned with the current stdlib surface by
writing the output file with `writeFileSync("guidance-smoke/out.txt", text)`.
The fixture still reads with explicit UTF-8 text mode and still exercises
`fs.read`, `fs.write`, and `io.stdout` for the guidance CLI loop. Rejected
alternatives: accepting an encoding argument in `std/fs.writeFileSync`, changing
CLI behavior, changing the manifest schema or effect vocabulary, claiming
compile-time policy enforcement or runtime sandboxing, tagging or publishing a
release, or touching runtime/prelude/header files.

## Implementation

- `.agents/skills/topaz-release/SKILL.md:164` changes the documented
  `guidance-smoke/effectful.ts` fixture to the two-argument write API.
- `tests/smoke.sh:391` adds a static release skill fixture contract alongside
  the existing release guidance script contract.
- `tests/smoke.sh:417` rejects the stale three-argument `writeFileSync`
  fixture if it returns.
- `MEMO.md:359` records Phase 4.26 as a docs/test checkpoint.

## Consequences

- **Accepted**: the release skill fixture now matches the current Topaz
  `std/fs` write API and remains suitable for binary/checksum/docs-only
  black-box validation.
- **Accepted**: normal `pnpm test` names the release skill fixture if the stale
  three-argument write example returns.
- **Rejected**: write-file encoding support, CLI behavior, manifest schema,
  permission enforcement, runtime sandboxing, release publication flow, and
  runtime/prelude/header content remain unchanged.
- **Regression**: `pnpm run build`, `pnpm test`, plus focused `doctor` and
  `manifest init` probes against an equivalent temporary fixture.

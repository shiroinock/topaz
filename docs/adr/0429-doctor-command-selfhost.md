# 0429 - doctor command self-host

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.10

## Context

ADR [0428](./0428-capability-explain-selfhost.md) advanced the full
`src/cli.ts` self-host probe past the capability explain renderer. The next
blocker was `src/cli.ts:120:13`, where `runDoctorCommand` initialized
`let entry: string | undefined = undefined` and later assigned a positional
`string`. Topaz currently treats the initializer as the active local shape for
that assignment, so the CLI parser state needed to avoid this source pattern
without changing optional-union assignment semantics.

## Decision

Keep the public doctor CLI behavior unchanged and rewrite only the parser
state into the current self-host subset: a plain `entry: string` plus
`hasEntry: boolean`. Rejected alternatives: broadening local optional-union
widening, adding casts, changing doctor argument validation order, changing
doctor output, adding generated artifacts, or touching manifest/check/init
behavior are all broader than this blocker.

## Implementation

- `src/cli.ts:103` initializes the positional entry as an empty string and
  tracks presence separately with `hasEntry`.
- `src/cli.ts:120` keeps the multiple-positional diagnostic on the same
  `unexpected positional argument ${arg}` path, now guarded by `hasEntry`.
- `src/cli.ts:126` keeps the missing-entry diagnostic as
  `doctor expects <entry.ts>` before resolving and extension-checking the
  accepted entry.
- `MEMO.md:343` records this Phase 4.10 doctor command self-host checkpoint.

## Consequences

- **Accepted**: `topaz doctor <entry.ts>` keeps rejecting compile options,
  unknown options, multiple positional arguments, missing entries, and
  non-`.ts` inputs with the same user-facing messages.
- **Accepted**: the full `src/cli.ts` self-host probe no longer stops at
  `src/cli.ts:120:13`.
- **Accepted**: `node dist/cli.js src/cli.ts --emit-c-only -o
  build/orch_selfhost_probe` now emits `build/orch_selfhost_probe.c`
  successfully, so there is no later blocker from this probe in this phase.
- **Rejected**: optional-union assignment semantics remain unchanged.
- **Regression**: `pnpm run build`, the full `src/cli.ts` self-host probe
  above, and `pnpm test`.

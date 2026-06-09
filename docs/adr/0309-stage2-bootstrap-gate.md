# 0309 - stage2 bootstrap gate

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: worker 276

## Context

After [0308](./0308-arrow-this-capture.md), the Node-built bootstrap compiler can
emit C for `src/cli.ts`, that generated C can compile to a native CLI, and the
native CLI can emit another compiler C file. The orchestrator also verified the
next step by compiling that second compiler C file into a self-host native CLI
and using it to build `examples/fib.ts`, whose binary printed `5702887`.

## Decision

Preserve the self-host bootstrap as an explicit opt-in gate. The gate compiles
the bootstrap native CLI, uses it to emit and compile a self-host native CLI,
requires the self-host native CLI to build and run `examples/fib.ts`, and then
requires the same self-host native CLI to emit C for `src/cli.ts`.

Rejected alternatives: only updating MEMO/ADR was rejected because the
milestone would be easy to regress; adding the full self-host ladder to default
`pnpm test` was rejected because it compiles the full compiler twice and would
slow the day-to-day smoke suite; requiring warning-free generated compiler C
was rejected because warning cleanup is a separate phase from proving the
bootstrap still succeeds.

## Implementation

- `tests/selfhost_fixed_point.sh:1` adds the bootstrap ladder as a repo-local
  shell
  test using only `pnpm`, `node`, `cc`, shell, and repo files.
- `tests/selfhost_fixed_point.sh:24` asserts the self-host native CLI can build
  `examples/fib.ts` and that the resulting binary prints exactly `5702887`.
- `tests/selfhost_fixed_point.sh:34` asserts the self-host native CLI can emit
  `build/topaz_fixedpoint.c` for `src/cli.ts`.
- `package.json:19` exposes the gate as `pnpm run test:selfhost`.
- `MEMO.md:222` marks `1.5-6i` complete and records the durable evidence.

## Consequences

- **Accepted**: `pnpm run test:selfhost` is the milestone check for self-host
  bootstrap.
- **Rejected**: generated full-compiler C warnings remain outside this phase;
  the gate checks command success and artifacts, not warning volume.
- **Regression**: no new language sample is added; the explicit self-host
  bootstrap regression is `tests/selfhost_fixed_point.sh`.
- **Default suite**: `pnpm test` remains the fast smoke path.
- **Scope out**: bit-for-bit self-host/fixed-point comparison remains
  `1.5-6j`.

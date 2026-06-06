# 0309 - stage2 bootstrap gate

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: worker 276

## Context

After [0308](./0308-arrow-this-capture.md), the Node-built stage1 compiler can
emit C for `src/cli.ts`, that generated C can compile to a native CLI, and the
native CLI can emit another compiler C file. The orchestrator also verified the
next stage by compiling that second compiler C file into a stage2 native CLI
and using it to build `examples/fib.ts`, whose binary printed `5702887`.

## Decision

Preserve the stage2 bootstrap as an explicit opt-in gate. The gate compiles the
stage1 native CLI, uses it to emit and compile a stage2 native CLI, requires
the stage2 native CLI to build and run `examples/fib.ts`, and then requires the
same stage2 native CLI to emit C for `src/cli.ts`.

Rejected alternatives: only updating MEMO/ADR was rejected because the
milestone would be easy to regress; adding the full stage2 ladder to default
`pnpm test` was rejected because it compiles the full compiler twice and would
slow the day-to-day smoke suite; requiring warning-free generated compiler C
was rejected because warning cleanup is a separate phase from proving the
bootstrap still succeeds.

## Implementation

- `tests/selfhost_stage2.sh:1` adds the bootstrap ladder as a repo-local shell
  test using only `pnpm`, `node`, `cc`, shell, and repo files.
- `tests/selfhost_stage2.sh:24` asserts the stage2 native CLI can build
  `examples/fib.ts` and that the resulting binary prints exactly `5702887`.
- `tests/selfhost_stage2.sh:34` asserts the stage2 native CLI can emit
  `build/selfhost_cli_by_stage2.c` for `src/cli.ts`.
- `package.json:19` exposes the gate as `pnpm run test:selfhost`.
- `MEMO.md:222` marks `1.5-6i` complete and records the durable evidence.

## Consequences

- **Accepted**: `pnpm run test:selfhost` is the milestone check for stage2
  bootstrap.
- **Rejected**: generated full-compiler C warnings remain outside this phase;
  the gate checks command success and artifacts, not warning volume.
- **Regression**: no new language sample is added; the explicit stage2
  bootstrap regression is `tests/selfhost_stage2.sh`.
- **Default suite**: `pnpm test` remains the fast smoke path.
- **Scope out**: bit-for-bit stage2/stage3 fixed-point comparison remains
  `1.5-6j`.

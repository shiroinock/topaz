# 0310 - fixed-point self-host gate

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: worker 277

## Context

[0309](./0309-stage2-bootstrap-gate.md) made stage2 bootstrap durable: the
Node-built stage1 compiler emits compiler C, that compiler C builds a native
CLI, and that native CLI emits and compiles a stage2 native CLI that can build
`examples/fib.ts`. The remaining 1.5-6j milestone is to prove that the stage2
compiler and the next compiler generation have reached a bit-for-bit fixed
point.

## Decision

Fold the fixed-point check into the existing opt-in `test:selfhost` gate. The
gate compares `build/selfhost_cli_by_selfhost.c` as stage2 compiler C against
`build/selfhost_cli_by_stage2.c` as stage3 compiler C with `diff -u`, then
compiles the stage3 native CLI and requires it to build and run
`examples/fib.ts` with output `5702887`.

Rejected alternatives: adding a separate `test:fixedpoint` script was rejected
because it would duplicate the expensive self-host ladder; deleting
`package.json`, `node_modules`, or `dist` was rejected because the source repo
still uses Node, pnpm, and tsc as development and stage1 harnesses; requiring
warning-free full compiler C was rejected because warning cleanup remains
separate from proving fixed-point identity and runnable stage3 behavior.

## Implementation

- `tests/selfhost_stage2.sh:39` compares stage2/stage3 emitted compiler C with
  `diff -u` and lets any difference fail the gate.
- `tests/selfhost_stage2.sh:42` compiles the stage3 native CLI from the stage3
  emitted compiler C.
- `tests/selfhost_stage2.sh:45` requires the stage3 native CLI to build
  `examples/fib.ts`, and `tests/selfhost_stage2.sh:47` asserts that binary
  prints exactly `5702887`.
- `MEMO.md:213` marks the full 1.5-6 self-hosting path complete.
- `MEMO.md:223` records the fixed-point evidence and clarifies that the
  Node-free claim applies to the generated native AOT compiler/runtime path,
  while repo development harnesses remain.

## Consequences

- **Accepted**: `pnpm run test:selfhost` is now the full 1.5-6 milestone gate:
  stage2 bootstrap, stage2/stage3 emitted-C identity, and stage3-native fib.
- **Rejected**: the default `pnpm test` smoke suite remains fast and does not
  run the expensive self-host ladder.
- **Regression**: no language sample is added; the durable regression is the
  extended `tests/selfhost_stage2.sh` gate.
- **Scope out**: source-repo development tooling cleanup and generated-C
  warning cleanup remain future work.

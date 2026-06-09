# 0310 - fixed-point self-host gate

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: worker 277

## Context

[0309](./0309-stage2-bootstrap-gate.md) made self-host bootstrap durable: the
Node-built bootstrap compiler emits compiler C, that compiler C builds a native
CLI, and that native CLI emits and compiles a self-host native CLI that can
build `examples/fib.ts`. The remaining 1.5-6j milestone is to prove that the
self-host compiler and the next compiler generation have reached a bit-for-bit
fixed point.

## Decision

Fold the fixed-point check into the existing opt-in `test:selfhost` gate. The
gate compares `build/topaz_selfhost.c` against `build/topaz_fixedpoint.c` with
`diff -u`, then compiles the final native compiler as `build/topaz` and
requires it to build and run `examples/fib.ts` with output `5702887`. The
role-based names were adopted in [0349](./0349-selfhost-artifact-names.md).

Rejected alternatives: adding a separate `test:fixedpoint` script was rejected
because it would duplicate the expensive self-host ladder; deleting
`package.json`, `node_modules`, or `dist` was rejected because the source repo
still uses Node, pnpm, and tsc as development and bootstrap harnesses; requiring
warning-free full compiler C was rejected because warning cleanup remains
separate from proving fixed-point identity and runnable final compiler behavior.

## Implementation

- `tests/selfhost_fixed_point.sh:39` compares self-host/fixed-point emitted
  compiler C with `diff -u` and lets any difference fail the gate.
- `tests/selfhost_fixed_point.sh:42` compiles the final native CLI
  `build/topaz` from the fixed-point emitted compiler C.
- `tests/selfhost_fixed_point.sh:45` requires the final native CLI to build
  `examples/fib.ts`, and `tests/selfhost_fixed_point.sh:47` asserts that binary
  prints exactly `5702887`.
- `MEMO.md:213` marks the full 1.5-6 self-hosting path complete.
- `MEMO.md:223` records the fixed-point evidence and clarifies that the
  Node-free claim applies to the generated native AOT compiler/runtime path,
  while repo development harnesses remain.

## Consequences

- **Accepted**: `pnpm run test:selfhost` is now the full 1.5-6 milestone gate:
  self-host bootstrap, self-host/fixed-point emitted-C identity, and final
  `build/topaz` fib.
- **Rejected**: the default `pnpm test` smoke suite remains fast and does not
  run the expensive self-host ladder.
- **Regression**: no language sample is added; the durable regression is the
  extended `tests/selfhost_fixed_point.sh` gate.
- **Scope out**: source-repo development tooling cleanup and generated-C
  warning cleanup remain future work.

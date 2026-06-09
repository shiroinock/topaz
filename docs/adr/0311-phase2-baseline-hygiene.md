# 0311 - Phase 2 baseline hygiene

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.0

## Context

[0310](./0310-fixed-point-gate.md) completed the Phase 1.5 self-hosting path:
the opt-in self-host gate reaches a self-host/fixed-point emitted-C fixed point
and a final native CLI can build `examples/fib.ts`. Before starting larger Phase 2
work, the repository needs a current baseline for the normal development gate,
the expensive self-host gate, and the generated full-compiler C warning shape.

## Decision

Treat Phase 2.0 as a baseline hygiene pass rather than a language/runtime
feature. The accepted baseline is: `pnpm run build`, `pnpm test`, and
`pnpm run test:selfhost` all pass on the same checkout; generated full-compiler
C warnings remain outside the self-host gate but are inventoried by category.

Rejected alternatives: making full-compiler C warning-free a Phase 2.0 gate was
rejected because [0310](./0310-fixed-point-gate.md) deliberately scoped that
out of fixed-point proof; adding a new benchmark here was rejected because the
benchmark suite is the next step (`2.1`) and should be its own decision; adding
language samples was rejected because no accepted or rejected source behavior
changes in this pass.

## Implementation

- `pnpm run build` passes with `tsc`.
- `pnpm test` passes, including the existing warning-free targeted cases in
  `tests/smoke.sh`.
- `pnpm run test:selfhost` passes through `tests/selfhost_fixed_point.sh`,
  including self-host/fixed-point emitted-C diff and final `build/topaz`
  building `examples/fib.ts`.
- Re-running `cc -O2 -Iruntime -Wall -Wextra -fsyntax-only` on each full
  compiler C artifact produced the same warning inventory:
  `46 [-Wreturn-type]`, `38 [-Wunused-parameter]`, `1 [-Wunused-variable]`,
  and `1 [-Wunused-function]`.
- `MEMO.md` marks `2.0 baseline hygiene` complete and leaves benchmark,
  generic, and try/finally work as the next open Phase 2 actions.

## Consequences

- **Accepted**: Phase 2 starts from a known-good build/smoke/self-host
  baseline.
- **Accepted**: the generated full-compiler C warning cleanup queue is
  dominated by conservative control-flow return analysis and unused generated
  method parameters.
- **Rejected**: warning-free full compiler C is not yet required by
  `pnpm run test:selfhost`.
- **Regression**: no new sample is added; the durable regression remains the
  existing smoke suite plus `tests/selfhost_fixed_point.sh`.
- **Scope out**: benchmark harness, warning elimination, stdlib surface design,
  generic backlog, and try/finally backlog remain follow-up Phase 2 work.

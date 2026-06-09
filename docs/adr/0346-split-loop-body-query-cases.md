# 0346 - split loop body query cases

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.18

## Context

After [0345](./0345-cleanup-helper-else-branch-narrowing.md), the self-host
gate advanced to `src/codegen.ts:6361:41` in `stmtHasTargetedExit`. The helper
cluster grouped `while_stmt`, `do_while_stmt`, `for_stmt`, and `for_of_stmt`
into one switch arm before reading `s.body`. Topaz narrows discriminated unions
through visible `switch (x.kind)` arms, but it does not prove a shared field
across a grouped arm.

## Decision

Split the grouped loop body query cases in the try/finally analysis helper
cluster into per-kind switch arms. Each arm keeps the same recursive call:
`stmtHasTargetedExit` still increments loop depth, while
`stmtHasBreakOrContinue` and `stmtHasReturn` still recurse into the loop body
without changing cleanup-label behavior. Rejected alternatives: adding common
field narrowing for grouped switch arms was rejected as broader than this
self-host blocker; changing loop, for-of, or try/finally lowering was rejected
because this phase only rewrites helper query spelling.

## Implementation

- `src/codegen.ts:6357` splits the `stmtHasTargetedExit` loop cases so each
  `.body` access is in a single-kind switch arm and preserves `depth + 1`.
- `src/codegen.ts:6419` splits the remaining grouped
  `stmtHasBreakOrContinue` loop body query while preserving the recursive body
  check.
- `src/codegen.ts:6472` applies the same per-kind loop spelling to
  `stmtHasReturn`.
- No runtime, loop lowering, cleanup dispatch, diagnostics, or for-of behavior
  changed.

## Consequences

- **Accepted**: the old `src/codegen.ts:6361:41` grouped loop body query
  blocker is cleared without changing cleanup analysis semantics.
- **Accepted**: `pnpm run test:selfhost` now advances to
  `src/codegen.ts:7843:15`, where `targetEscapesCleanupContext` reads
  `frame.prev` from `LoopCtxFrame | undefined` after a loop guard.
- **Rejected**: broader discriminated-union common-field narrowing and the next
  self-host blocker remain out of scope.
- **Regression**: no standalone sample was added; existing
  `try_finally_break_continue`, loop, for-of, and full smoke coverage remain
  the regression surface. `tests/smoke.sh` currently registers 341 `run_*`
  entries, and `pnpm test` passed.

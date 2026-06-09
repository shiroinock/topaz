# 0345 - cleanup helper else branch narrowing

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.17

## Context

After [0344](./0344-finally-return-temp-type-narrowing.md), the self-host gate
advanced to `src/codegen.ts:6311:83` in
`stmtNeedsCleanupLabelForCurrent`. The cleanup-label query had already checked
`s.elseBranch !== undefined`, but the recursive helper call lived on the right
side of the same `&&` expression. Topaz does not carry optional narrowing
through that combined expression form in the compiler source.

## Decision

Keep cleanup semantics unchanged and normalize only the local cleanup-query
helper cluster to explicit optional locals. `elseBranch`, `catchClause`, and
`finallyBlock` values are copied to `*Maybe` locals, checked, and then passed to
recursive helper calls through narrowed aliases. Rejected alternatives: adding
general right-hand-side `&&` narrowing was rejected as broader than this
self-host blocker; changing break/continue cleanup-label behavior or
try/finally lowering was rejected because this phase only rewrites helper query
spelling.

## Implementation

- `src/codegen.ts:6309` narrows `if_stmt` else branches in
  `stmtNeedsCleanupLabelForCurrent` before the recursive cleanup-label query.
- `src/codegen.ts:6347` applies the same local else-branch form in
  `stmtHasTargetedExit`.
- `src/codegen.ts:6370` rewrites adjacent `catchClause` and `finallyBlock`
  optional checks in `stmtHasTargetedExit` before recursive block queries.
- `src/codegen.ts:6406` and `src/codegen.ts:6458` mirror the else-branch form
  for break/continue and return detection, with adjacent try helper optionals
  narrowed locally.

## Consequences

- **Accepted**: cleanup-label, targeted-exit, break/continue, and return
  detection keep the same observable behavior.
- **Accepted**: optional helper inputs are now spelled in a Topaz-visible
  narrowing form.
- **Rejected**: broader optional narrowing, grouped case narrowing, and new
  cleanup lowering remain out of scope.
- **Regression**: no standalone sample was added; existing
  `try_finally_break_continue`, `try_finally_return`, `try_catch_finally`, and
  full smoke coverage remain the regression surface. `tests/smoke.sh` currently
  registers 343 cases.
- **Current blocker**: `pnpm run test:selfhost` now advances to
  `src/codegen.ts:6361:41`, where grouped loop cases in `stmtHasTargetedExit`
  still leave `s.body` as an unnarrowed discriminated union.

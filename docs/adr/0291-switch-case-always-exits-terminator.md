# 0291 - switch case always-exits terminator

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0290](./0290-non-null-assertion-inner-guard-cleanup.md) advanced the
self-host probe to `inferType(bin_op)`, where a `case "+": { ... return ... }`
body ended in a braced block that always returned. Earlier switch decisions
[0052](./0052-type-helper-switch-fallthrough-cleanup.md) and
[0233](./0233-emit-switch-statement-subset-cleanup.md) intentionally rejected
implicit fall-through, but this blocker was not fall-through. The terminator
check in `emitSwitchStatement` was only too shallow.

## Decision

Keep implicit switch fall-through unsupported and validate a non-empty case body
with `alwaysExits(lastStmt)`. Reusing that conservative predicate accepts direct
terminators, a final block whose last statement exits, and an `if` whose then
and else branches both exit. Rejected alternatives: adding implicit fall-through
was rejected because it changes the switch subset; rewriting the self-host
source to an `if` ladder was rejected because it would avoid a valid structured
case shape; adding deeper flow-sensitive switch analysis was rejected because
false negatives are acceptable but false positives would be a semantic bug.

## Implementation

- `src/codegen.ts:5202` keeps `alwaysExits` as the shared conservative
  statement-exit predicate for return, throw, break, continue, final block
  statements, and fully exiting `if` statements.
- `src/codegen.ts:6794` uses `alwaysExits(lastStmt)` for switch case-body
  validation instead of checking only direct terminator statement kinds.
- `src/codegen.ts:6803` keeps the fall-through diagnostic substring
  `case body must end with` while naming the broader accepted exit shapes.
- `tests/smoke.sh:164` adds the positive `switch_case_block_exit` case and
  `tests/smoke.sh:165` pins a final block that does not exit as a compile-time
  failure.

## Consequences

- **Accepted**: a switch case whose final statement is a braced block that
  returns, or an `if` with both branches exiting, now passes validation.
- **Rejected**: a case whose final block only runs statements still reports the
  fall-through diagnostic; grouped empty labels remain only labels for the next
  non-empty group.
- **Rejected**: `continue` inside switch remains unsupported by the existing
  switch loop-context check, because switch lowering still uses
  `do { ... } while (0)`.
- **Regression**: `switch_case_block_exit` and
  `switch_case_block_fallthrough_fail` add positive and negative smoke coverage;
  `pnpm test` now passes 284 primary compile/run/fail checks including CLI
  failure checks.
- **Self-host**: the old `src/codegen.ts:10009:19` switch case terminator
  blocker is removed; the probe now reaches `src/codegen.ts:10053:23` for the
  separate unsupported `finally` blocker.
- **Scope out**: implicit fall-through, default-clause terminator tightening,
  and broader switch control-flow analysis remain out of scope.

# 0292 - minimal try/finally lowering

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0291](./0291-switch-case-always-exits-terminator.md) advanced the self-host
probe to `src/codegen.ts:10053:23`, where compiler code uses
`try { ... } finally { ... }` to restore state. Earlier prep work avoided
`finally` by rewriting local restore shapes, but this source form is now a
real self-hosting blocker and likely remains useful compiler-internal syntax.

## Decision

Support the minimal no-catch form `try { ... } finally { ... }`. The normal path
pops the active Topaz try frame before running the finally block. The throw path
relies on `topaz_throw` having already popped the frame before `longjmp`, runs
the finally block, then rethrows `topaz_throw_value` unless the finally block
itself throws. Rejected alternatives: deleting the compiler-source finally was
rejected because it dodges a real self-host need; full `try/catch/finally` was
rejected because catch-body throws must still dispatch through finally; return,
break, and continue through finally were rejected because they require explicit
cleanup/dispatch lowering rather than the existing pop-only return path.

## Implementation

- `src/codegen.ts:5570` routes `try/catch` through the existing lowering and
  rejects `try/catch/finally` with a dedicated diagnostic.
- `src/codegen.ts:5658` emits no-catch `try/finally` as one C try frame, normal
  cleanup after `topaz_try_pop()`, and throw-path cleanup followed by
  `topaz_throw(topaz_throw_value)`.
- `src/codegen.ts:5712` adds a conservative finally-boundary validator that
  rejects `return`, `break`, and `continue` while still walking nested
  statements and expressions outside arrow-function boundaries.
- `tests/smoke.sh:179` adds the positive and negative `try/finally` regression
  rows beside the existing try/catch coverage.

## Consequences

- **Accepted**: `try { sideEffect(); } finally { cleanup(); }` now runs cleanup
  on normal completion.
- **Accepted**: a throw from the try body runs cleanup and rethrows the original
  exception; a throw from finally overrides the original.
- **Rejected**: `try/catch/finally` remains unsupported in this phase.
- **Rejected**: `return`, `break`, and `continue` inside a try/finally try body
  or finally body remain unsupported until cleanup dispatch exists.
- **Regression**: `try_finally`, `try_finally_return_fail`, and
  `try_catch_finally_fail` add one positive and two fail smoke cases; `pnpm
  test` now passes 287 primary compile/run/fail checks including CLI smoke
  checks.
- **Self-host**: the old `src/codegen.ts:10053:23` finally blocker is removed;
  the probe now reaches `src/codegen.ts:10218:30` for the separate contextual
  object-literal blocker.
- **Scope out**: full catch+finally lowering and return/break/continue through
  finally remain future work.

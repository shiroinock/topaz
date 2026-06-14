# 0568 - Multi-await bare call arguments

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.101

## Context

ADR [0484](./0484-bare-call-argument-await-decomposition.md) introduced the
first bare call-argument await path, and ADR [0507](./0507-call-argument-expression-await.md)
later let one simple argument expression contain one await. Those paths still
rejected a single call expression with multiple direct awaited arguments, even
when the surrounding async frame already knew how to run ordered suspension
steps. That blocked common TS-compatible call syntax and kept the implementation
from moving toward a reusable ordered expression plan.

## Decision

Accept only non-optional bare identifier calls whose argument list contains two
or more direct `await` arguments and no spread. The call may be lowered from an
async frame declaration initializer, expression-statement discard, or terminal
return. Each awaited argument becomes an ordered suspension step with the same
source statement index; non-await arguments before the next awaited argument are
stored in frame temps at that suspension boundary, and the transformed call is
emitted only after the final awaited argument resumes.

Rejected alternatives: keeping descriptor-specific single-await branches would
not create a reusable ordered plan; fully general expression decomposition would
cross receiver, optional/spread, nested, binary/logical, ternary, object/array,
and assignment scheduling in one phase; method, synthetic, builtin, collection,
Promise, and receiver-await calls remain deferred until they can plug into the
same ordered plan with their descriptor metadata.

## Implementation

- `src/codegen.ts:139` adds an optional statement-completion deferral flag to
  return/initializer/statement await steps and `src/codegen.ts:211` records the
  small multi-await call-argument plan.
- `src/codegen.ts:5343`, `src/codegen.ts:5510`, and `src/codegen.ts:5597` give
  multi-await bare calls a chance before the existing multiple-await diagnostic
  in initializer, expression-statement, and terminal-return positions.
- `src/codegen.ts:6287` recognizes the narrow bare identifier call shape,
  resolves all awaited operands, stores pre-await argument temps per boundary,
  and rebuilds the final transformed call.
- `src/codegen.ts:6782` and `src/codegen.ts:7006` restore deferred same-statement
  temps for later steps, while `src/codegen.ts:7048` skips emitting the source
  statement for intermediate steps.
- `tests/smoke.sh:3050` adds the positive regression and `MEMO.md:494` records
  the completed phase line.

## Consequences

- **Accepted**: `combine(mark("pre", 1), await left, mark("mid", 3), await right, mark("post", 5))`
  in declaration initializers, expression-statement discard, and terminal
  return for bare top-level/generic/fn-typed identifier calls.
- **Rejected**: method/receiver calls with multiple awaited arguments,
  optional/spread calls, nested awaited argument expressions, synthetic/builtin
  descriptor calls, and general expression decomposition still use the shared
  unsupported await diagnostic.
- **Preserved**: existing single-await call-argument lowering, async scheduler
  behavior, Promise/thenable policy, and runtime code.
- **Regression**: `async_await_call_arg_multiple` covers declaration, arrow,
  method, anonymous function expression, terminal return, and discard positions;
  `await_call_arg_multiple_deferred_fail` now pins the method-call boundary, and
  `async_generic_deferred_fail` keeps a nested awaited generic call argument out
  of this direct-argument phase.
- **Regression count**: smoke now covers 637 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.

# 0569 - Multi-await method call arguments

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.102

## Context

ADR [0568](./0568-multi-await-bare-call-arguments.md) introduced an ordered
multi-await plan for direct arguments of bare calls. Ordinary class and
interface method calls already had single-await argument lowering from
ADR [0485](./0485-method-call-argument-await-receiver-temps.md), including the
important receiver-temp capture before suspension. The remaining gap was the
same direct multi-await argument list on method descriptors, without reopening
specialized builtins or general expression decomposition.

## Decision

Accept non-optional class and interface method calls whose argument list has two
or more direct `await` arguments in async-frame declaration initializers,
expression-statement discard positions, and terminal returns. The ordered plan
now carries receiver temps as well as argument temps: the first suspension
captures the method receiver before any pre-await argument temps, later
suspensions capture only the intervening non-await arguments, and the method
dispatch is emitted once after the final awaited argument resumes.

Rejected alternatives: duplicating the single-await method path would fork the
ordered suspension model; accepting specialized Array / Map / Set / String /
Number / Promise or synthetic namespace descriptors would cross their separate
ABI and void-return policies; receiver-side await, nested awaited argument
expressions, optional/spread calls, constructor/element calls, and general
expression decomposition remain too broad for this phase.

## Implementation

- `src/codegen.ts:216` adds receiver-temp metadata to each multi-await
  call-argument step.
- `src/codegen.ts:5352`, `src/codegen.ts:5514`, and `src/codegen.ts:5602` thread
  planned receiver temps into initializer, statement, and terminal-return
  async suspension steps instead of forcing them empty.
- `src/codegen.ts:6292` expands the ordered call-argument planner from bare
  identifier callees to non-optional property callees, while still requiring
  direct awaited arguments and no spread.
- `src/codegen.ts:6361` keeps the accepted descriptor kinds to bare
  top-level/generic/fn-value calls plus ordinary class/interface methods.
- `src/codegen.ts:6375` captures the class/interface receiver in the first
  suspension and rewrites the transformed callee to read from that temp.

## Consequences

- **Accepted**: `box.combine(await left, mid(), await right)` and
  `iface.combine(pre(), await left, mid(), await right)` in the same three
  async-frame positions as the bare-call plan.
- **Preserved**: single-await method call-argument lowering, the 5.101 bare-call
  path, ordered FIFO continuation behavior, and all runtime scheduler code.
- **Rejected**: receiver-side await such as
  `(await boxPromise).combine(await left, await right)`, nested awaited argument
  expressions, optional/spread calls, constructor/element calls, specialized
  descriptor calls, PromiseLike / thenable expansion, and generic expression
  decomposition.
- **Regression**: `async_await_method_call_arg_multiple` covers class method
  initializers, interface method initializers, async arrow, async method,
  anonymous async function expression, terminal return, discard statements, and
  observable receiver/pre/mid/final-call order. The retargeted
  `await_call_arg_multiple_deferred_fail` now pins receiver-side await.
- **Regression count**: smoke now covers 632 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.

# 0481 - terminal return-await lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.14

## Context

Async function declarations, async arrows, async methods, and anonymous async
function expressions now share the generated await-frame machinery from ADRs
[0473](./0473-async-frame-await-lowering.md), [0475](./0475-async-arrow-await-frame-lowering.md),
[0477](./0477-async-method-await-frame-lowering.md), and
[0480](./0480-async-function-expression-await-frame-lowering.md). The next
common TypeScript compatibility gap is `return await promise;`, but arbitrary
expression-position await remains too broad for the current frame/capture
boundary.

## Decision

Accept only a final top-level `return await <Promise<T>>;` in block-bodied async
surfaces that already use async frames. The terminal return is represented as
explicit frame metadata, not as a synthetic local binding, so normal binding
payload locals and output-Promise completion stay distinct. Rejected
alternatives: surface-specific lowering would duplicate the shared frame path,
pretending return-await is a local binding would obscure terminal fulfillment,
and adding arbitrary/non-final/nested await, try/finally cleanup dispatch,
PromiseLike / thenable assimilation, or scheduler modes would exceed this
phase.

## Implementation

- `src/codegen.ts:131` adds `AwaitTerminalReturnInfo` beside existing await
  binding metadata.
- `src/codegen.ts:4392` extends `findAsyncAwaitFrame` to recognize only the
  final top-level return-await, require a `Promise<T>` operand, and preserve
  deferred diagnostics for unsupported await placements.
- `src/codegen.ts:4417` temporarily registers prior await binding payload locals
  during frame analysis so a terminal operand can use earlier awaited values.
- `src/codegen.ts:4535` lets the initial frame invocation schedule either the
  first await binding or the terminal return-await source Promise.
- `src/codegen.ts:4679` fulfills the target output Promise from the terminal
  source payload, applying the same assignability/coercion rules as other
  expected-type value flows.
- `src/codegen.ts:4751` schedules the terminal return-await after the final
  await binding segment without changing scheduler behavior.
- `MEMO.md:395` records the completed 5.14 slice and leaves arbitrary await,
  PromiseLike / thenable assimilation, and scheduler modes deferred.

## Consequences

- **Accepted**: `examples/async_return_await_terminal.ts` covers async function,
  async arrow, async method, and anonymous async function expression surfaces,
  including a terminal operand that uses a prior await binding.
- **Rejected**: existing deferred samples were retargeted to arbitrary,
  non-final, or nested await so those boundaries remain pinned.
- **Regression**: `tests/smoke.sh:2946` adds the positive case with the observed
  FIFO order `declared`, `method`, `expr`, then the arrow's second-await result.
- **Scope out**: non-final return-await, nested/control-flow await, try/catch/
  finally await, ordinary local capture across later awaits, Promise rejection
  handlers, PromiseLike / thenable assimilation, and scheduler modes remain
  future work.

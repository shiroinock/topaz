# 0563 - No-Await Async Generic Functions

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.96

## Context

ADR [0471](./0471-async-function-no-await-lowering.md) established the
top-level async no-await body path: body returns are checked against the
Promise payload, synchronous execution produces a fulfilled Promise, and throws
escape as rejected Promises. Generic function declarations already had
call-site monomorph machinery, but async generic declarations still stopped at
registration, leaving TS-valid helpers such as `async function id<T>(value: T):
Promise<T>` unavailable.

## Decision

Accept only top-level generic async function declarations whose type parameters
meet the existing generic function restrictions, whose return annotation is a
direct `Promise<T>`-style annotation, and whose body contains no `await`.
Generic call resolution still returns the substituted `Promise<U>` signature to
call sites; asyncness is carried only into monomorph body emission, where the
resolved Promise payload becomes the body return type and the existing async
no-await wrapper emits the fulfilled/rejected Promise boundary. Rejected
alternatives: adding generic async await frames would require substituting the
frame/context layout as well as the function ABI; accepting generic async
expressions/arrows would widen a separate closure surface; and changing
PromiseLike, thenable, scheduler, or runtime behavior belongs to the Promise
compatibility track rather than generic monomorph dispatch.

## Implementation

- `src/codegen.ts:2756` keeps the existing generic type-parameter restrictions
  and lets async generic declarations register only after a Promise-return
  annotation and no-await body check.
- `src/codegen.ts:7103` emits async generic monomorph bodies by deriving the
  payload from the substituted `Promise<U>` return type, setting the current
  async payload state, and reusing the shared async no-await body emitter.
- `src/codegen.ts:7075` validates the registration-time async generic return
  annotation without substituting a concrete type argument; concrete payload
  support is still checked when the monomorph signature is resolved.
- `examples/async_generic_no_await.ts` covers explicit and inferred generic
  async calls for number, string, boolean, class-instance, and two-type-param
  payloads while proving the body runs before `sync tail` and `.then(...)`
  callbacks run afterward.
- `examples/async_generic_deferred_fail.ts` now pins a generic async function
  containing a real `await` to the dedicated deferred diagnostic.
- `MEMO.md:489` records the 5.96 boundary without changing async expression,
  PromiseLike, thenable, scheduler, or runtime semantics.

## Consequences

- **Accepted**: no-await generic async declarations participate in the same
  monomorph worklist as synchronous generic functions, and call sites continue
  to see ordinary `Promise<T>` results.
- **Rejected**: generic async functions containing `await` stop with `async
  generic function with await is deferred`.
- **Deferred**: generic async await-frame lowering, generic async arrows,
  generic function expressions, generic class changes, PromiseLike / thenable
  assimilation, and scheduler/runtime changes remain out of scope.
- **Regression count**: the smoke suite now has 619 explicit `run_case` /
  `run_module_case` / `run_fail_case` entries.

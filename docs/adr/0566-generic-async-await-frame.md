# 0566 - Generic Async Await-Frame Declarations

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.99

## Context

ADR [0473](./0473-async-frame-await-lowering.md) made the async frame the
durable lowering boundary for supported `await` positions, and ADR
[0563](./0563-no-await-async-generic-functions.md) connected top-level generic
async declarations to monomorph emission for no-await bodies. The remaining
frontier was registration-time only: generic async declarations containing any
`await` were rejected before the monomorph path could substitute concrete
payload and parameter types.

## Decision

Remove only the blanket registration-time `await` rejection for top-level
generic async declarations. Generic function restrictions and direct
`Promise<T>` return annotation validation remain unchanged. At each call site,
the existing monomorph body path installs `typeParamScope = mono.subs`, uses the
substituted `Promise<U>` return payload as the async body type, declares
substituted params, and calls the existing async-frame body emitter.

Rejected alternatives: adding a generic-specific async runner would duplicate
the frame ABI; accepting generic async arrows, function expressions, or methods
would widen separate closure/member surfaces; and changing scheduler,
PromiseLike, thenable, or arbitrary await placement semantics belongs to later
Promise/async compatibility phases.

## Implementation

- `src/codegen.ts:2787` still validates async generic return annotations but no
  longer scans the body for any `await` during registration.
- `src/codegen.ts:5182` keeps top-level async bodies routed through
  `emitAsyncFunctionBody`, where unsupported await shapes still share the
  existing async-frame diagnostic.
- `src/codegen.ts:7153` and `src/codegen.ts:7177` keep generic async monomorph definitions on the same
  path: substituted params are declared, the substituted `Promise<U>` payload is
  installed as the current async return payload, and `emitAsyncFunctionBody`
  chooses the already-supported await frame when possible.
- `examples/async_generic_await_frame.ts` covers `return await`, number and
  string instantiations, an awaited generic binding followed by terminal return,
  and a generic payload passed through an awaited call argument.
- `examples/async_generic_deferred_fail.ts` now pins an unsupported generic
  async shape with multiple awaits in one call expression to the shared
  unsupported await diagnostic.
- `MEMO.md:490` records the 5.99 boundary without changing scheduler/runtime or
  PromiseLike semantics.

## Consequences

- **Accepted**: supported async-frame await shapes can now appear in top-level
  generic async declarations after monomorph substitution.
- **Rejected**: unsupported nested/arbitrary await shapes still stop with
  `await expression lowering is deferred`.
- **Deferred**: generic async arrows, function expressions, methods, new await
  shapes, PromiseLike / thenable assimilation, and scheduler/runtime changes.
- **Regression count**: smoke now covers 627 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.

# 0495 - path variadic call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.28

## Context

ADR [0494](./0494-path-url-call-descriptor-await.md) extended the pure flat
builtin descriptor frontier to fixed and optional path / URL helpers while
leaving variadic `resolve(...segments)` and `join(...segments)` deferred. Those
helpers are still pure, already share stable check / emit helpers, and return
`string`, but they need descriptor metadata derived from the actual call rather
than a fixed signature.

## Decision

Add real variadic flat-builtin descriptor kinds for `resolve` and `join`. The
descriptor calls the existing `checkNodePathResolveArgs(...)` /
`checkNodePathJoinArgs(...)`, builds one required `string` param per actual
segment, returns `string`, and emits through the existing path helper lowering.
Rejected alternatives: fake fixed-arity descriptors for `resolve` / `join`
would either cap the public variadic call shape or lie to call-argument await
lowering; adding path-specific branches to `tryBuildCallArgAwaitExpression`
would bypass the shared ordinary-call descriptor model. fs/process/Promise
builtins remain separate because they carry effect, `never` / void stream,
options-literal, or scheduler / thenable semantics.

## Implementation

- `src/codegen.ts:197` adds `path_resolve` and `path_join` to the synthetic
  call descriptor kind list.
- `src/codegen.ts:11706` extends `resolveFlatBuiltinCallPlan(...)` with
  `resolve` and `join`, deriving params from the actual argument list after the
  existing path argument checks run.
- `src/codegen.ts:12095` emits the new descriptors through
  `emitNodePathResolve(...)` and `emitNodePathJoin(...)`, preserving the
  existing variadic Array<string> packaging and left-to-right argument
  evaluation model.
- `src/codegen.ts:12388` and `src/codegen.ts:14909` keep non-await emit and
  value-position inference on the existing path call-site shortcut behavior.

## Consequences

- **Accepted**: block-bodied async function declarations, async arrows, async
  class methods, and anonymous async function expressions can use one direct
  awaited argument in `resolve(await segment, ...segments)`, `resolve(segment,
  await segment, ...segments)`, `join(await segment, ...segments)`, and
  `join(segment, await segment, ...segments)` for declaration initializers,
  terminal returns, and expression statements whose result is discarded.
- **Preserved**: `resolve(...segments)` still requires at least one string
  segment; `join(...segments)` still accepts zero or more string segments; both
  return `string`.
- **Preserved**: `resolve` / `join` remain call-site-only names, not
  first-class function values.
- **Deferred**: fs/process/Promise descriptors, nested path arguments, multiple
  awaits, assignment await, general expression decomposition, local capture
  across await, Promise rejection handlers, PromiseLike / thenable
  assimilation, and scheduler work remain outside this phase.
- **Regression**: `examples/async_await_path_variadic_call_arg.ts` covers
  declaration initializer, async arrow, async method, anonymous terminal return,
  discard statement, pre-await segment ordering, post-await segment ordering,
  and `.then` observers after completion.
- **Regression**: `examples/await_call_arg_path_variadic_deferred_fail.ts`
  now pins nested variadic path await on the shared unsupported await lowering
  diagnostic.
- **Regression count**: the smoke suite now has 447 explicit run entries.

# 0492 - synthetic call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.25

## Context

ADR [0487](./0487-call-lowering-descriptor-frontier.md) introduced ordinary
call plans, ADR [0488](./0488-map-set-call-descriptor-await.md) added
collection receiver calls, ADR [0489](./0489-string-number-call-descriptor-await.md)
added scalar receiver methods, and ADR [0491](./0491-call-expression-statement-await.md)
allowed descriptor-backed call statements to discard their result. The remaining
short blocker for common async code was synthetic namespace calls:
`console.*` and `String.fromCharCode` still lived behind direct `emitCall` /
`inferType` shortcuts, so direct awaited arguments could not reuse the call
argument decomposition path.

## Decision

Seed descriptor-backed synthetic namespace calls with a narrow
`SyntheticCallKind` plan variant for `console.log`, `console.error`,
`console.warn`, and `String.fromCharCode`. The descriptor carries the callee,
parameter metadata, return type, and label, then emits by delegating to the
existing console and String static helpers. Rejected alternatives: adding
special cases to `tryBuildCallArgAwaitExpression` would repeat the pre-5.20
shape and make later builtin descriptor work harder; moving Promise, process, or
flat Node builtins now is deferred because Promise calls involve runtime and
scheduler behavior, process calls include `never` / void control-flow behavior,
and flat effectful/options-literal builtins need separate descriptor metadata.

## Implementation

- `src/codegen.ts:197` adds `SyntheticCallKind`, and
  `src/codegen.ts:229` adds the `synthetic_call` ordinary plan variant.
- `src/codegen.ts:11601` resolves descriptors for `console.log/error/warn` and
  `String.fromCharCode`, preserving the existing one-argument printable console
  contract and one-number String static contract.
- `src/codegen.ts:11803` lets `resolveOrdinaryCallPlan(...)` return synthetic
  descriptors before falling back to ordinary receiver typing, while keeping
  Promise and process namespaces outside this phase.
- `src/codegen.ts:11938` emits synthetic descriptors through the existing
  `emitConsoleCall(...)` and `emitStringStaticCall(...)` helpers.
- `src/codegen.ts:12128` routes non-await `console.*` and `String.fromCharCode`
  emission through the ordinary call plan, and `src/codegen.ts:14493` uses the
  String synthetic descriptor for value-position return inference.

## Consequences

- **Accepted**: block-bodied async function declarations, async arrows, async
  methods, and anonymous async function expressions can use one direct awaited
  argument in `console.log/error/warn` call statements.
- **Accepted**: `String.fromCharCode(await p)` works in declaration
  initializers, terminal returns, and expression statements whose string result
  is discarded.
- **Preserved**: `console.*` still returns void in this dialect; value-position
  uses keep the `console.<method> returns void and cannot be used as a value`
  diagnostic.
- **Regression**: `examples/async_await_synthetic_call_arg.ts` covers
  declaration, arrow, method, anonymous function expression, String initializer,
  String discard statement, ordering, and `.then` observers; the smoke suite now
  has 439 explicit run entries.
- **Regression**: `examples/await_call_arg_builtin_deferred_fail.ts` now pins
  `Promise.resolve(await p)` and
  `examples/await_call_arg_string_static_deferred_fail.ts` pins nested
  `String.fromCharCode(60 + await p)` on the shared unsupported await lowering
  diagnostic.
- **Scope outside**: Promise/process/Node flat builtin descriptors, nested
  synthetic arguments, multiple awaits, optional / element / constructor calls,
  assignment await, control-flow / try/catch/finally await, non-terminal
  `return await`, general expression decomposition, local capture across await,
  Promise rejection handlers, PromiseLike / thenable assimilation, and scheduler
  work remain deferred.

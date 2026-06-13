# 0493 - flat builtin call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.26

## Context

ADR [0492](./0492-synthetic-call-descriptor-await.md) seeded descriptor-backed
synthetic namespace calls for `console.*` and `String.fromCharCode`. The next
small builtin frontier is the pure global parser pair: `parseInt(s, radix)` and
`parseFloat(s)` already have existing check / emit helpers, return `number`, and
do not carry effect metadata, `never` control flow, stream void behavior, options
literal policy, scheduler work, or thenable semantics.

## Decision

Extend the synthetic call descriptor family with flat parser kinds for
`parseInt` and `parseFloat`. The descriptor carries the ident callee, builtin
kind, parameter metadata, return type, and label, and emits by delegating to the
existing parser helpers. Rejected alternatives: adding parser-specific branches
to `tryBuildCallArgAwaitExpression` would bypass the call descriptor frontier;
moving Promise, process, or Node/std flat builtins now is deferred because those
surfaces carry effect, `never` / void stream, options-literal, scheduler, or
thenable compatibility semantics that need separate metadata.

## Implementation

- `src/codegen.ts:197` adds `parse_int` / `parse_float` to
  `SyntheticCallKind`, and the synthetic descriptor callee now accepts either an
  identifier or property access.
- `src/codegen.ts:11641` adds `resolveFlatBuiltinCallPlan(...)`, preserving the
  existing `checkParseIntArgs(...)` / `checkParseFloatArgs(...)` diagnostics
  while returning parser parameter and `number` return metadata.
- `src/codegen.ts:11783` lets `resolveOrdinaryCallPlan(...)` return flat parser
  descriptors for ident callees before falling through to ordinary function or
  fn-value calls.
- `src/codegen.ts:11991` emits parser descriptors through the existing
  `emitParseInt(...)` / `emitParseFloat(...)` helpers, and `src/codegen.ts:12330`
  routes non-await parser calls through ordinary call plan emission.
- `src/codegen.ts:14880` uses the same flat builtin descriptor for value-position
  return inference, so parser calls still type as `number`.

## Consequences

- **Accepted**: block-bodied async function declarations, async arrows, async
  methods, and anonymous async function expressions can use one direct awaited
  argument in `parseInt(await p, radix)`, `parseInt(text, await p)`, and
  `parseFloat(await p)` for declaration initializers, terminal returns, and
  expression statements whose result is discarded.
- **Preserved**: `parseInt(s, radix)` still requires exactly two arguments, a
  string first argument, and a number radix; `parseFloat(s)` still requires one
  string argument.
- **Preserved**: `parseInt` and `parseFloat` remain call-site-only names, not
  first-class function values.
- **Regression**: `examples/async_await_flat_builtin_call_arg.ts` covers
  declaration, arrow, method, anonymous function expression, discard statement,
  parser ordering after resumption, and `.then` observers after completion.
- **Regression**: `examples/await_call_arg_builtin_deferred_fail.ts` keeps
  Promise builtin await deferred, and
  `examples/await_call_arg_nested_flat_builtin_deferred_fail.ts` pins nested
  flat parser await on the shared unsupported await lowering diagnostic.
- **Regression count**: the smoke suite now has 441 explicit run entries.
- **Scope outside**: Promise/process/Node/std flat builtin descriptors, nested
  flat builtin arguments, multiple awaits, optional / element / constructor
  calls, assignment await, control-flow / try/catch/finally await, non-terminal
  `return await`, general expression decomposition, local capture across await,
  Promise rejection handlers, PromiseLike / thenable assimilation, and scheduler
  work remain deferred.

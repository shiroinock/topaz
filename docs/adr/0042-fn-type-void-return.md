# 0042. Fn type void return (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0041](./0041-preallocated-anon-array-table.md) moved the full graph self-host
probe to `src/codegen.ts:3128:44`, where `withSfVoid(sf, fn: () => void): void`
hit the old fn-type return gate. The compiler source naturally uses
callback-style helper APIs with no result value, but first-class fn signatures
still rejected `void` returns to avoid leaking a no-value type into expression
lowering.

## Decision

Accept `void` as the return type of first-class fn types and block-bodied
arrows. Keep `void` out of value positions: fn parameters still reject it,
void-returning fn calls are valid only as expression statements, and
`Array.map` rejects callbacks that would form `Array<void>`.

Rejected alternatives: rewriting compiler helpers to return a dummy scalar
would make callback APIs unnatural; treating `void` as a real value type would
require variables, containers, unions, and coercions for a no-value
representation; accepting expression-bodied void arrows would silently discard
results such as `(n): void => n + 1`.

## Implementation

- `src/codegen.ts:3366` allows `type_fn` returns to resolve to `void` while
  preserving fn-parameter void rejection and nested-fn return rejection.
- `src/codegen.ts:3524` and `src/codegen.ts:3559` let arrow and callback
  inference carry a `void` return to the call site.
- `src/codegen.ts:3644`, `src/codegen.ts:3808`, and `src/codegen.ts:3833`
  emit fn typedefs, arrow signatures, and arrow casts with `cReturnTypeName`.
- `src/codegen.ts:3739` rejects expression-bodied void arrows before emitting
  a synthetic `return <expr>;`.
- `src/codegen.ts:6931` and `src/codegen.ts:8650` reject `Array.map`
  callbacks returning `void` at both emit and infer sites.

## Consequences

- **Accepted**: fn type annotations such as `(n: number) => void`, block-bodied
  void arrows, bare `return;` in those arrows, and statement-position calls of
  void-returning fn values.
- **Rejected**: void fn parameters, expression-bodied void arrows,
  value-position void fn calls, and `Array.map` callbacks returning `void`.
- **Regression**: `void_fn_type`, `void_fn_type_fail`,
  `void_fn_expr_body_fail`, `void_fn_call_value_fail`, and
  `array_map_void_callback_fail`. `tests/smoke.sh` now contains 264 cases.
- **Next blocker**: the old `fn types cannot return void` blocker is gone. The
  full graph probe now reaches `src/codegen.ts:926:1` and stops because class
  `Emitter` has fields without an explicit constructor or field initializer.

# 0194. Nested first-class function types

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0193](./0193-set-iterable-constructor.md) moved the full graph self-host probe
to `src/codegen.ts:4404:7`, where `collectCaptures` declares an arrow helper
whose `onIdent` parameter is itself a function value. Function types already
lower to fat-pointer structs and `typeIdent`, `typeEq`, and `cTypeName` recurse
through nested function shapes, but the annotation and arrow paths still
rejected fn-in-fn signatures because typedef ordering used to be too fragile.

## Decision

Accept non-recursive nested first-class function types in parameter and return
positions while keeping the existing fat-pointer representation unchanged.
`recordFnMonomorph` now records nested function parameter and return types
before the outer function type, preserving deterministic Map insertion order so
inner typedefs precede outer typedefs.

Rejected alternatives: rewriting the compiler source callback would avoid
normal TypeScript function-type syntax instead of expanding the subset;
changing `typeIdent`, `typeEq`, `cTypeName`, or call lowering would add
unnecessary representation churn because those paths already recurse
structurally; recursive function type aliases remain rejected by alias cycle
detection because forward-declared fn typedefs are still out of scope.

## Implementation

- `src/codegen.ts:1413` recursively registers nested fn params and returns
  before inserting the current fn monomorph.
- `src/codegen.ts:3788` keeps void, duplicate-name, and converted param-shape
  checks for function type annotations, but no longer rejects nested fn
  parameter or return types.
- `src/codegen.ts:4192` keeps explicit/contextual arrow parameter typing and
  void parameter rejection, but no longer rejects fn-typed parameters.
- `src/codegen.ts:4209` keeps explicit/contextual arrow return typing and
  expression-bodied void rejection, but no longer rejects fn-typed returns.
- `examples/arrow_nested_fn_type.ts:5` covers a fn value accepting a fn
  parameter, and `examples/arrow_nested_fn_type.ts:8` covers a fn value
  returning a fn value.
- `tests/smoke.sh:256` wires the positive regression into the smoke suite.

## Consequences

- **Accepted**: `(g: (n: number) => number) => number`, `(n: number) => (x:
  number) => number`, and arrows contextually typed by those shapes.
- **Accepted**: top-level functions can accept outer fn values whose parameters
  are also fn values when the signature path emits the referenced typedefs.
- **Rejected**: `void` as a fn parameter type, fn types inside Map / Set
  monomorphs, recursive function type aliases, rest / optional / default
  parameters in function type annotations, and generic function types.
- **Regression**: `arrow_nested_fn_type` replaces the old nested-fn fail case,
  so the smoke suite remains at 282 checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4404:7` nested-fn blocker and now stops
  at `src/codegen.ts:4396:18` because `const we = (e: Expr) => ...` has no
  explicit or contextual arrow return type.

# 0195. Expression-bodied arrow return inference

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0194](./0194-nested-first-class-function-types.md) moved the full graph
self-host probe to `src/codegen.ts:4396:18`, where local helpers such as
`const we = (e: Expr) => walkExpr(e, localSet, onIdent, onArrow)` have typed
parameters and expression bodies but no contextual function type. Callback-only
return inference already existed for Array methods, but ordinary arrows still
required an explicit or contextual return type.

## Decision

Infer the return type of expression-bodied arrows when their parameters are
known from annotations or context. The inference runs the body expression under
a temporary parameter scope and leaves block-bodied arrows unchanged because
inferring arbitrary `return` statements would require statement-flow typing.

Rejected alternatives: rewriting compiler-source helpers to add `: void` would
paper over a normal TypeScript arrow form needed by self-hosting; extending this
to block bodies would widen the phase into a control-flow typing pass; treating
contextual `void` arrows as expression-discarding statements would weaken the
existing `void` value-use checks.

## Implementation

- `src/codegen.ts:3931` lets `inferArrowType` infer an expression-bodied
  arrow's return type when there is no explicit or contextual return type, and
  re-checks contextual or explicit `void` arrows so non-void expressions are
  still rejected.
- `src/codegen.ts:3988` adds a scoped expression-body inference helper and a
  `void` call recognizer for statement-only calls such as `console.log`,
  process stream writes, `Array.push`, `Map.set`, `Set.add`, and supported
  Node shortcut calls.
- `src/codegen.ts:4329` applies the same inference path during arrow emission,
  so non-contextual arrows and emitted fn monomorphs agree.
- `src/codegen.ts:4471` emits `void` expression bodies as `{ expr; return; }`
  instead of `return expr;`.
- `examples/arrow_infer_return.ts:8` covers non-contextual number/string
  expression returns, `examples/arrow_infer_return.ts:14` covers a `void`
  expression body, and `examples/arrow_infer_return.ts:18` covers an inferred
  `void` fn callback helper.
- `examples/arrow_block_infer_return_fail.ts:5` keeps block-bodied arrows
  without return context rejected.

## Consequences

- **Accepted**: `(n: number) => n + 1`, `(s: string) => "x" + s`, and
  `(s: string) => console.log(s)` in non-contextual variable initializers.
- **Accepted**: existing contextual arrows continue to type from their expected
  fn signature.
- **Rejected**: untyped parameters without context, block-bodied arrows without
  explicit/contextual return type, and contextual or explicit `void` arrows
  whose expression body is non-void.
- **Regression**: `arrow_infer_return` and `arrow_block_infer_return_fail`
  bring the smoke suite to 288 checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4396:18` arrow return blocker and now
  stops at `src/codegen.ts:4535:31` because the nested helper cannot resolve
  `walkExpr` from the sibling local-function scope yet.

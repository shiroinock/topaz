# 0580 - Multi-await object literals

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.113

## Context

[5.112](./0579-multi-await-array-literals.md) added a direct array literal
multi-await planner that keeps element typing in the existing literal emitter.
The next narrow async syntax slice is the matching contextual object literal:
`const value: Shape = { a: await pa, b: await pb }` and a terminal `return {
... }` where the async function payload type supplies the object target. Topaz
object literal expressions deliberately have no standalone type, so this slice
must preserve the annotation / return-type contextual rule rather than invent a
discard expression type.

## Decision

Add `tryBuildMultiAwaitObjectLiteralExpression` beside the binary and array
planners, and try it only from declaration initializer and terminal-return
multi-await fallback. The planner accepts only a paren-unwrapped root
`object_lit` with at least two `prop_kv` members whose values unwrap directly to
simple `await` expressions. It resolves await operands left to right, rejects
void payloads, declares `<tempPrefix>_0`, `<tempPrefix>_1`, ... temps, replaces
each awaited field value with its temp, and then lets the existing contextual
object literal path validate field order, anonymous-class typing, and dunion
coercion.

Rejected alternatives: expression-statement object literals remain deferred
because they have no contextual anonymous-class / dunion target; spread needs
snapshot semantics across suspension boundaries; shorthand and mixed non-await
fields would require ordinary read and side-effect capture rules; nested
object/array literals, ternary/logical expressions, assignment/update/new/call
nesting, try/catch/finally await, PromiseLike assimilation, and scheduler work
are arbitrary decomposition outside this slice.

## Implementation

- `src/codegen.ts:5364` and `src/codegen.ts:5637` route initializer and
  terminal-return multi-await fallback through the object literal planner after
  binary/array planners and before call-argument decomposition.
- `src/codegen.ts:6647` builds the ordered object literal suspension plan and
  temp-replaced transformed expression.
- `src/codegen.ts:6696` defines the object fence: at least two properties, only
  `prop_kv`, every value a direct/simple await, and no nested await operand.
- `src/codegen.ts:13664` lets contextual object literals in async-frame
  planning validate through `emitWithExpected` before returning the supplied
  expected type.
- `src/codegen.ts:6990` lets `replaceAwaitExprInExpr` rebuild object literal
  `prop_kv` values while preserving shorthand and rebuilding spread if a future
  caller reaches it.

## Consequences

- **Accepted**: direct multi-await object literals in contextually typed
  declaration initializers and terminal returns.
- **Preserved**: object literal field validation, field-order lowering,
  anonymous-class / dunion contextual typing, non-void awaited payload checks,
  async-frame completion, and the existing scheduler/runtime.
- **Rejected**: expression-statement discard object literals, object spread,
  shorthand, mixed non-await fields, nested literals, arbitrary expression
  decomposition, Promise ABI changes, thenable assimilation, and scheduler work.
- **Regression**: `async_object_literal_multiple_await` proves initializer and
  terminal-return objects with observable left-to-right awaits;
  `await_object_literal_statement_deferred_fail` pins statement discard as
  deferred.
- **Regression count**: smoke now covers 645 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.

# 0584 - Expression-statement multi-await object literals

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.117

## Context

[5.113](./0580-multi-await-object-literals.md) accepted contextual
multi-await object literals only in declaration initializer and terminal return
positions, where an annotation or async payload type supplies the anonymous
object target. [5.116](./0583-nested-multi-await-array-literals.md) kept
recursive literal expansion leaf-only and avoided general expression
decomposition. The remaining narrow syntax slice is expression-statement
discard, where the awaited operands and post-statement sequencing matter but the
object value itself is intentionally unused.

## Decision

Connect the expression-statement multi-await fallback to
`tryBuildMultiAwaitObjectLiteralExpression` after binary and array literal
planning and before call-argument decomposition. The same object fence applies:
the paren-unwrapped root must be an object literal with at least two `prop_kv`
properties, every value must unwrap directly to a simple `await`, await operands
must not contain nested awaits, and awaited payloads must be non-void. Because
the statement discards the value, the final resume does not emit a standalone
object literal expression or introduce a contextual anonymous-class target.

Rejected alternatives: object spread needs snapshot/evaluation-order policy
across suspension; shorthand and mixed non-await fields need ordinary-read and
side-effect capture policy; nested object/array recursion belongs to a later
contextual decomposition decision; logical/nullish/ternary, assignment/update,
new/call nesting, try/catch/finally await, PromiseLike/thenable changes, and
scheduler/runtime changes remain out of scope.

## Implementation

- `src/codegen.ts:5539` routes expression-statement multi-await fallback through
  the existing object literal planner after binary/array planners and before
  call-argument decomposition.
- `src/codegen.ts:5555` treats a transformed object literal statement as a
  value-discarding completion, so the ordered awaits run but no standalone
  object literal value is emitted.
- `src/codegen.ts:6718` continues to provide the shared object planner and
  `src/codegen.ts:6776` keeps the all-direct-await-property fence.
- `examples/async_object_literal_multiple_await.ts:28` now covers
  expression-statement discard with observable left-to-right await operands and
  a post-statement marker.
- `examples/await_object_literal_statement_deferred_fail.ts:8` keeps a mixed
  non-await object field pinned to the deferred await diagnostic.

## Consequences

- **Accepted**: all-direct-await object literal expression statements in
  top-level async-frame discard position.
- **Preserved**: ordered suspension, non-void awaited payload checks, post
  statement sequencing, no standalone object literal type, and the existing
  Promise ABI and scheduler.
- **Rejected**: spread, shorthand, mixed non-await fields, nested object/array
  decomposition, call-root decomposition, arbitrary expression decomposition,
  PromiseLike/thenable assimilation, and scheduler/runtime changes.
- **Regression**: `async_object_literal_multiple_await` proves initializer,
  terminal-return, and statement-discard object literals; 
  `await_object_literal_statement_deferred_fail` keeps mixed fields deferred.
- **Regression count**: smoke still covers 653 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.

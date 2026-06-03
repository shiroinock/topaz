# 0244 - expression fallback unsupported anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0243](./0243-compound-logical-emit-subset-cleanup.md) advanced the self-host
probe to the final expression fallback in `Emitter.emitExpression`. The blocker
was `src/codegen.ts:7350:17: type mismatch: expected topaz_class_anon_148, got
topaz_dunion_...`, caused by passing the full `Expr` discriminated union to
`unsupported(expr, "expression")`.

The same final fallback shape existed in `Emitter.inferType`. Both fallbacks
already mean "this expression kind is not supported"; the issue was only the
anchor shape flowing through the helper, not accepted language behavior.

## Decision

Keep expression support unchanged, but inline the final unsupported-expression
diagnostic in both emit and infer paths. Each fallback now throws
`CodegenError({ pos: expr.pos }, \`unsupported expression (${expr.kind})\`)`,
which preserves the source position and message text without passing a full
expression union to `unsupported`.

Rejected alternatives: broadening `unsupported` to accept arbitrary `Expr`
unions was rejected because the helper is intentionally narrow for already
classified unsupported forms. Relaxing anonymous-object assignability was
rejected because the blocker is a diagnostic anchor issue, not an assignability
rule. Sweeping prefix, postfix, binary, or operator-specific unsupported calls
was rejected because they are separate sites and not part of this fallback
cleanup.

## Implementation

- `src/codegen.ts:7350`: the final `emitExpression` fallback now throws an
  inline `CodegenError` using a minimal `{ pos: expr.pos }` anchor.
- `src/codegen.ts:10282`: the final `inferType` fallback uses the same inline
  minimal-anchor diagnostic.

## Consequences

- **Accepted**: no new expression forms are accepted.
- **Rejected**: unsupported expression kinds still fail at the original source
  position with `unsupported expression (<kind>)`.
- **Regression**: no examples were added because observable behavior is
  unchanged; the existing 280 smoke entries continue to cover unsupported
  expression failures and handled ternary, call, and `new` positives.
- **Self-host**: the old `src/codegen.ts:7350:17` blocker is resolved. The
  probe now stops at `src/codegen.ts:7362:10: type mismatch: expected
  topaz_boolean, got topaz_union_class_anon_124_or_undefined`, in ternary
  condition type-checking after the expression fallback cleanup.
- **Scope out**: `unsupported`, parser, AST, expression support, assignability,
  runtime, and operator-specific unsupported branches are unchanged.

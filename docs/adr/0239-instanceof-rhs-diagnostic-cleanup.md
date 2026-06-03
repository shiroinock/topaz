# 0239 - instanceof RHS diagnostic cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0238](./0238-element-access-optional-cleanup.md) advanced the self-host probe
into the `instanceof_expr` branch in `Emitter.emitExpression`. The accepted
`instanceof` semantics were already fixed: the left side must be `unknown` or a
concrete class instance, the right side must be a concrete class identifier, and
successful lowering compares the runtime class-tag pointer.

The blocker was not a semantic gap. The emit-side invalid-RHS diagnostic passed
the whole `InstanceofExpr` object to `CodegenError`, and the adjacent infer-side
validation read `expr.rhs.name` directly after a TypeScript-friendly
discriminant check. Those source shapes are richer than the current Topaz
self-host subset needs for a position-only diagnostic.

## Decision

Keep the accepted and rejected `instanceof` forms unchanged, but normalize the
emit and infer validation to use minimal `{ pos: number }` diagnostic anchors
and explicit RHS identifier-name extraction. The RHS class name is materialized
as `string | undefined`, set only after `rhs.kind === "ident"`, then checked for
`undefined` before class lookup or tag emission.

Rejected alternatives: broadening `CodegenError` to accept every expression
variant was rejected because diagnostics only need `pos` here. Adding
`instanceof` support for interfaces, discriminated unions, generic classes, or
dynamic RHS expressions was rejected because this phase is self-host source
cleanup. Rewriting runtime tags or `extractNarrowing` was rejected as unrelated
to the fixed blocker.

## Implementation

- `src/codegen.ts:7115`: `emitExpression(instanceof_expr)` now stores
  `expr.rhs` in a local, extracts `rhsName` only from an identifier RHS, reports
  invalid RHS forms through `{ pos: rhs.pos }`, and still emits the existing
  `topaz_class_<Name>_tag` pointer comparison.
- `src/codegen.ts:9771`: `inferType(instanceof_expr)` mirrors the explicit
  `rhsName` extraction, uses minimal anchors for left-side, invalid-RHS, and
  unknown-class diagnostics, and keeps the concrete-class registry check.

## Consequences

- **Accepted**: no new `instanceof` form is accepted; `unknown instanceof Class`
  and class-instance `instanceof Class` keep their current behavior.
- **Rejected**: interface, dunion, generic, and dynamic RHS expressions remain
  unsupported with the existing diagnostic text.
- **Regression**: no new example was added because behavior is unchanged; the
  existing 280-case smoke suite covers catch narrowing and invalid narrowing
  failures.
- **Self-host**: the old `src/codegen.ts:7115:61` blocker is resolved. The probe
  now stops at `src/codegen.ts:7137:45: type mismatch: expected
  topaz_class_anon_88, got topaz_class_anon_27`.
- **Scope out**: parser, AST shape, runtime class tags, `extractNarrowing`,
  compound narrowing, and accepted `instanceof` semantics are unchanged.

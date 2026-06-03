# 0243 - compound logical emit subset cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0242](./0242-optional-binary-inner-cleanup.md) advanced the self-host probe into
compound logical expression lowering in `Emitter.emitExpression`. The next
blocker was `src/codegen.ts:7318:9: variable declaration must have an
initializer`, caused by the `&&` / `||` branch using an uninitialized
`let rhs: string`, a truthy optional check, and local `try` / `finally` scope
restoration.

The language behavior is already fixed by [0006](./0006-compound-condition-narrowing.md):
the left operand is emitted normally, the right operand is emitted under the
left-implied narrowing (`&&` positive, `||` negative), and the result remains a
strict boolean expression.

## Decision

Keep the accepted `&&` / `||` narrowing semantics unchanged, but normalize the
emit branch to stay inside the compiler subset. The branch now checks
`n !== undefined`, emits the narrowed right operand with initialized local
bindings, and restores the scope on the normal path before returning.

Rejected alternatives: broadening compound-condition narrowing was rejected
because this phase only cleans up source shape. Adding new narrowing forms or
truthy/falsy optional behavior was rejected because [0006](./0006-compound-condition-narrowing.md)
already defines the accepted subset. Changing the generated C operator shape
was rejected because the existing `(${lhs} && ${rhs})` / `(${lhs} || ${rhs})`
lowering is covered by existing tests.

## Implementation

- `src/codegen.ts:7318`: the `&&` / `||` emit branch now uses
  `n !== undefined` instead of a truthy optional check.
- `src/codegen.ts:7319`: the narrowed branch pushes scope, installs
  `scope.narrow(n.name, n.type)`, emits the right operand into an initialized
  `const rhs`, pops scope, and returns immediately.
- `src/codegen.ts:7325`: the non-narrowed branch emits its own initialized
  `const rhs` and preserves the existing C logical operator expression.

## Consequences

- **Accepted**: existing compound narrowing through `&&` / `||` is unchanged,
  including optional narrowing and discriminated-union right operand access.
- **Rejected**: no new compound conditions, parser forms, optional truthiness,
  or carry-narrowing behavior are accepted.
- **Regression**: no examples were added because observable behavior is
  unchanged; the existing 280 smoke entries continue to cover
  `compound_narrow`, `compound_narrow_no_left_fail`,
  `compound_carry_narrow`, and optional narrowing through `&&`.
- **Self-host**: the old `src/codegen.ts:7318:9` blocker is resolved. The
  probe now stops at `src/codegen.ts:7350:17: type mismatch: expected
  topaz_class_anon_148, got topaz_dunion_...`, in the generic unsupported
  expression fallback after binary/call/new/ternary emit handling.
- **Scope out**: `inferType`, `extractNarrowing`, carry narrowing, parser, AST,
  runtime, accepted narrowing patterns, and unrelated binary diagnostics are
  unchanged.

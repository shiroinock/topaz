# 0238 - element access optional cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0237](./0237-property-access-diagnostic-anchors.md) advanced the self-host probe
from property-access diagnostics into the normal element-access path in
`Emitter.emitExpression`. Element access semantics were already fixed:
`Array<T>[number]` lowers through the array monomorph, index expressions must be
`number`, and non-array receivers are rejected. The blocker was only that
`arrayElem(baseType)` returns `TopazType | undefined`, while the implementation
used a truthy/falsy `if (!elem)` check that the Topaz subset intentionally does
not accept.

`inferType` has the same normal element-access shape, so leaving it with a
truthy/falsy optional check would expose the same self-host source issue later.

## Decision

Keep array-only element access unchanged, but rewrite the normal, non-optional
`elem_access` branches in `emitExpression` and `inferType` to guard
`arrayElem(baseType)` with an explicit `elem === undefined` check. Non-array
receiver diagnostics use a minimal `{ pos: number }` anchor so the self-host
source does not need to carry the full element-access expression into
`CodegenError`.

Rejected alternatives: making truthy/falsy optional checks valid was rejected
because strict boolean conditions remain a core subset rule. Broadening element
access to Map, Set, string, or arbitrary indexable objects was rejected because
this phase is source cleanup, not a language expansion. Rewriting optional
element access, assignment targets, array literals, or unrelated
`arrayElem(...)!` sites was rejected as outside the fixed blocker.

## Implementation

- `src/codegen.ts:7063`: normal `emitExpression(elem_access)` now checks
  `elem === undefined`, uses a minimal typed diagnostic anchor for non-array
  receivers, keeps `expectType(expr.index, T_NUMBER)`, and continues emitting
  `topaz_array_<T>_at(...)`.
- `src/codegen.ts:9655`: normal `inferType(elem_access)` mirrors the explicit
  undefined guard and still returns the narrowed concrete element type after the
  guard.

## Consequences

- **Accepted**: no new element-access form is accepted; `Array<T>[number]`
  still emits through the existing array monomorph and infers `T`.
- **Rejected**: non-array receivers still report
  `index access is only supported on Array (got ...)`; non-number indexes still
  fail via the existing `expectType` path.
- **Regression**: no new example was added because behavior is unchanged; the
  existing 277-case smoke suite covers array indexing, non-array index failures,
  optional element access, and indexed assignment paths.
- **Self-host**: the old `src/codegen.ts:7066:12` blocker is resolved. The probe
  now stops at `src/codegen.ts:7115:61: type mismatch: expected
  topaz_class_anon_88, got topaz_class_anon_24`.
- **Scope out**: optional element access, optional helper diagnostics,
  assignment target element access, array literal handling, parser, AST,
  runtime, and array monomorph behavior are unchanged.

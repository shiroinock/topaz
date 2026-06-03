# 0237 - property access diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0236](./0236-process-property-access-narrowing.md) advanced the self-host probe
into the non-optional property-access diagnostic path in `Emitter.emitExpression`.
The frontend semantics were already fixed: class/interface field reads, dunion
common fields, scalar `.length`, and collection `.size` keep their existing
lowering. The remaining blocker was only that method-value and missing-member
diagnostics passed the full `PropAccessExpr` object into `CodegenError`,
producing `src/codegen.ts:7028:13: type mismatch: expected topaz_class_anon_88,
got topaz_class_anon_19`.

`inferType` has the same class/interface/unsupported property-access diagnostic
cluster, so leaving it with full expression anchors would expose the same
self-host source shape later.

## Decision

Keep non-optional property access lowering and type inference unchanged, but
introduce a local minimal `{ pos: number }` anchor after entering each normal
`prop_access` branch. Use that anchor only for class method-as-value,
class missing-member, interface method-as-value, interface missing-member, and
fallback unsupported property-access diagnostics.

Rejected alternatives: broadening `CodegenError` or anonymous-object
assignability was rejected because this phase is a self-host source cleanup, not
a type-system relaxation. Adding method values or broader property access was
rejected because it would change the accepted language. Rewriting optional
access, element access, process handling, or union/dunion diagnostics was
rejected as unrelated to the fixed blocker.

## Implementation

- `src/codegen.ts:6998-7061`: `emitExpression` now creates `exprAnchor` in the
  non-optional `prop_access` branch and passes it to class/interface/fallback
  property-access diagnostics.
- `src/codegen.ts:7000-7025`: dunion discriminator/common-field reads,
  `string.length`, `Array.length`, `Map.size`, `Set.size`, and class field reads
  continue through the existing lowering paths.
- `src/codegen.ts:9560-9648`: `inferType` mirrors the same minimal-anchor cleanup
  for class/interface/fallback property-access diagnostics while preserving field
  result types and existing union, unknown, and dunion rejection messages.

## Consequences

- **Accepted**: no new property access form is accepted; class/interface fields,
  dunion fields, scalar length, and collection size keep their existing behavior.
- **Rejected**: method-as-value, missing member, and unsupported receiver
  diagnostics keep their messages and source positions without carrying the full
  prop-access object into `CodegenError`.
- **Regression**: no new example was added because behavior is unchanged; the
  existing 277-case smoke suite covers the affected accepted and rejected paths.
- **Self-host**: the old `src/codegen.ts:7028:13` blocker is resolved. The probe
  now stops at `src/codegen.ts:7066:12: type mismatch: expected topaz_boolean,
  got topaz_union_dunion_anon_50_or_anon_51_or_anon_52_or_anon_53_or_anon_54_or_anon_55_or_anon_56_or_anon_57_or_anon_58_or_anon_59_or_anon_60_or_anon_61_or_anon_62_or_anon_63_or_anon_64_or_anon_86_or_undefined`.
- **Scope out**: optional property access, optional helper diagnostics, element
  access, call-site method lowering, parser, runtime, and assignability rules are
  unchanged.

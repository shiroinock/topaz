# 0241 - assignment special branch cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0240](./0240-check-assign-target-callsite-anchors.md) advanced the self-host
probe into `Emitter.emitExpression(assign_expr)`. The next blocker was the
compound array-element assignment diagnostic:
`src/codegen.ts:7149:34: type mismatch: expected topaz_class_anon_88, got
topaz_class_anon_27`.

The array-element and interface-field special lowering branches already had
the right language behavior. The remaining issue was source shape: those
branches still used the full assignment expression as a diagnostic anchor,
read target variant fields directly from `expr.target`, and relied on
non-null assertions for facts already validated by `checkAssignTarget`.

## Decision

Keep assignment semantics unchanged, but normalize the special array-element
and interface-field setter branches to use a minimal assignment anchor, a
narrowed local target, and explicit consistency checks for validated lookup
facts.

Rejected alternatives: adding compound assignment support for array elements
or interface fields was rejected because this phase is a self-host subset
cleanup, not a semantics expansion. Changing the array setter or interface
vtable setter representation was rejected because the existing C lowering is
already covered and correct. Sweeping unrelated assignment diagnostics was
rejected to keep this phase limited to the special-lowering cluster.

## Implementation

- `src/codegen.ts:7147`: `emitExpression(assign_expr)` now stores
  `expr.target` in `assignTarget` before dispatching special assignment
  lowering.
- `src/codegen.ts:7148`: the array-element branch narrows through a local
  `target`, reports unsupported compound assignment through `assignAnchor`,
  and checks the validated array element type explicitly before calling
  `topaz_array_<T>_set(...)`.
- `src/codegen.ts:7169`: the interface-property branch narrows through a local
  `target`, reports unsupported compound interface-field assignment through
  `assignAnchor`, and replaces interface/field non-null assertions with
  internal consistency checks before calling the vtable setter.

## Consequences

- **Accepted**: no new assignment form is accepted; plain `a[i] = v` still
  lowers to `topaz_array_<T>_set(...)`, and plain `iface.field = v` still
  lowers through `vt->set_<field>`.
- **Rejected**: compound array-element and interface-field assignment remain
  rejected with the existing messages.
- **Regression**: no new examples were added because observable behavior is
  unchanged; the existing 277 smoke cases cover the relevant assignment paths.
- **Self-host**: the old `src/codegen.ts:7149:34` blocker is resolved. The
  probe now stops at `src/codegen.ts:7290:15: type mismatch: expected
  topaz_boolean, got topaz_union_dunion_anon_50_or_anon_51_or_anon_52_or_anon_53_or_anon_54_or_anon_55_or_anon_56_or_anon_57_or_anon_58_or_anon_59_or_anon_60_or_anon_61_or_anon_62_or_anon_63_or_anon_64_or_anon_86_or_undefined`.
- **Scope out**: parser, AST shape, runtime, assignment accept/reject rules,
  `checkAssignTarget`, `inferType(assign_expr)`, object-literal contextual
  assignment, and the plain fallback assignment path are unchanged.

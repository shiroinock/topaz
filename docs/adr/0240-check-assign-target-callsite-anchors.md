# 0240 - checkAssignTarget call-site anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0239](./0239-instanceof-rhs-diagnostic-cleanup.md) advanced the self-host probe
into assignment lowering in `Emitter.emitExpression`. The next blocker was a
`checkAssignTarget` call in the `assign_expr` branch:
`src/codegen.ts:7137:45: type mismatch: expected topaz_class_anon_88, got
topaz_class_anon_27`.

ADR 0049 had already narrowed `checkAssignTarget` itself to require only a
position anchor, but several assignment and update-expression call sites still
passed the whole expression object. Those full expression variants are richer
than the helper needs and create anonymous anchor-shape mismatches on the
self-host path.

## Decision

Keep `checkAssignTarget`'s signature, implementation, and assignment semantics
unchanged, and normalize the remaining assignment/update call sites to pass a
minimal `{ pos: number }` anchor derived from the enclosing expression. Plain
assignment, object-literal contextual assignment, compound assignment checks,
element assignment, property assignment, interface setter assignment, and
prefix/postfix update validation keep their existing behavior.

Rejected alternatives: broadening `checkAssignTarget` back to accept richer
expression variants was rejected because the helper only needs a diagnostic
position. Broadening `CodegenError` anchor assignability or sweeping unrelated
`CodegenError(expr, ...)` diagnostics was rejected as outside this call-site
cleanup. Changing accepted assignment targets or compound-assignment semantics
was rejected because the probe blocker is a source-shape issue, not a language
semantics gap.

## Implementation

- `src/codegen.ts:7131`: `emitExpression(assign_expr)` now materializes
  `assignAnchor: { pos: number }` and passes it to the object-literal
  assignment pre-check instead of passing the full assignment expression.
- `src/codegen.ts:9747`: `inferType(prefix_op)` now passes `{ pos: expr.pos }`
  to `checkAssignTarget` for `++` and `--`.
- `src/codegen.ts:9755`: `inferType(postfix_op)` now passes `{ pos: expr.pos }`
  to `checkAssignTarget`.
- `src/codegen.ts:9793`: `inferType(assign_expr)` now materializes a minimal
  assignment anchor before calling `checkAssignTarget`.

## Consequences

- **Accepted**: no new assignment form is accepted; identifier, array element,
  class/interface property, and supported update-expression targets retain the
  existing rules.
- **Rejected**: const reassignment, invalid assignment targets, unsupported
  compound element/interface assignment forms, and unnarrowed dunion field
  writes remain rejected by the existing paths.
- **Regression**: no new examples were added because observable behavior is
  unchanged; the existing smoke suite still covers assignment, const
  reassignment, element assignment, property assignment, and update checks.
- **Self-host**: the old `src/codegen.ts:7137:45` blocker is resolved. The probe
  now stops at `src/codegen.ts:7149:34: type mismatch: expected
  topaz_class_anon_88, got topaz_class_anon_27`, an unrelated
  `CodegenError(expr, ...)` diagnostic anchor for compound array element
  assignment.
- **Scope out**: parser, AST shape, runtime, assignment lowering, assignability,
  `checkAssignTarget` internals, and unrelated diagnostic-anchor sweeps are
  unchanged.

# 0258 - template substitution diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0257](./0257-collection-constructor-type-annotation-anchors.md) advanced the
self-host probe to `src/codegen.ts:7818:9`. Template literal substitutions
already accept only `number`, `boolean`, and `string`, but the defensive emit
diagnostic still passed a full `Expr` union to `CodegenError`. The infer-side
template substitution check also passed the full substitution expression even
though the diagnostic only needs its source position.

## Decision

Preserve template literal semantics and normalize template-substitution
diagnostics to explicit `{ pos }` anchors in both emit and infer paths.
Rejected alternatives: broadening `CodegenError` to accept full expression
unions was rejected because diagnostics only need a source position and recent
phases have converged on small anchor objects; changing substitution policy to
accept class/interface/collection values was rejected because that is a
language-feature decision unrelated to this blocker; removing the defensive
emit-side diagnostic was rejected because it remains useful if the stringify
helper is reused or infer/emit invariants drift.

## Implementation

- `src/codegen.ts:7818`: the defensive `emitTemplateExpression` stringify
  diagnostic now passes `{ pos: sub.pos }` while keeping the existing
  `number` / `boolean` / `string` message.
- `src/codegen.ts:9557`: infer-side `template_lit` substitution validation now
  passes `{ pos: sub.expr.pos }` for the same diagnostic.

## Consequences

- **Accepted**: template substitutions of `number`, `boolean`, and `string`
  keep their existing lowering through identity, `topaz_number_to_string`, or
  `topaz_boolean_to_string`.
- **Rejected**: class, interface, array, map, set, and union substitutions
  remain rejected unless existing narrowing or conversion produces a supported
  primitive stringification type.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing build, self-host probe, and smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:7818:9` diagnostic-anchor blocker is
  removed. The next blocker is recorded in the phase outcome JSON.
- **Scope out**: broader diagnostic-anchor cleanup and new template
  stringification policies remain outside this phase.

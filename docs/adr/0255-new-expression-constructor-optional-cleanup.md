# 0255 - new expression constructor optional cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0254](./0254-new-expression-class-diagnostic-anchors.md) normalized
new-expression class diagnostic anchors. The self-host probe then advanced to
`src/codegen.ts:7617:12`, where `emitNewExpression` tested the optional
`cls.ctor` field with object/undefined truthiness before later reading
`cls.ctor.params`. Topaz conditions are strict boolean, so optional constructor
presence must be represented as an explicit optional check.

## Decision

Preserve class construction semantics and pull `cls.ctor` into a local `ctor`
inside the concrete-class `new` branch. The no-constructor path checks
`ctor === undefined`; the constructor-call path reads `ctor.params` from the
narrowed local. Rejected alternatives: teaching object/undefined truthiness was
rejected because Topaz intentionally requires boolean conditions; relying on
`this.classes.has(className)` or repeated optional property reads was rejected
because self-host lowering does not model those correlations; sweeping every
optional-object presence check in `src/codegen.ts` was rejected as too broad for
this phase.

## Implementation

- `src/codegen.ts:7617`: `emitNewExpression` now stores `cls.ctor` in `ctor` and
  checks `ctor === undefined` for the empty-class construction path.
- `src/codegen.ts:7626`: constructor argument lowering now passes
  `ctor.params` to `emitCallArgs`, avoiding a second optional property read
  after the presence branch.

## Consequences

- **Accepted**: empty classes with no constructor and no arguments still lower
  to `topaz_class_<Name>_new()`.
- **Accepted**: classes with constructors still lower through `emitCallArgs`
  with the same constructor parameter list.
- **Rejected**: arguments to no-constructor classes, interfaces, unknown
  constructors, invalid type arguments, and other `new` rejection paths keep
  their existing diagnostics.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing build, self-host probe, and smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:7617:12` strict-boolean blocker is
  removed. The next blocker is recorded in the phase outcome JSON.
- **Scope out**: broader optional-result cleanup and optional-object condition
  rewrites remain outside this phase.

# 0249 - array reserve count string cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0248](./0248-collection-expression-diagnostic-anchors.md) advanced the
self-host probe through collection diagnostic anchors and exposed the remaining
array-literal spread blocker at `src/codegen.ts:7485:27: unknown identifier
'String'`. The site was not a user-facing conversion feature: it only converted
the compiler-local `fixedCount` number into text while constructing the
generated C reserve expression for array literals containing spreads.

## Decision

Replace the local `String(fixedCount)` call with the supported template literal
`${fixedCount}` so the generated reserve expression remains unchanged without
introducing a global `String` value. Rejected alternatives: adding `String(...)`
as a builtin was rejected because this is a single compiler-source formatting
callsite; rewriting array spread reserve construction was rejected because the
existing lowering shape is already covered; adding an ad hoc helper was rejected
because template literal substitution for numbers already exists in the Topaz
source subset.

## Implementation

- `src/codegen.ts:7485`: `emitArrayLiteral` now builds the reserve-sum parts
  with a template literal for the fixed element count and keeps spread length
  fragments as `${tmp}->len`.

## Consequences

- **Accepted**: array-literal spread reserve expression construction and
  number substitution in compiler-source template literals remain supported.
- **Rejected**: bare/global `String` value use, general `String(...)`,
  `Number(...)`, or `Boolean(...)` conversion builtins, and array-spread
  semantic changes remain unsupported.
- **Regression**: no examples were added because emitted C and observable
  language behavior are unchanged; existing spread and template literal
  coverage remains authoritative across the smoke suite.
- **Self-host**: the old `src/codegen.ts:7485:27` `String` blocker is resolved.
  The probe now stops at `src/codegen.ts:7490:25: non-null assertion (\`!\`)
  requires a \`T | undefined\` operand; got topaz_string`.
- **Scope out**: builtin conversion surface area and broader collection
  lowering rewrites remain outside this phase.

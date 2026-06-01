# 0043. Emitter optional state initializers (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0042](./0042-fn-type-void-return.md) moved the full graph self-host probe to
`src/codegen.ts:926:1`, where class `Emitter` failed strict field
initialization. The failing fields are optional ambient state slots used only
inside specific emit or type-machine scopes, and their intended outside-scope
state is absence.

## Decision

Add explicit `= undefined` field initializers to the optional `Emitter` state
slots: `currentClass`, `currentReturnType`, `typeParamScope`,
`currentTypeModule`, and `captureContext`. This preserves the existing source
shape with the rest of the field initializers and keeps strict field
initialization rules unchanged.

Rejected alternatives: adding an `Emitter` constructor would add boilerplate and
split initialization away from the existing field declaration block; relaxing
definite assignment for all `T | undefined` fields would change user-visible
class rules for a compiler-source cleanup.

## Implementation

- `src/codegen.ts:931` and `src/codegen.ts:932` initialize the active class and
  return-type slots to `undefined`.
- `src/codegen.ts:980` initializes the generic type-parameter substitution
  scope to `undefined`.
- `src/codegen.ts:1015` initializes the active type-machine source module to
  `undefined`.
- `src/codegen.ts:1025` initializes the arrow capture context to `undefined`.

## Consequences

- **Accepted**: `Emitter` now satisfies strict field initialization without a
  constructor and without changing its state save / restore paths.
- **Rejected**: no global relaxation for optional fields, and no behavior change
  to user-visible class initialization rules.
- **Regression**: no new sample; existing strict-field-init and
  field-initializer cases still cover the observable language behavior.
  `tests/smoke.sh` remains at 264 cases.
- **Next blocker**: the old `src/codegen.ts:926:1` blocker is gone. The full
  graph probe now reaches `src/codegen.ts:634:74` and stops with
  `unsupported type (type_ref)`.

# 0293 - nullish coalesce anchor annotation

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0292](./0292-minimal-try-finally-lowering.md) advanced the self-host probe to
`src/codegen.ts:10218:30`, where the `??` inference path constructs a local
diagnostic anchor with a bare object literal. Topaz intentionally requires
object literals to have a contextual anonymous-class target, and other
diagnostic anchors in the same compiler area already use explicit
`{ pos: number }` shapes.

## Decision

Annotate the local `exprAnchor` in the `??` binary-operator inference branch as
`{ pos: number }`. This keeps diagnostic anchoring source-compatible with the
existing self-host subset while preserving the current object-literal typing
rule. Rejected alternatives: broadening uncontextualized object-literal
inference was rejected because bare object literals should still be rejected;
adding an anchor helper was rejected because helper return shapes can introduce
another exact anonymous-class friction point; sweeping unrelated anchors was
rejected because they are already typed or outside this blocker.

## Implementation

- `src/codegen.ts:10218` now gives the `??` diagnostic anchor local the explicit
  anonymous-class shape `{ pos: number }` before passing it to `CodegenError`.

## Consequences

- **Accepted**: `??` diagnostics keep the same file, line, column, and message
  behavior.
- **Rejected**: bare object literal inference remains unsupported without a
  contextual anonymous-class target.
- **Regression**: no new smoke rows; existing `non_null_and_coalesce`,
  `coalesce_non_optional_fail`, and the self-host probe cover this behavior.
- **Self-host**: the old `src/codegen.ts:10218:30` object-literal blocker is
  removed; the probe can advance to the next independent blocker.
- **Scope out**: no frontend, runtime, or general object-literal inference
  change is included.

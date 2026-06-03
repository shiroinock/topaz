# 0150. class implements anchors (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0149](./0149-interface-member-anchors.md) moved the full graph self-host probe
to `src/codegen.ts:2998`, where `collectClassMembers` passed the full
`ClassDecl` to `CodegenError` for `implements` validation diagnostics. The
diagnostic constructor only requires `{ pos: number }`.

## Decision

Create `clsAnchor: { pos: number }` in `collectClassMembers` and use it for the
unknown-interface and duplicate-interface diagnostics.

Rejected alternative: broadening `CodegenError` to accept full class
declarations would weaken the existing minimal-anchor direction.

## Implementation

- `src/codegen.ts:2996` creates `clsAnchor` from `cls.pos`.
- `src/codegen.ts:2999` and `src/codegen.ts:3002` use it for `implements`
  diagnostics.

## Consequences

- **Accepted**: class `implements` diagnostics use the same minimal anchor
  pattern as class registration diagnostics.
- **Rejected**: no diagnostic constructor widening is introduced.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.

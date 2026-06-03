# 0154. verify implements call anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0153](./0153-explicit-info-override-boolean.md) moved the full graph self-host
probe to `src/codegen.ts:3072`, where `collectClassMembers` passed the full
`ClassDecl` into `verifyImplements`. `verifyImplements` already declares its
diagnostic anchor parameter as `{ pos: number }`.

## Decision

Pass the existing `clsAnchor` to `verifyImplements`.

Rejected alternative: widening the helper to accept full class declarations
would contradict the local helper contract and the ongoing minimal-anchor
cleanup.

## Implementation

- `src/codegen.ts:3072` passes `clsAnchor` to `verifyImplements`.

## Consequences

- **Accepted**: interface conformance diagnostics keep their minimal anchor
  contract at call sites.
- **Rejected**: no helper contract widening is introduced.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.

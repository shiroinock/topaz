# 0202. resolveGenericCall signature anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0201](./0201-resolve-generic-call-signature-initialized-local.md) moved the
full graph self-host probe to `src/codegen.ts:4862:75`, where
`resolveGenericCall` passed the full generic `FunctionDecl` as the diagnostic
parent for resolving the generic return annotation. `typeFromAnnotation` only
needs an exact `{ pos: number }` anchor, and Topaz's exact anonymous object
matching rejected the wider declaration shape.

[0172](./0172-type-annotation-minimal-anchors.md) and
[0198](./0198-resolve-generic-call-minimal-anchors.md) established that helper
positions needing only a diagnostic location should receive local minimal
anchors rather than broader AST nodes.

## Decision

Create a local `genericAnchor: { pos: number }` from `generic.decl.pos` inside
the first-time generic signature-resolution block and pass it to
`typeFromAnnotation` for the return annotation. Keep the
`withSfFunctionSig` callback explicitly annotated as `(): FunctionSig` so the
returned object literal is contextually typed as the existing signature alias.

Rejected alternatives: broadening anonymous object assignability would change
the language subset; widening `typeFromAnnotation` or `CodegenError` would
weaken narrow diagnostic-anchor contracts; changing generic inference,
substitution, monomorph naming, or worklist behavior is outside this compiler
source cleanup.

## Implementation

- `src/codegen.ts:4861` creates `genericAnchor` from `generic.decl.pos` in the
  signature-resolution block.
- `src/codegen.ts:4862` annotates the `withSfFunctionSig` callback return type
  as `FunctionSig`.
- `src/codegen.ts:4863` passes `genericAnchor` to `typeFromAnnotation` while
  leaving parameter collection, signature storage, monomorph registration, and
  worklist queuing unchanged.

## Consequences

- **Accepted**: generic return annotation resolution now uses the exact minimal
  anchor shape required by Topaz's anonymous object matching.
- **Accepted**: generic function signature resolution and monomorph behavior
  remain unchanged.
- **Rejected**: no object assignability, diagnostic API, or generic lowering
  behavior changed.
- **Regression**: no new example was added because this is compiler-source
  normalization covered by the full graph self-host probe plus existing object
  literal, arrow, and generic-function smoke coverage.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4862:75` exact-object mismatch and now
  stops at `src/codegen.ts:4899:10` with `type mismatch: expected
  topaz_boolean, got
  topaz_union_array_dunion_anon_0_or_anon_1_or_anon_2_or_anon_3_or_anon_6_or_anon_66_or_anon_67_or_anon_68_or_anon_69_or_undefined`.

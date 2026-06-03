# 0219. module declaration annotation anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0218](./0218-block-module-const-optional-cleanup.md) moved the full-graph
self-host probe to `src/codegen.ts:5816:60`, where the module const/global
helper cluster passed a full declaration node into `typeFromAnnotation`.
[0172](./0172-type-annotation-minimal-anchors.md) established that annotation
resolution needs only a diagnostic `{ pos }` anchor, and exact anonymous object
identity rejects wider Topaz source-node shapes in these helper slots.

This is compiler-source cleanup only. Module const hoisting and module global
declaration behavior should not change, and the language should not broaden
anonymous object assignability to make the compiler source compile.

## Decision

Use local minimal anchors for module declaration annotation resolution. Each
site first binds the optional type annotation, derives `{ pos: type.pos }`, and
passes that anchor to `typeFromAnnotation`.

Rejected alternatives: broadening anonymous object assignability was rejected
because it would change subset semantics; changing `typeFromAnnotation` to
accept full declarations was rejected because the helper's diagnostic contract
is intentionally minimal; sweeping unrelated annotation call sites was rejected
as outside this phase's ownership.

## Implementation

- `src/codegen.ts:5812-5818` makes `canHoistModuleConst` derive a minimal
  `typeAnchor` from the annotation before the side-effect-free scalar type
  comparison.
- `src/codegen.ts:5845-5849` makes `tryHoistModuleConst` use the same
  annotation-local and minimal-anchor pattern before declaring the hoisted
  binding.
- `src/codegen.ts:5859-5862` makes `tryEmitModuleGlobalDecl` bind `d.type` to
  an explicit optional local, derive a minimal annotation anchor, and resolve
  the module global type from that annotation.

## Consequences

- **Accepted**: type annotation diagnostics remain positioned at the annotation.
- **Accepted**: module const hoisting and module global declarations keep the
  same eligibility, binding, and generated C behavior.
- **Rejected**: anonymous object assignability, `typeFromAnnotation`'s anchor
  contract, and unrelated annotation call sites remain unchanged.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing module const hoist/module global cases and the full
  smoke suite. `tests/smoke.sh` still contains 277 cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5816:60` mismatch and now stops at
  `src/codegen.ts:5851:68`: `type mismatch: expected topaz_class_anon_88, got
  topaz_class_anon_34`.

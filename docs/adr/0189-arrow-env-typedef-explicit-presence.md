# 0189. Arrow env typedef explicit presence

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0188](./0188-arrow-body-text-initialized-local.md) moved the full graph
self-host probe to `src/codegen.ts:4304:9`, where `emitArrowFunction` used
`if (envTypedef)` before adding an arrow environment typedef to the forward
declaration slot. Topaz intentionally keeps conditions strict boolean, so
compiler source must express string presence explicitly instead of relying on
JavaScript string truthiness.

## Decision

Use `envTypedef.length > 0` as the presence check before pushing the typedef
forward block. This keeps the generated C unchanged: capturing arrows still add
the env typedef, and non-capturing arrows still skip it because their typedef
string remains empty.

Rejected alternatives: adding string truthiness would contradict the documented
strict-boolean subset and existing fail coverage; changing `envTypedef` into an
optional string would add representation churn for one local check; batching
unrelated string checks would cross the fixed scope, and no same-helper
`envTypedef` truthiness remains.

## Implementation

- `src/codegen.ts:4304` now checks `envTypedef.length > 0` before appending the
  arrow environment typedef to `fwdLines`.
- No runtime or lowering representation changed; this is a source cleanup for
  the compiler's own Topaz subset.

## Consequences

- **Accepted**: captured arrows still emit the environment typedef forward
  block, and non-capturing arrows still emit only the arrow function forward
  declaration.
- **Rejected**: string truthiness remains unsupported, and no TypeScript syntax
  coverage was removed or narrowed.
- **Regression**: no example was added because this is compiler-source cleanup
  covered by the full graph self-host probe plus the existing smoke suite.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4304:9` `type mismatch: expected
  topaz_boolean, got topaz_string` blocker and now stops at
  `src/codegen.ts:4333:71` with `type mismatch: expected topaz_class_anon_88,
  got topaz_class_anon_30`.

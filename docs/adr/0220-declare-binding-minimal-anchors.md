# 0220. declare binding minimal anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0219](./0219-module-declaration-annotation-anchors.md) moved the full-graph
self-host probe to `src/codegen.ts:5851:68`, where a module declaration helper
passed a full variable declaration node into `scope.declareBinding`. Prior
minimal-anchor work established that `declareBinding` only needs a diagnostic
`{ pos }` anchor for redeclaration errors; passing wider source-node shapes
trips exact anonymous object identity while compiling the compiler source.

This phase is compiler-source cleanup only. Binding names, inferred or annotated
types, constness, narrowing, module-global registration, for-of lowering, and
generated C should remain unchanged.

## Decision

Normalize the remaining full-node `scope.declareBinding` anchors in the
variable, destructuring, module declaration, and for-of declaration cluster to
local `{ pos }` anchors. The anchor is derived from the declaration or loop
statement that already owned the redeclaration diagnostic position.

Rejected alternatives: broadening anonymous object assignability was rejected
because it would change subset semantics; changing `declareBinding`'s anchor
contract was rejected because the diagnostic contract is already minimal;
sweeping unrelated `CodegenError`, `typeFromAnnotation`, or `assertNotVoid`
anchors was rejected as outside this phase's ownership.

## Implementation

- `src/codegen.ts:5851-5866` derives module const/global binding anchors from
  `d.pos` before calling `scope.declareBinding`.
- `src/codegen.ts:6020-6028` derives each object destructuring binding anchor
  from `b.pos`.
- `src/codegen.ts:6072-6104` derives plain variable declaration anchors from
  `decl.pos`, including the dunion-narrowed const path.
- `src/codegen.ts:6350-6353`, `src/codegen.ts:6433-6440`, and
  `src/codegen.ts:6523-6526` derive for-of array, hash, and iterator binding
  anchors from `stmt.pos`.

## Consequences

- **Accepted**: redeclaration diagnostics remain source-positioned.
- **Accepted**: variable declarations, destructuring, module const/global
  handling, for-of lowering, and generated C keep the same behavior.
- **Rejected**: anonymous object assignability and unrelated diagnostic anchors
  remain unchanged.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing variable declaration, destructuring, module
  const/global, for-of, and full smoke coverage. `tests/smoke.sh` still contains
  277 cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5851:68` `declareBinding` mismatch and
  now stops at `src/codegen.ts:5864:33`: `type mismatch: expected
  topaz_class_anon_88, got topaz_class_anon_34`.

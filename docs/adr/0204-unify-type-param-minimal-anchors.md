# 0204. unifyTypeParam minimal anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

Phase 170 moved the full graph self-host probe to `src/codegen.ts:4997:13`,
where `unifyTypeParam` passed the full `TypeNode` into a `CodegenError`
diagnostic that only needed a source position. Exact anonymous object matching
rejected that wider shape. [0172](./0172-type-annotation-minimal-anchors.md)
and [0198](./0198-resolve-generic-call-minimal-anchors.md) already established
local `{ pos: number }` anchors for helper diagnostics, while the adjacent
generic-call phases cleaned up indexed type-argument reads.

## Decision

Create a local `paramTypeAnchor: { pos: number }` inside `unifyTypeParam` and
use it for the type-parameter-with-type-arguments diagnostic. Replace the
helper's remaining indexed non-null assertions with annotated
`TypeNode | undefined` or `TopazType | undefined` locals, then use positive
`!== undefined` branches before recursive unification. Narrow
`classNameOf(argType)` with an explicit undefined check before reading
`classMonomorphs`.

Rejected alternatives: widening `CodegenError` or the anchor contract would
weaken the minimal-anchor rule; broadening anonymous object assignability would
change the subset; changing array indexed reads or generic inference semantics
would cross this phase's fixed cleanup scope.

## Implementation

- `src/codegen.ts:4984` creates `paramTypeAnchor` from `paramTypeNode.pos`.
- `src/codegen.ts:4997` through `src/codegen.ts:5000` use the minimal anchor for
  the type-parameter diagnostic.
- `src/codegen.ts:5016` through `src/codegen.ts:5059` replace `Array`, `Map`,
  and `Set` type-argument non-null assertions with annotated optional locals
  and explicit internal invariants.
- `src/codegen.ts:5068` through `src/codegen.ts:5087` explicitly narrows
  `classNameOf(argType)` and generic-class type-argument reads before recursive
  unification.

## Consequences

- **Accepted**: recursive generic type-parameter unification keeps the same
  bindings and mismatch diagnostics.
- **Rejected**: no object assignability, array indexing, non-null assertion, or
  generic inference behavior changed.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by the full graph self-host probe plus the existing generic
  smoke cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4997:13` exact-object mismatch and now
  stops at `src/codegen.ts:5096:17` with unsupported method `.repeat` on
  `topaz_string`.

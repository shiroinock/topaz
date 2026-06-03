# 0172. type annotation minimal anchors (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0171](./0171-type-annotation-core-cleanup.md) moved the full graph self-host
probe to `src/codegen.ts:3616`, where `typeFromAnnotationCore` passed a narrowed
Topaz `TypeNode` variant to `typeErr`. The diagnostic API needs only the exact
`{ pos: number }` anchor shape, but exact anonymous object identity rejected the
wider source node shape. [0067](./0067-unsupported-anchor-shape.md) and
[0164](./0164-collect-params-parameter-anchor.md) established the local
minimal-anchor cleanup pattern.

## Decision

Normalize anchors inside `typeFromAnnotationCore`: create a `nodeAnchor` after
the `undefined` guard and pass minimal `{ pos }` objects to diagnostic and
type-annotation helper slots. Create local anchors for nested variant, alias,
function parameter, function return, and type-literal member annotations.

Rejected alternatives: widening anonymous object assignability would change the
language subset; making helper signatures accept full `TypeNode` values would
pollute narrow diagnostic contracts; weakening diagnostics would lose source
positions and leave the same exact-object mismatch elsewhere.

## Implementation

- `src/codegen.ts:3607` through `src/codegen.ts:3618` create `nodeAnchor` and
  use it for same-node diagnostics.
- `src/codegen.ts:3627` through `src/codegen.ts:3644` use `variantAnchor` and
  `nodeAnchor` for union and array annotation helpers.
- `src/codegen.ts:3664` through `src/codegen.ts:3760` use `nodeAnchor` for
  type-reference diagnostics, parent anchors, and generic-class instantiation;
  alias body resolution gets its own `aliasAnchor`.
- `src/codegen.ts:3784` through `src/codegen.ts:3803` use `paramAnchor` and
  `returnAnchor` for function type annotations.
- `src/codegen.ts:3818` through `src/codegen.ts:3857` use `memberAnchor` for
  type-literal member diagnostics while still passing the full `TypeLiteralNode`
  to `findPreAllocatedAnon` and `recordAnonClass`.

## Consequences

- **Accepted**: type annotation diagnostics remain source-positioned while
  helper calls provide the exact minimal anchor shape.
- **Accepted**: full `TypeLiteralNode` values still reach the anonymous-class
  APIs that need member data.
- **Rejected**: no object assignability rule changes and no syntax coverage
  changes.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus existing smoke tests.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:3616` exact-object mismatch and now
  stops at `src/codegen.ts:3628:42` with `block-bodied arrow callback requires
  an explicit return type annotation`.

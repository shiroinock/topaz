# 0173. type union variant loop cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0172](./0172-type-annotation-minimal-anchors.md) moved the full graph
self-host probe to `src/codegen.ts:3628:42`, where `typeFromAnnotationCore`
used `node.variants.map((t) => { ... return vt; })`. The current language
subset intentionally rejects block-bodied arrow callbacks without explicit
return type annotations, and that rule is already covered by smoke tests. The
compiler source should keep moving into the supported Topaz subset instead of
expanding callback typing for one internal helper.

## Decision

Rewrite only the `type_union` variant collection in `typeFromAnnotationCore`
as an explicit `for-of` loop over `node.variants`, accumulating
`TopazType[]` values after the same `typeFromAnnotation` and `assertNotVoid`
checks. Keep discriminated-union collapse and fallback `makeUnion` behavior
unchanged.

Rejected alternatives: adding contextual return annotation support for
block-bodied callbacks would be broader language/type-system work; adding an
explicit return annotation to the callback would introduce a separate callback
annotation source shape; batching the later block-bodied `.map` in
`emitWithExpected` would cross into a different emit/coercion region.

## Implementation

- `src/codegen.ts:3627` through `src/codegen.ts:3634` now initialize
  `const variants: TopazType[] = []`, loop over union variant nodes, create the
  same minimal `variantAnchor`, resolve each annotation, reject `void`, and push
  the resolved variant.
- `src/codegen.ts:3635` through `src/codegen.ts:3637` still pass the accumulated
  variants to `tryMakeDiscriminatedUnion` first and `makeUnion` second.

## Consequences

- **Accepted**: union variant annotation resolution behaves as before, including
  `void` variant rejection.
- **Accepted**: the compiler source no longer relies on an unsupported
  block-bodied `.map` callback at this site.
- **Rejected**: block-bodied arrow callbacks without explicit return type
  annotations remain unsupported.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by the full graph self-host probe plus existing smoke tests.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:3628:42` callback annotation blocker and
  now stops at `src/codegen.ts:3665:48` with unsupported `.has` on a
  `Map<string, ...> | undefined` union.

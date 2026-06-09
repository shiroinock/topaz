# 0333 - single-binary MVP roadmap

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.5

## Context

Phase 3.0-3.4 had drifted toward capability, manifest, doctor, check, and
explain ecosystem work before the product MVP line was explicit. The chosen MVP
boundary is nearer: Topaz should turn a Topaz-subset TypeScript source graph
into one native binary with zero required config, using public `std/fs`,
`std/path`, and `std/process` surfaces plus clear rejects for unsupported
package shapes.

[0332](./0332-builtin-descriptor-metadata-skeleton.md) also introduced a
self-host regression: `src/builtin_descriptors.ts` used top-level `export const`
descriptor arrays, but the native parser for non-root modules accepts exported
function / class / interface / type declarations rather than exported const
arrays.

## Decision

Redraw Phase 3 around the single-binary MVP critical path. Public stdlib and
minimal source package lookup are MVP-critical; effect inference, capability
enforcement, manifest generation, doctor, check, explain, async, regexp,
generic method/interface implementation, the remaining bigint surface, LLM
migration tooling, and Wasm/WASI are post-MVP.

Keep descriptor metadata in `src/builtin_descriptors.ts`, but express the
descriptor tables as exported functions that return arrays and keep effect
atoms string-typed so descriptor arrays stay inside the self-host subset. Rejected
alternatives: removing descriptor metadata was rejected because later
capability and guidance work still needs a single semantic owner; teaching the
native parser top-level `export const` now was rejected because it is broader
than the MVP roadmap fix; implementing `std/fs`, `std/process`, package
resolution, manifest, doctor, check, explain, or sandboxing now was rejected
because this phase only restores the self-host subset and redraws the roadmap.

## Implementation

- `src/builtin_descriptors.ts:1` keeps `BuiltinEffect` as a string alias so
  effect arrays do not require scalar literal-union array monomorphs.
- `src/builtin_descriptors.ts:26` now keeps helper text behind small functions
  instead of top-level runtime constants.
- `src/builtin_descriptors.ts:34` exposes `builtinImportDescriptors()` as an
  exported function returning the import descriptor array.
- `src/builtin_descriptors.ts:183` exposes
  `builtinSyntheticGlobalDescriptors()` as an exported function returning the
  synthetic global descriptor array.
- `src/builtin_descriptors.ts:244` keeps the combined `builtinDescriptors()`
  public API as a function and the loader helper APIs unchanged.
- `MEMO.md:250` redraws Phase 3 as `3.MVP / Phase 3: Single-binary MVP`,
  marks 3.5 complete, and moves ecosystem expansion items behind the MVP gate.

## Consequences

- **Accepted**: descriptor metadata remains the owner for later capability work
  without requiring top-level exported values in the self-hosted compiler.
- **Accepted**: no product import surface changes land in this phase.
- **Rejected**: no `std/fs`, `std/process`, package resolution, manifest,
  doctor, check, explain, effect inference, async, regexp, Wasm, or runtime
  sandboxing implementation lands here.
- **Regression**: no examples or smoke entries were added; behavior is intended
  to remain covered by the existing suite and the self-host CLI C-emission
  probe.

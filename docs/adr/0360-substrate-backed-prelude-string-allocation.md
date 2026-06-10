# 0360 - substrate-backed prelude string allocation

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.33

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the tiny-C-substrate
and internal-prelude direction, and ADR
[0358](./0358-runtime-prelude-starts-with.md) plus
[0359](./0359-runtime-prelude-ends-with.md) proved that pure boolean string
helpers can move onto the prelude lane without changing public diagnostics or
release workflow.

The next migration candidate is not another boolean predicate. `trimStart`
returns a new string, so it needs an allocation boundary. The current roadmap
text still risks implying that every allocation-returning helper must wait for
future internal string-buffer intrinsics, which would unnecessarily block
helpers whose real work is a pure scan and whose final allocation can already
delegate to existing compiler-owned string operations.

## Decision

Internal runtime prelude helpers may migrate pure control-flow or scan logic to
Topaz-subset TypeScript while delegating actual string allocation and copying to
existing compiler-owned primitives. The accepted delegated allocation paths are
the existing lowering for `s.slice(...)`, `String.fromCharCode(...)`, and string
concatenation. These remain C substrate primitives for now. This makes
`String.prototype.trimStart()` the next concrete migration candidate: scan the
leading ASCII whitespace in prelude TS via `.length` and `charCodeAt`, then
return `s.slice(start)`.

Rejected alternatives: moving `slice`, `repeat`, concat, or
`String.fromCharCode` themselves into the prelude now was rejected because they
are the allocation primitives and still need explicit internal string-buffer
intrinsics; introducing unsafe pointers, mutable byte buffers, FFI, or public
runtime imports was rejected because it would widen the language/runtime surface
beyond this migration boundary; migrating path, filesystem, or process helpers
in this phase was rejected because the brief fixes scope to the string
allocation boundary only.

## Implementation

- `docs/runtime-ts-migration.md:41` now splits string-runtime work into
  allocation primitives versus allocation clients and records `trimStart` as the
  next client candidate.
- `docs/runtime-ts-migration.md:70` records the operational boundary: existing
  prelude helpers stay compiler-owned internal modules, allocation primitives
  remain on the C substrate path, and allocation clients may delegate their
  final allocation to those primitives.
- `MEMO.md:274` marks Phase 3.33 complete and points the roadmap at this ADR.

## Consequences

- **Accepted**: runtime TS migration is no longer blocked on first inventing
  general string-buffer intrinsics for every allocation-returning helper.
- **Accepted**: `trimStart` can be staged next as a substrate-backed prelude
  helper without changing codegen behavior, diagnostics, or `runtime/runtime.h`
  in this phase.
- **Rejected**: allocation primitives still do not move into TS prelude, and
  `runtime/prelude.ts` remains a compiler-owned internal module rather than a
  user import API.
- **Scope outside**: no codegen changes, no runtime semantic changes, no
  release workflow changes, no header edits, no capability/manifest behavior,
  and no migration of path, BigInt, container, filesystem, or process helpers.

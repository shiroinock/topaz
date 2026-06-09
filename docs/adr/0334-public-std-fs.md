# 0334 - public std/fs

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.6

## Context

[0313](./0313-stdlib-surface-design.md) made `std/fs` part of the intended
public stdlib, and [0333](./0333-single-binary-mvp-roadmap.md) made public
stdlib imports part of the single-binary MVP. The compiler source still uses
`node:fs` as a compatibility shortcut for self-hosting, but user-facing Topaz
programs need a public filesystem specifier that does not imply Node
compatibility.

## Decision

Add `std/fs` as a public alias for exactly the existing four filesystem
call-site shortcuts: `readFileSync`, `existsSync`, `writeFileSync`, and
`mkdirSync`. The new public descriptors keep the same semantic names and effect
atoms as the `node:fs` compatibility descriptors, and codegen lowering stays
unchanged because those imported names already lower through the existing
syntactic call branches.

Rejected alternatives: adding more filesystem APIs was rejected because the MVP
only needs the current read, metadata, write, and recursive mkdir subset;
rewriting compiler imports from `node:fs` was rejected because compatibility
source churn is outside this public-surface phase; adding manifest checks,
capability enforcement, doctor/check/explain, package lookup, or runtime
sandboxing was rejected because this phase only exposes the descriptor-backed
public import surface.

## Implementation

- `src/builtin_descriptors.ts:34` adds public filesystem explanation text for
  the `std/fs` descriptors.
- `src/builtin_descriptors.ts:76` adds public `std/fs` descriptors for
  `readFileSync`, `existsSync`, `writeFileSync`, and `mkdirSync`, with
  `fs.read`, `fs.metadata`, and `fs.write` effects matching `node:fs`.
- `examples/std_fs_basic.ts:4` imports all four accepted helpers from `std/fs`
  and covers mkdir, exists, write, and read round-trips.
- `examples/std_fs_unknown_named_import_fail.ts:4` keeps unsupported named
  imports rejected for the public specifier.
- `tests/smoke.sh:485` adds one positive and one fail regression.
- `MEMO.md:260` marks Phase 3.6 complete and points to this ADR.

## Consequences

- **Accepted**: public Topaz code can import filesystem helpers from `std/fs`.
- **Accepted**: compatibility `node:fs` imports remain accepted unchanged.
- **Rejected**: unknown `std/fs` named imports such as `unlinkSync` fail through
  the existing stdlib validation path.
- **Regression**: `std_fs_basic` and `std_fs_unknown_named_import_fail` add the
  positive and fail smoke coverage for this public alias.
- **Scope out**: `std/process`, package lookup, manifest enforcement,
  doctor/check/explain, capability enforcement, runtime sandboxing, and new
  filesystem APIs remain follow-up work.

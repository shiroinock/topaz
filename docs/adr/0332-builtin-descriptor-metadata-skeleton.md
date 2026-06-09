# 0332 - builtin descriptor metadata skeleton

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.4

## Context

[0331](./0331-stdlib-capability-metadata-design.md) chose semantic builtin
descriptors as the shared source for future effect inference, doctor, manifest
guidance, check, and explain surfaces. The loader still carried its own
specifier and named-import allowlist, while codegen kept separate syntactic
builtin dispatch. This phase lands the low-risk metadata owner first without
changing lowering or accepting new imports.

## Decision

Add `src/builtin_descriptors.ts` as the source of builtin metadata for the
currently accepted compatibility imports, the public `std/path` alias, and the
synthetic globals named in ADR 0331. Import descriptors record the source
specifier, imported name, semantic name, public-vs-compat status, effect atoms,
and explanation text. Synthetic global descriptors record the same semantic
metadata but are intentionally not wired into codegen yet.

The loader should ask descriptor helpers whether a specifier is builtin, whether
a named import is allowed, and which names are allowed for diagnostics. Rejected
alternatives: refactoring codegen call dispatch now was rejected because it
would broaden behavior risk; adding `std/fs`, `std/process`, manifest, doctor,
check, or explain behavior was rejected because this phase is only the metadata
skeleton; capability enforcement was rejected because no compile rejection
should depend on descriptor effects yet.

## Implementation

- `src/builtin_descriptors.ts:1` defines the effect atoms and public/compat
  status vocabulary for this first descriptor table.
- `src/builtin_descriptors.ts:37` lists the accepted import descriptors:
  `node:fs`, `node:path`, `std/path`, `node:child_process`, and `node:url`.
- `src/builtin_descriptors.ts:184` lists synthetic global descriptors for
  `process.argv`, `process.exit`, stdio writes, console writes, and
  `import.meta.url`.
- `src/builtin_descriptors.ts:248` exposes the loader helpers for specifier,
  named import, and allowed-name diagnostic lookup.
- `src/loader.ts:5` imports the descriptor helpers, `src/loader.ts:67` uses
  them to identify builtin imports, and `src/loader.ts:183` uses them for
  named-import validation while preserving existing diagnostic wording.
- `MEMO.md` records Phase 3.4 as complete and points the roadmap at this ADR.

## Consequences

- **Accepted**: loader-visible builtin import metadata has one semantic source
  of truth with effect atoms ready for later inference and explanation.
- **Accepted**: existing accepted and rejected stdlib import behavior remains
  unchanged, including allowed-name ordering in diagnostics.
- **Rejected**: no codegen dispatch refactor, no new public import surface, no
  manifest schema/enforcement, no doctor/check/explain commands, and no runtime
  sandboxing is implemented here.
- **Regression**: no new examples or smoke entries; existing stdlib smoke cases
  cover accepted imports and unknown named import diagnostics.

# 0355 - runtime TS prelude boundary

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: runtime migration

## Context

`runtime/runtime.h` is currently embedded into generated C via
`src/runtime_header.ts`, which keeps the release compiler binary usable without
a checked-out `runtime/` directory. The next improvement is to express more of
the runtime in Topaz-subset TypeScript, so the runtime itself becomes a proof of
Topaz's supported subset.

The current runtime also contains host ABI operations, raw allocation,
`setjmp`/`longjmp`, libc/syscall wrappers, and C macro monomorphization. Those
cannot be represented faithfully in today's Topaz source without inventing an
unsafe FFI/pointer model first.

## Decision

Adopt a two-layer runtime target: keep a tiny C substrate for host ABI, raw
memory, exception jumps, and macro-backed containers, and introduce an internal
Topaz runtime prelude for helpers whose logic can be expressed over explicit
substrate intrinsics. Prelude modules are compiler-owned, not public stdlib, and
codegen may lower builtin operations to stable prelude C symbols once the
prelude injection lane exists.

Rejected alternatives: rewriting all of `runtime/runtime.h` in TypeScript was
rejected because allocator, file/process, exception, and macro surfaces need
native substrate; exposing public FFI first was rejected because it would expand
the language surface before the runtime migration needs it; keeping the runtime
as generated string-only forever was rejected because it gives no path for the
runtime to exercise the Topaz subset.

## Implementation

- `docs/runtime-ts-migration.md`: records the substrate boundary, migration
  order, compiler requirements, and gates for helper migration.
- `MEMO.md`: records this as the first runtime-TS migration slice after the
  release stabilization work.

## Consequences

- **Accepted**: runtime migration proceeds in small helper slices instead of a
  single rewrite.
- **Accepted**: the release compiler can keep embedding the current generated
  runtime header while prelude infrastructure is built.
- **Rejected**: no public FFI, unsafe pointer surface, sandboxing, or capability
  enforcement is introduced by this decision.
- **Future work**: add internal prelude module injection with stable C symbols,
  then migrate one pure helper behind existing smoke coverage.

# 0045. Module-scoped function C symbols (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0044](./0044-never-return-annotation.md) moved the full graph self-host probe
to `src/loader.ts:100:1`, where `posToLineCol` collided with the private helper
of the same name in `src/codegen.ts`. TypeScript permits same-name helpers in
different modules, but Topaz flattened every top-level function into one source
and C namespace.

## Decision

Store non-generic top-level function signatures with their source name,
declaring `SourceModule`, generated C name, params, and return type. The C name
is deterministic within one compile as `topaz_fn_m<N>_<sourceName>`, where the
module id comes from the loader's source-file order. Duplicate source names are
rejected only within the same declaring module.

Direct calls and bare function-value references resolve through a narrow
module-aware lookup: a function declared in the current module wins; otherwise a
unique non-local function preserves the old flattened import behavior; multiple
non-local matches are rejected as ambiguous. Bare top-level function values now
lower through a small `void *env` wrapper so they match the existing `fn` ABI.

Rejected alternatives: manually renaming one helper would only clear this
blocker; implementing full TypeScript import/export binding would be broader
than the self-host blocker; mangling only the emitted C name while keeping a
single `Map<string, FunctionSig>` would still reject the duplicate during
collection.

## Implementation

- `src/codegen.ts:839` adds `TopLevelFunctionSig` metadata for source name,
  module, generated C name, params, and return type.
- `src/codegen.ts:956` stores module ids and function signatures in arrays
  instead of unsupported `Map<SourceModule, ...>` / `Map<string, Array<...>>`
  shapes, keeping the compiler source inside the current self-host subset.
- `src/codegen.ts:1663` implements same-module duplicate checks and the
  local-first / unique-non-local / ambiguous resolver.
- `src/codegen.ts:1895` assigns each non-generic function its module-scoped C
  symbol, and `src/codegen.ts:2022` emits declarations from that signature.
- `src/codegen.ts:3748` emits ABI-compatible wrappers for bare top-level
  function values; `src/codegen.ts:5918`, `src/codegen.ts:6957`, and
  `src/codegen.ts:9023` use the resolver for value, emit-call, and infer-call
  paths.

## Consequences

- **Accepted**: different modules may define private `sameName` helpers, each
  module's own calls bind locally, and generated C contains distinct static
  symbols.
- **Rejected**: two top-level functions with the same source name in one module
  still fail with `redeclaration of function '<name>'`; ambiguous non-local
  references fail instead of choosing arbitrarily.
- **Regression**: `module_function_collision` and
  `module_function_duplicate_fail`. `tests/smoke.sh` now contains 284 run-case
  invocations.
- **Scope outside**: generic top-level function name collisions remain on the
  older global path until a later import/export binding pass needs them.
- **Next blocker**: the old `posToLineCol` redeclaration is gone. The full
  graph probe now stops later with `cTypeName: union
  topaz_union_array_class_anon_102_or_class_anon_102 is not T | undefined`.

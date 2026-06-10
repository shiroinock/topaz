# Runtime TS Migration Plan

Topaz should move runtime logic toward Topaz-subset TypeScript where doing so
proves the language and keeps the single-binary artifact simple. This is not a
goal to remove C entirely. The target shape is:

```text
tiny C substrate + Topaz runtime prelude -> generated C -> native binary
```

## C Substrate Boundary

Keep host ABI and raw memory operations in C until Topaz has explicit intrinsic
support for them:

- C headers and typedefs for `topaz_number`, `topaz_boolean`, `topaz_string`,
  optional structs, try frames, hash slots, and container storage.
- Arena allocation, calloc/realloc, memcpy, NUL-termination, pointer hashing,
  and raw byte access.
- libc/libm/syscall wrappers: `fopen`, `fread`, `fwrite`, `mkdir`, `access`,
  `fork`, `execvp`, `waitpid`, `realpath`, `snprintf`, `strtod`, `fmod`,
  `isnan`, `isfinite`, `abort`.
- `setjmp` / `longjmp` exception substrate.
- Map/Set macro families until the compiler can emit equivalent monomorphized
  prelude functions.

These are substrate, not public user APIs.
`pnpm run check:runtime-substrate` classifies each remaining `topaz_*` static
helper and substrate macro (`TOPAZ_*` / `topaz_opt_*`) in `runtime/runtime.h`.
New C helpers or macros must either be added to that inventory with a substrate
category/reason or moved to the runtime prelude instead of silently growing the
header.

## Topaz Prelude Candidates

Migrate helpers only after their required substrate calls are explicit. The
recommended order is:

1. Path/string algorithms that can be expressed over byte-oriented intrinsics.
2. BigInt arithmetic and formatting once limb storage has intrinsic accessors.
3. Container algorithms after Map/Set macro monomorphization has a replacement
   story.
4. Filesystem/process wrappers last, because they are thin host calls and will
   overlap with future capability metadata.

Do not migrate a helper just because its public TypeScript shape looks simple.
Split string work into two buckets:

- **Allocation primitives** such as `String.prototype.slice`,
  `String.prototype.repeat`, string concatenation, and
  `String.fromCharCode(...)` stay on the C substrate until Topaz has explicit
  internal string-buffer intrinsics.
- **Allocation clients** may move to the runtime prelude if their algorithmic
  work is pure Topaz-subset control flow and they delegate the final string
  allocation/copying to those existing primitives without changing behavior.

`String.prototype.trimStart()` now uses this pattern: scan leading ASCII
whitespace in prelude TS with `.length` and `charCodeAt`, then return
`s.slice(start)` for the final allocation.

## Required Compiler Work

The compiler needs an internal prelude lane before any helper can move:

- Load one or more repo-owned runtime prelude modules before user modules.
- Keep those modules internal: user source should not import them as public
  stdlib.
- Give prelude functions stable C names so codegen can lower builtin operations
  to them.
- Prevent prelude top-level executable code.
- Preserve diagnostics against user files; prelude diagnostics should be
  internal compiler errors unless the prelude source itself is being developed.
- Keep the generated native compiler and `pnpm run test:selfhost` as the gate.

`runtime/prelude.ts` is embedded into `src/runtime_prelude.ts` by
`pnpm run generate:runtime-prelude`. Normal compilation parses that embedded
source as an internal module before user modules and gives it the stable C
module id `runtime_prelude`. The first migrated helper is
`__topaz_string_starts_with()`, followed by `__topaz_string_ends_with()`, which
codegen targets for `String.prototype.startsWith(search)` and
`String.prototype.endsWith(search)`, followed by
`__topaz_string_trim_start()` for `String.prototype.trimStart()` while
preserving the public method shape and diagnostics. The first non-string-method
helper on this lane is `__topaz_path_extname(path)`, which codegen targets for
imported `node:path` / `std/path` `extname(path)`. It is followed by
`__topaz_path_dirname(path)`, which codegen targets for imported `dirname(path)`.
The next helpers on the same allocation-client lane are
`__topaz_path_basename(path)` and `__topaz_path_basename_ext(path, ext)`, which
codegen targets for imported `basename(path, ext?)`. The next scalar literal
client is `__topaz_boolean_to_string(value)`, which codegen targets for
compiler-owned boolean stringification in template literal substitutions and
`Array<boolean>.join(...)`. String byte equality is now available as
`__topaz_string_eq(a, b)`, which codegen targets for non-container
compiler-owned string `===` / `!==`, string `switch`, and
`Array<string>.includes(...)`. `__topaz_path_join_segments(segments)` now
handles imported `node:path` / `std/path` `join(...segments)` after codegen
packages the already checked variadic arguments into an internal
`Array<string>`. `__topaz_path_resolve_segments(segments, cwd)` handles
imported `node:path` / `std/path` `resolve(...segments)` after codegen packages
the checked variadic arguments and passes the C substrate `topaz_process_cwd()`
fallback. These helpers keep the public stdlib import shape, language surface,
and diagnostics unchanged. The migrated path helpers' old C definitions have
been removed from the embedded runtime header; `topaz_process_cwd()` is the only
remaining C path fallback for `resolve`. The old C definitions for migrated
`startsWith`, `endsWith`, `trimStart`, and compiler-owned boolean
stringification are also removed from the embedded runtime header; their stable
internal prelude helpers remain the only lowering targets. The stale
trim-start byte predicate left behind by the old C `trimStart` implementation
is removed from the embedded runtime header as part of that cleanup; trim
scanning now lives only in `__topaz_string_is_trim_start_code(...)`.

The current string-allocation boundary is:

- allocation primitives (`slice`, `repeat`, concat, `String.fromCharCode`) stay
  on the C substrate path until explicit string-buffer intrinsics exist;
- allocation clients may migrate to prelude TS if they keep their observable
  behavior and delegate the final allocation to those existing compiler-owned
  primitives; `trimStart` and `extname` are the first migrated examples.

Path helpers are migrated one at a time. `extname` qualifies because it is a
pure scan over a single string and delegates the final substring allocation to
`path.slice(start, end)`. `dirname` is the second path helper on the runtime
prelude lane because it is also a pure scan over one string and returns either a
literal or `path.slice(0, end)`. `basename(path, ext?)` follows the same rule:
the one-argument helper scans the last path segment, and the two-argument helper
adds suffix matching before delegating final allocation to `path.slice(start,
end)`. `join(...segments)` is the first array-parameter path helper on this
lane: the public API remains variadic, but the internal helper receives the
segments as `Array<string>` and performs POSIX normalization in Topaz-subset TS.
`resolve(...segments)` uses the same array-parameter lane and keeps only cwd
lookup on the C substrate; right-to-left segment merging and POSIX
normalization now live in the prelude. The migrated C definitions for
`extname`, `dirname`, `basename`, `join`, `resolve`, and the old C normalize
helper are removed from `runtime/runtime.h` once codegen no longer targets them.
Boolean stringification also qualifies for the prelude lane because it is a
pure scalar-to-literal choice and does not allocate beyond returning string
literals. Its old C helper definition is removed after codegen targets only the
stable internal prelude symbol. Direct console boolean IO remains a substrate IO
helper. String byte equality qualifies because it is pure length and byte
scanning over existing string intrinsics, but Map/Set string key equality
remains on the C substrate until container monomorphization has a replacement.

Prelude modules remain internal compiler modules, not a user import surface.

## Migration Rule

Each migrated helper must keep the observable generated program behavior:

- Existing examples and smoke cases must pass.
- The helper's old C path and new prelude path must be covered by a focused
  positive case when the behavior is user-visible.
- `pnpm run check:runtime-header` must pass so the embedded C substrate in
  `src/runtime_header.ts` matches `runtime/runtime.h`.
- `pnpm run check:runtime-prelude` must pass so the embedded prelude source in
  `src/runtime_prelude.ts` matches `runtime/prelude.ts`.
- `pnpm run check:runtime-substrate` must pass so any remaining C helper or
  substrate macro growth is explicitly classified.
- `pnpm run build:release` must still pass the self-host fixed-point and
  binary-only release smoke.

## Scope Boundary

This plan does not introduce user-visible FFI, unsafe pointers, runtime
sandboxing, capability enforcement, async, RegExp, or a new package surface.
Those remain separate roadmap tracks.

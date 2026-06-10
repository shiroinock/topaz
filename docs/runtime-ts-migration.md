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
For example, `String.prototype.slice` and `String.prototype.repeat` allocate
new `topaz_string` buffers; they need substrate intrinsics before they can be
faithfully expressed as runtime prelude code.

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

## Migration Rule

Each migrated helper must keep the observable generated program behavior:

- Existing examples and smoke cases must pass.
- The helper's old C path and new prelude path must be covered by a focused
  positive case when the behavior is user-visible.
- `pnpm run check:runtime-header` must pass so the embedded C substrate in
  `src/runtime_header.ts` matches `runtime/runtime.h`.
- `pnpm run build:release` must still pass the self-host fixed-point and
  binary-only release smoke.

## Scope Boundary

This plan does not introduce user-visible FFI, unsafe pointers, runtime
sandboxing, capability enforcement, async, RegExp, or a new package surface.
Those remain separate roadmap tracks.

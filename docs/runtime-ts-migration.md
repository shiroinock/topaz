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
`category`, `reason`, `migration`, and `next` field or moved to the runtime
prelude instead of silently growing the header. The checker prints deterministic
category counts and migration-lane counts; smoke asserts the lane summary is
present so future runtime cleanup work can see whether the remaining C surface
is shrinking in the intended lane.

## Remaining Migration Lanes

The inventory migration lane is the next work boundary, not a promise that the
symbol should immediately move to TypeScript:

- `c-abi-type-boundary`: ABI-visible typedefs, optional wrappers, and header
  shapes that generated C and runtime helpers still share.
- `raw-memory-boundary`: arena allocation, calloc/realloc, raw byte buffers,
  and representation-level storage.
- `needs-string-buffer-intrinsics`: string allocation/copying primitives and
  byte reads that need explicit internal string-buffer intrinsics first.
- `needs-bigint-limb-intrinsics`: BigInt limb storage, arithmetic, parsing, and
  formatting that need explicit limb intrinsics or generated monomorphs first.
- `container-monomorph-boundary`: Array/Map/Set macro families, hash slots,
  hashing, and key equality until compiler-owned monomorphization replaces the
  C substrate.
- `libc-libm-boundary`: `fmod`, `strtod`, `snprintf`, and numeric formatting
  behavior that currently depends on libc/libm compatibility.
- `exception-boundary`: `setjmp` / `longjmp`, panic, and abort-based control
  transfer.
- `host-abi-boundary`: filesystem, process, URL/module path, child process,
  and raw stdout/stderr wrappers that cross the host ABI.

As of Phase 3.60, `needs-string-buffer-intrinsics` is pinned to exactly
`topaz_string_byte_at(...)` and `topaz_string_from_byte_codes(...)`. This is a
terminal C boundary for the current runtime-prelude experiment, not another
ordinary helper-migration queue. Moving either symbol now requires
compiler-owned internal string-buffer intrinsics: opaque buffer allocation,
byte append/copy/read operations, materialization to immutable `string`, and
hidden lowering available only to runtime prelude modules.

## Hidden String Buffer Intrinsics

The next implementation target is an internal-prelude-only intrinsic family:
`__topaz_string_buffer_new(capacity)`,
`__topaz_string_buffer_push_byte(buffer, byte)`,
`__topaz_string_buffer_append_string(buffer, value)`,
`__topaz_string_buffer_byte_at(buffer, index)`, and
`__topaz_string_buffer_to_string(buffer)`. These helpers operate on an opaque
compiler-owned `StringBuffer` pseudo type. It is not a public class,
interface, importable symbol, structural type, `Array<number>`, or pointer
escape; ordinary user modules must still fail hidden helper references with
`unknown identifier '__topaz_*'`.

The implementation now has type and lowering support for this pseudo type while
keeping the helpers visible only to `runtime/prelude.ts`. The first migrated
client is `__topaz_string_from_char_code`, which allocates a one-byte buffer,
pushes the ASCII code, and materializes an immutable `string`. The remaining
replacement order is: the rest of the string byte materialization clients first
(`__topaz_string_concat`, `__topaz_string_repeat`, `__topaz_string_slice`, and
`__topaz_url_file_url_to_path`), raw byte reads second
(`__topaz_string_char_code_at`), then removal or reclassification of
`topaz_string_byte_at(...)` and `topaz_string_from_byte_codes(...)` after no
prelude client needs the old two-symbol boundary. This is still pre-v0.2.0
runtime prelude groundwork, not manifest, doctor, check, or explain work.

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

- **Allocation primitives** such as byte-buffer materializing helpers stay on
  the C substrate until Topaz has explicit internal string-buffer intrinsics.
  `String.prototype.slice`, compiler-owned string concatenation, and
  `String.prototype.repeat` are the current string exceptions: their
  normalization/copy loops now live in the runtime prelude and delegate final
  materialization to the hidden `__topaz_string_from_byte_codes(...)` substrate
  affordance. `Array.prototype.slice` now also delegates only its numeric index
  normalization to the runtime prelude while keeping monomorphized array
  allocation, reserve, and element copy in generated C.
- **Allocation clients** may move to the runtime prelude if their algorithmic
  work is pure Topaz-subset control flow and they delegate the final string
  allocation/copying to those existing primitives without changing behavior.

`String.prototype.trimStart()` now uses this pattern: scan leading ASCII
whitespace in prelude TS with `.length` and `charCodeAt`, then return
`s.slice(start)` for the final allocation. That final `slice` call targets the
internal `__topaz_string_slice(...)` prelude helper, whose output is materialized
through `__topaz_string_from_byte_codes(...)`.

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
fallback. `__topaz_string_slice(s, rawStart, rawEnd)` now handles
`String.prototype.slice(start?, end?)` after codegen preserves the public
arity/type diagnostics and passes NaN sentinels for omitted arguments.
`__topaz_string_concat(a, b)` now handles compiler-owned binary string `+`,
string `+=`, and template literal concat chains while keeping public type
checking unchanged. `__topaz_string_repeat(s, count)` now handles
`String.prototype.repeat(count)` while codegen keeps the public arity/type
diagnostics and the prelude preserves the range, truncation, and output-size
checks. `__topaz_slice_normalize(n, len, def)` now handles the numeric
normalization shared by `Array.prototype.slice(start?, end?)` while codegen
keeps the receiver snapshot, raw bound temps, `hi < lo` clamp, destination
allocation, reserve, and element copy loop. `__topaz_string_char_code_at(s,
index)` now handles `String.prototype.charCodeAt(index)` after codegen keeps
the public arity/type diagnostics; it performs the public NaN, negative,
out-of-range, and fractional truncation behavior in Topaz-subset TS, then
delegates only the raw in-range byte read to `__topaz_string_byte_at(...)`.
These helpers keep the public
stdlib import shape, language surface, and diagnostics unchanged. The migrated path helpers' old C definitions have
been removed from the embedded runtime header; `topaz_process_cwd()` is the only
remaining C path fallback for `resolve`. The old C definitions for migrated
`startsWith`, `endsWith`, `trimStart`, and compiler-owned boolean
stringification are also removed from the embedded runtime header; their stable
internal prelude helpers remain the only lowering targets. The stale
trim-start byte predicate left behind by the old C `trimStart` implementation
is removed from the embedded runtime header as part of that cleanup; trim
scanning now lives only in `__topaz_string_is_trim_start_code(...)`.

The current string-allocation boundary is:

- `String.prototype.slice` algorithmic behavior lives in the runtime prelude,
  but final byte-string materialization still delegates to
  `topaz_string_from_byte_codes(...)`;
- compiler-owned string concatenation lives in the runtime prelude as an
  allocation client over `charCodeAt` and `__topaz_string_from_byte_codes(...)`;
- `String.prototype.repeat` lives in the runtime prelude as an allocation
  client over `charCodeAt` and `__topaz_string_from_byte_codes(...)`, including
  the existing range and output-size checks;
- `String.prototype.charCodeAt` public semantics live in the runtime prelude,
  while C keeps only the raw `topaz_string_byte_at(...)` substrate used by the
  hidden `__topaz_string_byte_at(...)` affordance;
- `Array.prototype.slice` keeps monomorphized storage and copy in generated C,
  but its NaN-sentinel, negative-index, clamp, and truncation normalization now
  lives in `__topaz_slice_normalize(...)`;
- byte-code string materialization stays on the C substrate path until explicit
  string-buffer intrinsics exist;
- allocation clients may migrate to prelude TS if they keep their observable
  behavior and delegate the final allocation to those existing compiler-owned
  primitives; `trimStart`, `extname`, and the ASCII scalar policy for
  `String.fromCharCode` are migrated examples.

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
stable internal prelude symbol. Console boolean IO also routes through that
same internal prelude helper and then uses the existing string stdout/stderr
substrate helpers, so the dedicated C boolean console helpers are no longer
part of the substrate inventory. Number and BigInt console IO now follow the
same composition shape, but their stringification remains C substrate:
`topaz_number_to_string(...)` / `topaz_bigint_to_string(...)` feed the existing
string stdout/stderr helpers, and the dedicated number/BigInt console wrappers
are removed. `console.warn(...)` now lowers directly to the same stderr string
IO substrate as `console.error(...)`, so the duplicate
`topaz_console_warn_string(...)` wrapper is also removed while preserving the
public `console.warn` call shape and diagnostics. The remaining
`topaz_console_log_string(...)` / `topaz_console_error_string(...)` line
wrappers are removed after codegen takes ownership of line composition by
emitting raw `topaz_stdout_write(...)` / `topaz_stderr_write(...)` plus a
compiler-owned newline string; raw stdout/stderr writes remain C substrate.
String byte equality
qualifies because it is pure length and byte scanning over existing string
intrinsics, but Map/Set string key equality remains on the C substrate until
container monomorphization has a replacement.

`fileURLToPath(url)` now uses the same runtime-prelude migration boundary. Two
compiler-owned internal prelude affordances,
`__topaz_panic(message: string): never` and
`__topaz_string_from_byte_codes(codes: Array<number>): string`, lower directly
to tiny C substrate helpers while staying hidden from user source like the
existing `__topaz_*` prelude symbols. The `file://` prefix check, optional empty
or `localhost` host handling, absolute path check, and byte-preserving percent
decode live in `runtime/prelude.ts`; imported `fileURLToPath(url)` lowers to the
stable internal prelude symbol, and the old
`topaz_url_file_url_to_path(...)` helper is no longer part of the C substrate
inventory. The byte-code helper is necessary because
`String.fromCharCode(...)` remains ASCII-limited while URL percent decoding can
produce arbitrary bytes from `%00` through `%ff`. `topaz_runtime_module_url()`
remains C substrate because it owns executable path syscalls, `realpath`,
platform conditionals, and its process-lifetime cache.

Global `parseInt(s, radix)` now follows the scalar prelude lane as
`__topaz_parse_int(s, radix)`: radix truncation, ASCII whitespace/sign handling,
auto-base prefix handling, digit scanning, and NaN-on-no-digit all live in
Topaz-subset TS. `parseFloat(s)` remains C substrate because it intentionally
delegates decimal/exponent parsing and roundoff behavior to libc `strtod`.

`String.fromCharCode(n)` now follows the same split boundary for one-byte ASCII
strings. The public call shape and diagnostics remain codegen-owned, while the
NaN / negative / `>= 128` rejection and valid fractional truncation live in
`__topaz_string_from_char_code(n)`. Final allocation now uses the internal
`StringBuffer` intrinsic family instead of the temporary
`Array<number>`/`__topaz_string_from_byte_codes(Array<number>)` bridge, so this
helper proves the new substrate without migrating concat, repeat, slice,
fileURLToPath, or charCodeAt yet.

`String.prototype.charCodeAt(index)` now follows the scalar string-read split.
The public call shape and diagnostics remain codegen-owned, while NaN input,
negative input, out-of-range input, and positive fractional truncation live in
`__topaz_string_char_code_at(s, index)`. The only C read helper left for this
path is `topaz_string_byte_at(...)`, a raw byte-read substrate reachable only
through hidden internal prelude calls. Byte-code string materialization still
uses `topaz_string_from_byte_codes(...)`. That materialization primitive should
not be reimplemented in ordinary Topaz-subset TS through
`String.fromCharCode`, concat, repeat, or slice because those helpers already
delegate back through the same byte-code materialization lane. Keeping
`Array<number>` as the internal byte carrier is intentionally temporary and
inefficient; the replacement is a hidden string-buffer intrinsic family, not a
public API.

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

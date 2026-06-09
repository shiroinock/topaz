# 0353 - embedded runtime header for release compiler

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: release prep

## Context

The `v0.1.0-rc.1` workflow built and uploaded `topaz-darwin-arm64`, but a
black-box check found that the downloaded compiler could not compile a program
when placed outside the repository. The generated C still began with
`#include "runtime.h"`, and the native CLI passed `-I<compiler>/../runtime`.
That works inside a checkout, but a single GitHub Release binary has no sibling
`runtime/` directory.

The MVP promise is a native compiler artifact that can compile Topaz-subset
source without Node.js or repository-local bootstrap files. Requiring a tarball
with `runtime/runtime.h` would weaken that promise and make the first release
asset less obvious.

## Decision

Embed `runtime/runtime.h` into the compiler source as generated TypeScript.
`scripts/generate-runtime-header.mjs` writes `src/runtime_header.ts`, and
`src/codegen.ts` emits `runtimeHeaderSource()` at the start of every generated C
file instead of `#include "runtime.h"`.

`scripts/build-release.sh` now includes a binary-only smoke: after producing
`dist-release/topaz-<os>-<arch>`, it copies only that binary into a temporary
directory and compiles `examples/fib.ts` from there. This gate catches any
future accidental dependency on a checked-out `runtime/` directory.

Rejected alternatives: publishing a tarball with both the compiler and
`runtime/runtime.h` was rejected because the compiler artifact should be a
single executable; teaching the CLI to locate a repository checkout was rejected
because release users may not have one; installing `runtime.h` globally was
rejected because it adds host configuration and platform drift.

## Implementation

- `scripts/generate-runtime-header.mjs`: generates the embedded runtime source.
- `src/runtime_header.ts`: generated copy of `runtime/runtime.h` as string
  chunks.
- `src/codegen.ts`: emits the embedded runtime text instead of an include.
- `scripts/build-release.sh`: adds a binary-only release smoke.
- `README.md` and `docs/mvp.md`: document that downloaded release assets may
  need `chmod +x`, but no checked-out `runtime/` directory is required.

## Consequences

- **Accepted**: GitHub Release users can use `topaz-darwin-arm64` as one
  compiler binary plus a platform `cc`.
- **Accepted**: generated C is larger because it contains the runtime header.
- **Accepted**: `runtime/runtime.h` changes must be followed by
  `pnpm run generate:runtime-header`.
- **Rejected**: `runtime/` is no longer a release-time dependency for the
  compiler binary.
- **Future work**: add a freshness check if runtime/header drift becomes common.

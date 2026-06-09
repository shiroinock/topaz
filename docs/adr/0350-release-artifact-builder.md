# 0350 - native compiler release artifact builder

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: release prep

## Context

[0349](./0349-selfhost-artifact-names.md) made the self-host proof artifact
`build/topaz`. That is clear for development, but GitHub Release preparation
needs a repeatable command that turns the self-hosted compiler into a
platform-qualified artifact with checksums. The repository should not commit
the native binary; release assets live outside git history.

## Decision

Add `pnpm run build:release`, backed by `scripts/build-release.sh`. The script:

1. Runs `pnpm run test:selfhost`, preserving the bootstrap, self-host, and
   fixed-point gate.
2. Copies `build/topaz` to `dist-release/topaz-<os>-<arch>`.
3. Smoke-tests the copied compiler with `--help` and `examples/fib.ts`.
4. Writes `dist-release/SHA256SUMS`.

The current supported local release target is Apple Silicon macOS, emitted as
`topaz-darwin-arm64`. The script also maps Linux and x64 names for future local
builders, but release support is still host-built and not yet a CI matrix.

Rejected alternatives: uploading `build/topaz` directly was rejected because it
does not encode the target platform; committing the binary was rejected because
`build/` and `dist-release/` are generated artifacts; adding signing,
notarization, or GitHub Release upload in this step was rejected so artifact
generation remains independently testable.

## Consequences

- **Accepted**: local release preparation has one command:
  `pnpm run build:release`.
- **Accepted**: release assets are named for users (`topaz-darwin-arm64`) while
  internal bootstrap artifacts stay under `build/`.
- **Accepted**: checksums are generated beside the artifact.
- **Rejected**: binary hash equality is not part of this gate. The fixed-point
  proof remains emitted-C equality plus runnable final compiler behavior,
  because Mach-O linker metadata such as `LC_UUID` differs across builds.
- **Future work**: GitHub Actions release automation, signing, notarization,
  and multi-platform release builders.

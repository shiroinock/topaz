# 0351 - GitHub Actions release artifact automation

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: release prep

## Context

[0350](./0350-release-artifact-builder.md) added a local
`pnpm run build:release` command that produces `dist-release/topaz-darwin-arm64`
and `dist-release/SHA256SUMS`. That is enough for a developer machine, but the
release artifact should be reproducible from repository state on a stable build
host instead of depending on whichever local Mac produced it.

GitHub-hosted macOS arm64 runners provide a machine-independent build surface
for the first supported artifact. GitHub's
[runner label table](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
lists `macos-14` as an arm64 macOS runner, so the first workflow can target the
same Apple-Silicon artifact name without introducing cross-compilation yet.

## Decision

Add `.github/workflows/release-artifact.yml`. The workflow supports manual
`workflow_dispatch` runs and `v*` tag pushes. It checks out the repository,
sets up Node 22 and pnpm, runs `pnpm install --frozen-lockfile`, then runs the
existing `pnpm run build:release` gate. After the build it verifies
`SHA256SUMS`, inspects the Mach-O artifact with `file` and `otool -L`, and
uploads `topaz-darwin-arm64` plus `SHA256SUMS` as a workflow artifact.

On tag builds the same job also creates the matching GitHub Release as a draft
if it does not exist, then uploads the artifact and checksum with `--clobber`.
Draft releases keep the publishing decision manual while making the release
asset path reproducible and visible.

Rejected alternatives: publishing non-draft releases was rejected because the
project is still before signing/notarization; keeping release upload local-only
was rejected because it preserves host-machine drift; adding Linux/x64 matrix
jobs was rejected until those targets have explicit runtime and packaging
expectations; adding signing or notarization was rejected as a separate release
hardening step.

## Consequences

- **Accepted**: manual workflow runs can produce downloadable release artifacts
  without creating a GitHub Release.
- **Accepted**: `v*` tags create or update draft GitHub Release assets.
- **Accepted**: the release binary is built on GitHub-hosted macOS arm64 rather
  than the developer's current machine.
- **Rejected**: published, signed, notarized, or multi-platform releases are
  still post-MVP work.
- **Future work**: add release signing/notarization, artifact attestations, and
  additional platform jobs once their target semantics are fixed.

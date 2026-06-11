# 0441 - release manifest init smoke

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.22

## Context

ADR [0438](./0438-release-guidance-cli-smoke.md) made `pnpm run build:release`
black-box smoke the produced native artifact for `doctor`, `check`, and
`explain`, while ADR [0440](./0440-public-manifest-init-cli.md) later made
`topaz manifest init <entry.ts>` public. The release gate therefore still had a
gap: the advertised v0.2 guidance surface could pass as Node-hosted smoke while
the copied native artifact did not prove manifest preview worked.

## Decision

Extend the existing release artifact guidance smoke so the produced
`dist-release/topaz-*` binary proves `topaz manifest init <entry.ts>` alongside
the other public guidance commands. The smoke reuses the existing effectful
`std/fs` fixture and asserts the normalized stdout preview contains the
manifest shape and `fs.read`, while rejecting unrelated `fs.write` and
`io.stdout` fragments. Rejected alternatives: testing only `dist/cli.js`,
changing CLI output, creating or overwriting `strict-ts.json`, adding prompt or
write flags, relying on network/GitHub state, or changing release artifact and
checksum behavior.

## Implementation

- `scripts/build-release.sh:88` extends the produced-artifact help smoke to
  require `topaz manifest init <entry.ts>`.
- `scripts/build-release.sh:104` adds the negative output assertion helper used
  by the manifest preview check.
- `scripts/build-release.sh:117` snapshots the existing check policy fixture,
  runs `"./${release_path}" manifest init "${guidance_entry}"`, checks for
  `"capabilities"` plus `"fs.read"` while rejecting `"fs.write"` and
  `"io.stdout"`, and fails if the policy fixture changed.
- `tests/smoke.sh:390` extends the fast release guidance static contract so
  normal smoke proves the release script contains the manifest-init artifact
  smoke without invoking the release builder.
- `MEMO.md:355` records the Phase 4.22 checkpoint.

## Consequences

- **Accepted**: `pnpm run build:release` now fails if the copied native artifact
  cannot run the public manifest preview command for the same fixture used by
  the guidance smoke.
- **Accepted**: the release smoke stays write-free; the only policy file remains
  the adjacent fixture used by `check`.
- **Accepted**: normal `pnpm test` keeps a static contract for release guidance
  fragments instead of running the full release build.
- **Rejected**: CLI behavior changes, file writes, prompts, policy discovery,
  permission enforcement, runtime/prelude/header changes, release naming,
  checksums, and publication flow remain outside this phase.
- **Regression**: `pnpm run build`, `pnpm test`, and `pnpm run build:release`.

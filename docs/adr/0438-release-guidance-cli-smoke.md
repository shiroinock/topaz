# 0438 - release guidance CLI smoke

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.19

## Context

`v0.1.3` is already the runtime TS prelude checkpoint, while current HEAD is on
the v0.2 manifest / doctor / check / explain track. The release artifact gate
already mirrors runtime freshness, substrate inventory, fixed-point self-host,
native `--help`, `examples/fib.ts` compile/run, and copied binary-only fib
smoke, but it did not yet prove that the produced single binary exposes the
new public guidance commands.

## Decision

Extend `scripts/build-release.sh` with a local, credential-free guidance smoke
that runs against the produced native artifact after the normal fib smoke. The
fixture lives under ignored `build/release_guidance_smoke/`, imports `std/fs`,
and carries an adjacent full `strict-ts.json` so `doctor`, `check`, `explain
capability fs.read`, and `explain std/fs` can be checked without network or
repository credentials. Rejected alternatives: changing `src/cli.ts`
diagnostics, changing runtime/prelude/header files, adding permission
enforcement, changing artifact names or checksum format, consulting GitHub
state, or publishing release tags.

## Implementation

- `scripts/build-release.sh:48` keeps the existing produced-artifact `--help`
  and `examples/fib.ts` compile/run smoke.
- `scripts/build-release.sh:61` writes the release guidance fixture and policy
  under `build/release_guidance_smoke/`.
- `scripts/build-release.sh:84` asserts help still lists `doctor`, `check`,
  `explain capability`, and `explain std/<module>`.
- `scripts/build-release.sh:90` black-box runs `doctor` and checks for the
  stable doctor heading plus `fs.read` capability summary.
- `scripts/build-release.sh:94` black-box runs `check` and requires
  `missing capabilities: none` plus `status: ok`.
- `scripts/build-release.sh:99` black-box runs the two explain commands and
  pins their stable headings.
- `tests/smoke.sh:366` adds a fast static contract check so normal smoke proves
  the release script still contains the guidance command smoke without running
  the full release builder.
- `MEMO.md:352` records the Phase 4.19 release artifact smoke checkpoint.

## Consequences

- **Accepted**: v0.2 release candidates now fail locally if the native artifact
  can compile fib but cannot expose `doctor`, `check`, or the public explain
  commands.
- **Accepted**: normal `pnpm test` remains fast by checking release-script
  fragments rather than invoking `pnpm run build:release`.
- **Accepted**: output checks use stable fragments and avoid depending on the
  absolute checkout path printed in doctor/check reports.
- **Rejected**: runtime TS migration, host substrate movement, permission
  enforcement, manifest init, GitHub release checks, artifact naming, and
  checksum formatting remain unchanged.
- **Regression**: `pnpm run build`, `pnpm test`, and `pnpm run build:release`.

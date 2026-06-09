# 0349 - self-host artifact names

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: post-selfhost release prep

## Context

After [0348](./0348-number-to-string.md), `pnpm run test:selfhost` reaches the
full fixed-point gate. The gate still used `stage1` / `stage2` / `stage3` labels
and artifact names such as `selfhost_cli_stage3_native`. Those names are useful
while designing a bootstrap ladder, but they are too contextual for day-to-day
development and especially for release preparation. The final proof artifact
should read like the product it is: `topaz`.

## Decision

Rename the self-host gate from stage-number vocabulary to role-based names:

- `build/topaz_bootstrap.c` / `build/topaz_bootstrap`: compiler C and native
  compiler produced from the Node development compiler.
- `build/topaz_selfhost.c` / `build/topaz_selfhost`: compiler C and native
  compiler produced by the bootstrap native compiler.
- `build/topaz_fixedpoint.c`: compiler C re-emitted by the self-host native
  compiler and compared against `build/topaz_selfhost.c`.
- `build/topaz`: final native compiler compiled from the fixed-point C.

The package script remains `pnpm run test:selfhost`, but it now runs
`tests/selfhost_fixed_point.sh` and reports `PASS [selfhost_fixed_point]`.

## Consequences

- **Accepted**: the public proof artifact is `build/topaz`, not an internal
  stage label.
- **Accepted**: the development gate still checks every bootstrap step:
  bootstrap compiler creation, self-host compiler creation, fixed-point C diff,
  and final native compiler execution.
- **Rejected**: removing intermediate artifacts was rejected because they are
  useful when diagnosing bootstrap or fixed-point regressions.
- **Regression**: `pnpm run test:selfhost`.

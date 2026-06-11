# 0431 - CLI self-host fib gate

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.12

## Context

ADR [0430](./0430-cli-selfhost-binary-gate.md) made the lightweight CLI
self-host gate build `src/cli.ts` into `build/cli_selfhost/topaz` and prove
that the generated binary exposes the public help surface. The next cheap
fixed-point signal is to make that generated CLI compile and run a small
program without pulling the full `tests/selfhost_fixed_point.sh` ladder into
daily smoke.

## Decision

Extend `pnpm run check:cli-selfhost` so the generated
`build/cli_selfhost/topaz` compiles `examples/fib.ts` into
`build/cli_selfhost/fib`, runs that produced binary, and requires stdout to be
`5702887` after a single trailing newline is removed. Rejected alternatives:
duplicating the full fixed-point gate in normal smoke is too heavy, requiring
warning-free full CLI C is not part of this behavior check, and changing
runtime, manifest, permission, or release workflow semantics would broaden the
phase beyond the CLI self-host regression boundary.

## Implementation

- `scripts/check-cli-selfhost.mjs:8` names the fib source, output path, and
  expected stdout alongside the existing CLI self-host target.
- `scripts/check-cli-selfhost.mjs:32` invokes the generated CLI on
  `examples/fib.ts`, runs `build/cli_selfhost/fib`, checks stdout, and prints a
  deterministic `cli selfhost ok:` summary with both generated artifacts.
- `tests/smoke.sh:261` tightens the `cli_selfhost` smoke assertions so the
  summary must mention both `src/cli.ts -> build/cli_selfhost/topaz` and
  `examples/fib.ts -> build/cli_selfhost/fib`.
- `MEMO.md:345` records the Phase 4.12 compile/run gate.

## Consequences

- **Accepted**: `pnpm run check:cli-selfhost` now proves the Node-hosted
  compiler builds a generated CLI, and that generated CLI compiles and runs
  `examples/fib.ts`.
- **Accepted**: the lightweight summary remains deterministic and begins with
  `cli selfhost ok:`.
- **Rejected**: full fixed-point self-hosting stays in
  `pnpm run test:selfhost`; normal smoke does not duplicate that ladder.
- **Scope外**: runtime semantics, runtime substrate inventory, manifest schema,
  permission enforcement, release workflow, and `tests/selfhost_fixed_point.sh`
  are unchanged.
- **Regression**: `pnpm run build`, `pnpm run check:cli-selfhost`, and
  `pnpm test`.

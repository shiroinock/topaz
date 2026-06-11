# 0430 - CLI self-host binary gate

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.11

## Context

ADR [0429](./0429-doctor-command-selfhost.md) proved that the full
`src/cli.ts` graph can be emitted by the Node-hosted compiler. The next
regression boundary is stronger than C emission: a generated native CLI binary
must start and expose the public command surface needed by the capability /
doctor work before the runtime substrate migration continues.

## Decision

Add an opt-in checker that builds `src/cli.ts` into
`build/cli_selfhost/topaz`, runs that generated binary with `--help`, and pins
the help fragments for normal compile, `doctor`, and `explain capability`.
Rejected alternatives: adding the full fixed-point self-host ladder to daily
smoke, requiring warning-free full CLI C, changing runtime substrate ownership,
or extending manifest/permission behavior are broader than this regression
fence.

## Implementation

- `scripts/check-cli-selfhost.mjs:1` adds the repo-local checker. It compiles
  `src/cli.ts` to a native binary, captures `--help`, checks the three stable
  help fragments, and prints a deterministic `cli selfhost ok:` summary.
- `package.json:29` exposes the checker as `pnpm run check:cli-selfhost`.
- `tests/smoke.sh:250` runs the checker near the existing doctor / capability /
  manifest / effect self-host gates and verifies its stable success text.
- `MEMO.md:344` records the Phase 4.11 checkpoint.

## Consequences

- **Accepted**: `pnpm run check:cli-selfhost` now proves the Node-hosted
  compiler can produce a native `src/cli.ts` binary that responds to `--help`.
- **Accepted**: the required help surface includes `usage: topaz <input.ts>`,
  `topaz doctor <entry.ts>`, and `topaz explain capability <name>`.
- **Rejected**: warning-free generated full CLI C is not required in this phase;
  exit status and generated binary behavior are the gate.
- **Scope外**: runtime semantics, runtime substrate inventory, manifest schema,
  and permission enforcement are unchanged.
- **Regression**: `pnpm run build`, `pnpm run check:cli-selfhost`, and
  `pnpm test`.

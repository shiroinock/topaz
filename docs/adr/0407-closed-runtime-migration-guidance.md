# 0407 - closed runtime migration guidance

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.80

## Context

ADR [0406](./0406-legacy-runtime-migration-lanes-closed.md) made
`needs-string-buffer-intrinsics` and `needs-bigint-limb-intrinsics` closed
checker invariants after the StringBuffer and BigInt prelude migrations. The
success summary already reported both lanes as closed, but some current
guidance still sounded like a backlog state. In particular, the BigInt lane's
`NEXT` text could still tell a future maintainer that explicit limb intrinsics
were needed even though the BigIntBuffer intrinsic family already exists and the
legacy lane is completed history.

## Decision

Keep runtime behavior unchanged and align the checker, smoke probe, and current
runtime migration documentation around the closed-lane invariant. Closed-lane
diagnostics now report the lane, symbol, and closed-lane `NEXT` guidance so a
misclassified symbol explains why that lane is closed even if only the
`migration` field was changed. Rejected alternatives: starting number substrate
migration now was rejected because libc/libm semantics need their own decision;
starting container monomorph replacement was rejected because it is
compiler-owned storage work; rewriting historical ADRs was rejected because
older ADRs should preserve what was true in their phase.

## Implementation

- `scripts/check-runtime-substrate.mjs:37` updates closed-lane `NEXT` guidance
  for the completed StringBuffer and BigInt prelude migrations,
  `scripts/check-runtime-substrate.mjs:51` maps closed lanes to that guidance,
  and `scripts/check-runtime-substrate.mjs:436` carries it into closed-lane
  failures.
- `tests/smoke.sh:55` keeps the focused closed-lane probe and now checks that
  both closed lanes report guidance, including a guard against the stale BigInt
  "needs explicit intrinsics" wording.
- `docs/runtime-ts-migration.md:56` describes both legacy `needs-*` lanes as
  closed invariants with lane, symbol, and guidance diagnostics, while
  `docs/runtime-ts-migration.md:75` frames Phase 3.69-3.78 BigInt notes as
  historical progression.
- `MEMO.md:321` records Phase 3.80 as a checker/docs/test-only guidance
  alignment.

## Consequences

- **Accepted**: a future symbol reclassified into either closed legacy lane now
  fails with the lane name, symbol name, and closed-lane guidance from `NEXT`.
- **Accepted**: current documentation treats `needs-string-buffer-intrinsics`
  and `needs-bigint-limb-intrinsics` as completed migration history.
- **Rejected**: the old BigInt guidance no longer suggests that the closed
  lane still needs an intrinsic family.
- **Regression**: `pnpm run check:runtime-substrate` still reports both closed
  lanes and the active 8-symbol BigInt / 5-symbol StringBuffer families; `pnpm
  test` verifies the closed-lane diagnostic guidance.
- **Scope外**: `runtime/runtime.h`, `runtime/prelude.ts`, generated runtime
  files, codegen output, numeric substrate, and container substrate behavior are
  unchanged.

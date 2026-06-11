# 0448 - release runtime prelude smoke

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.29

## Context

The v0.1.3 release vehicle is the runtime TS prelude checkpoint. Existing
release gates already check runtime header/prelude freshness, the self-host
fixed point, a binary-only `fib` compile/run, and the v0.2 guidance commands.
The README says the native compiler embeds the internal runtime prelude source,
but the release script did not directly prove that a copied compiler artifact
can compile and run a runtime-prelude-dependent fixture outside the checkout.

## Decision

Add a copied-artifact temp-dir smoke for a compact string helper fixture that
depends on migrated runtime prelude helpers. The fixture covers
`String.prototype.slice`, string concatenation, `String.prototype.charCodeAt`,
and `String.prototype.startsWith`, then asserts deterministic stdout from the
compiled binary. Keep the check black-box by asserting artifact behavior rather
than generated `topaz_fn_runtime_prelude_*` symbol names. Rejected alternatives:
grepping generated C would overfit implementation details, migrating another C
substrate helper would broaden the v0.1.3 checkpoint, and adding a new package
script would duplicate the existing `pnpm run build:release` release path.

## Implementation

- `scripts/build-release.sh:187` adds `RELEASE [smoke ${artifact} runtime
  prelude]`, writes `runtime_prelude_smoke.ts` in the existing temp directory,
  runs `./${artifact} runtime_prelude_smoke.ts -o runtime_prelude_smoke` from
  inside that directory, and checks stdout.
- `tests/smoke.sh:432` adds `release_runtime_prelude_smoke_contract` so normal
  `pnpm test` fails if the runtime-prelude release smoke label, fixture name,
  copied-artifact invocation, helper fragments, expected stdout, or
  binary-only failure label disappear.
- `tests/smoke.sh:459` rejects a runtime-prelude smoke section that uses
  `examples/fib.ts`, while preserving the existing binary-only fib smoke.
- `README.md:57` states that release smoke covers `fib`, v0.2 guidance
  commands, and the binary-only runtime-prelude string helper fixture.
- `MEMO.md:362` records Phase 4.29 as a release validation checkpoint.

## Consequences

- **Accepted**: `pnpm run build:release` now proves the copied native artifact
  can compile and run a fixture that needs embedded runtime prelude helpers.
- **Accepted**: normal `pnpm test` statically guards the release script
  contract and prevents the runtime-prelude smoke from collapsing back to only
  the fib fixture.
- **Rejected**: language semantics, runtime helper implementations, artifact
  names, checksum format, GitHub release behavior, manifest/check/doctor/explain
  behavior, and permission semantics remain unchanged.
- **Regression**: `pnpm run build`, `pnpm test`, and `pnpm run build:release`.

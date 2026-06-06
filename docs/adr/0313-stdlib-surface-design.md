# 0313 - stdlib surface design

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.2a

## Context

[0311](./0311-phase2-baseline-hygiene.md) established the Phase 2
build/smoke/self-host baseline, and [0312](./0312-minimal-benchmark-suite.md)
added an opt-in benchmark harness. The compiler now has enough fixed-point
coverage to start separating self-hosting compatibility shortcuts from the
public Topaz standard library surface.

The current `node:*` builtins are useful for compiling the compiler source, but
they should not imply npm or Node compatibility for user programs.

## Decision

Define the intended public stdlib surface as `std/fs`, `std/path`, and
`std/process`, while keeping the existing `node:*` builtins as
self-host/compiler compatibility shortcuts. `std/fs` should cover the
filesystem functions currently mirrored from `node:fs`: `readFileSync`,
`existsSync`, `writeFileSync`, and `mkdirSync`. `std/path` should cover
`dirname`, `resolve`, `basename`, `extname`, and `join`.

Defer exact `std/process` import names because current process and console
support is synthetic/global rather than named-import shaped. Also keep
`node:child_process.execFileSync`, `node:url.fileURLToPath`, and
`import.meta.url` outside the first public stdlib surface unless a later public
use case justifies them.

Rejected alternatives: rewriting existing `src/*.ts` imports in this phase was
rejected because aliases do not exist yet; adding imported `std/process` APIs
now was rejected because the `argv`, stream write, exit, and console naming is
unsettled; a broad `std/node` namespace was rejected because Phase 2 should not
advertise Node compatibility; `std/net`, regexp, bigint, async, and benchmark
changes remain unrelated follow-ups.

## Implementation

- `MEMO.md:234` splits the old `2.2 stdlib surface` item into completed
  `2.2a stdlib surface design` and open implementation follow-ups.
- No loader allowlist, runtime, codegen, examples, or smoke-test behavior
  changes are made in this phase.

## Consequences

- **Accepted**: `std/fs` and `std/path` become the first implementation targets
  because they are already named-import call-site shortcuts.
- **Accepted**: existing compiler source and tests continue using `node:*`
  compatibility imports unchanged.
- **Rejected**: no new accepted import specifiers are added by this decision.
- **Regression**: `pnpm run build` and `pnpm test` cover unchanged behavior.
- **Scope out**: exact `std/process` API names, stdlib alias implementation,
  public spawn/url/import-meta APIs, and larger runtime features remain future
  decisions.

# 0190. Captured identifier minimal anchor

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0189](./0189-arrow-env-typedef-explicit-presence.md) moved the full graph
self-host probe to `src/codegen.ts:4333:71`, where `emitArrowFunction` passed a
full `ArrowExpr` to `emitCapturedIdentifier`. The helper only needs a
diagnostic `{ pos: number }` anchor, and [0187](./0187-arrow-body-binding-minimal-anchor.md)
already introduced `arrowAnchor` for the same arrow expression position inside
this helper.

## Decision

Reuse the existing `arrowAnchor` when emitting captured identifiers for arrow
environment initialization. This keeps diagnostics anchored at the arrow
construction site while preserving capture expression generation and env
initializer semantics.

Rejected alternatives: broadening `emitCapturedIdentifier` to accept full AST
nodes would weaken the minimal-anchor cleanup pattern; allocating a second
local anchor at the capture call site would duplicate the existing value;
changing capture lowering or env initialization would cross the fixed scope.

## Implementation

- `src/codegen.ts:4287` still creates `arrowAnchor` from `arrow.pos` before
  arrow body parameter binding.
- `src/codegen.ts:4333` now passes `arrowAnchor` to
  `emitCapturedIdentifier(name, tMaybe, arrowAnchor)` while keeping the capture
  map iteration, missing-capture check, and env field initializer unchanged.
- `src/codegen.ts:4356` keeps `emitCapturedIdentifier` typed as accepting only
  the minimal `{ pos: number }` diagnostic anchor.

## Consequences

- **Accepted**: captured identifier emission uses the arrow expression position
  as its diagnostic anchor.
- **Rejected**: no object assignability rule, TypeScript syntax coverage, or
  capture/env lowering behavior changed.
- **Regression**: no example was added because this compiler-source cleanup is
  covered by the full graph self-host probe plus the existing 277 smoke checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4333:71` `expected topaz_class_anon_88,
  got topaz_class_anon_30` blocker and now stops at `src/codegen.ts:4343:59`
  with `cannot access '.stmts' on discriminated union topaz_dunion_anon_28_or_anon_29`.

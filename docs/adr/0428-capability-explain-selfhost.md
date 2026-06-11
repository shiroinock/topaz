# 0428 - capability explain self-host

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.10

## Context

Phase 4.9 / ADR [0427](./0427-public-explain-capability-cli.md) added
`topaz explain capability <name>` as a read-only public capability guide. The
full `src/cli.ts` self-host probe then exposed a new blocker in
`src/capability_explain.ts`: interpolating descriptor `status`, a
`"public" | "compat" | "synthetic_compat"` literal union, directly into a
template literal is outside the current Topaz subset. ADR
[0425](./0425-doctor-report-selfhost.md) already established local display
label helpers as the narrower pattern for report-facing literal unions.

## Decision

Keep descriptor metadata precise and keep the public explain text unchanged.
Normalize descriptor display fields through local label helpers before template
literal substitution, specifically converting descriptor status to a plain
string label in `formatCapabilityExplanation`. Rejected alternatives:
expanding template literal interpolation for all string literal unions, widening
descriptor status globally, adding casts around descriptor metadata, changing
manifest/check/init behavior, permission enforcement, runtime sandboxing,
package lookup, runtime/prelude/header substrate, or effect vocabulary are all
broader than this self-host compatibility blocker.

## Implementation

- `src/capability_explain.ts:27` binds descriptor source and status labels
  before constructing output lines.
- `src/capability_explain.ts:31` now interpolates the plain status label while
  preserving the existing `status: public|compat|synthetic_compat` text.
- `src/capability_explain.ts:75` adds `descriptorStatusLabel` for
  public/compat/synthetic_compat status values.
- `tests/smoke.sh:200` adds a focused capability explain self-host gate that
  emits `src/capability_explain.ts` to C and object-compiles the result with
  `cc -O2 -Iruntime -Wall -Wextra -c`.
- `tests/smoke.sh:611` continues to cover the public
  `explain capability fs.read`, `io.stderr`, and unknown `path.resolve` output
  contracts added in Phase 4.9.
- `MEMO.md:342` records the Phase 4.10 capability explain self-host
  checkpoint.

## Consequences

- **Accepted**: the capability explain guidance layer is back inside the
  self-host-compatible subset without changing user-visible explain output.
- **Accepted**: descriptor types remain useful metadata; display conversion is
  local to the renderer.
- **Accepted**: future report/rendering code should continue to use explicit
  label helpers for literal-union values before template interpolation.
- **Rejected**: manifest schema/parsing/writing, `topaz check`, manifest init,
  permission enforcement, runtime sandboxing, package lookup, runtime/prelude
  files, generated runtime artifacts, and effect vocabulary changes remain out
  of scope.
- **Regression**: `pnpm run build`, `node dist/cli.js src/cli.ts --emit-c-only
  -o build/orch_selfhost_probe`, and `pnpm test`.
- **Follow-up blocker**: the full `src/cli.ts` probe now advances past
  `src/capability_explain.ts` and stops at `src/cli.ts:120:13` with
  `type mismatch: expected topaz_undefined, got topaz_string`; that doctor
  parser assignment is outside this phase.

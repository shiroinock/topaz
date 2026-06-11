# 0433 - strict-ts capability policy schema

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.14

## Context

ADR [0329](./0329-zero-config-package-resolution-design.md) kept
`topaz <entry.ts>` zero-config and named `strict-ts.json` as an optional policy
file. ADR [0330](./0330-manifest-doctor-capability-guidance-design.md) reserved
future `topaz check <entry.ts>` behavior for validating an understood manifest
against inferred requirements. ADR [0422](./0422-manifest-requirements.md) and
ADR [0423](./0423-manifest-requirements-selfhost.md) added the internal
requirement grouping layer. The missing bridge is a concrete, self-hostable
policy schema core that future JSON parsing and `check` can reuse.

## Decision

Seed the first in-memory `strict-ts.json` policy shape as
`{ capabilities: string[] }`, with missing capabilities represented by an empty
grant set before this core is called. Capability names are validated against
`builtinEffectVocabulary()`, accepted grants preserve input order, and unknown
or duplicate entries produce deterministic diagnostics. Extra future top-level
keys remain allowed by the future checker/API contract, but this phase validates
only the capability-name array it receives. Rejected alternatives: requiring
`strict-ts.json` for normal compile, implementing public `topaz check` before a
schema core exists, parsing JSON in the self-hostable source core, nested
permission objects or allow/deny blocks in this first slice, and runtime
sandboxing or permission enforcement.

## Implementation

- `src/manifest_policy.ts:3` defines the current normalized policy type and
  validation result shape.
- `src/manifest_policy.ts:18` exposes `manifestPolicyFilename()` as
  `strict-ts.json`, while `src/manifest_policy.ts:22` represents missing
  capabilities as an empty policy.
- `src/manifest_policy.ts:26` validates capability arrays with array-only
  membership checks, rejecting unknown and duplicate names without `Set`,
  `Map`, JSON parsing, or object-key reflection.
- `scripts/check-manifest-policy.mjs:1` imports the built module and asserts the
  filename, valid grants, empty grants, unknown diagnostics, and duplicate
  diagnostics.
- `scripts/check-manifest-selfhost.mjs:5` now emits and object-compiles
  `src/manifest_policy.ts` beside `src/manifest_requirements.ts`.
- `package.json:26` exposes `pnpm run check:manifest-policy`, and
  `tests/smoke.sh:144` adds both the policy checker and manifest policy
  self-host assertions near the existing manifest gates.
- `MEMO.md:347` records the Phase 4.14 checkpoint.

## Consequences

- **Accepted**: `strict-ts.json` now has a first stable capability grant slice
  for future parsing and `check` work.
- **Accepted**: an absent `capabilities` key maps to an empty grant set before
  validation, keeping normal compile zero-config.
- **Accepted**: deterministic diagnostics reject `fs.delete`-style unknown
  names and repeated known grants.
- **Accepted**: valid grants keep input order so later CLI diagnostics can echo
  policy intent without sorting surprises.
- **Rejected**: public `topaz check`, manifest JSON IO, permission rejection,
  runtime sandboxing, nested policy objects, runtime/prelude/header changes,
  and effect vocabulary changes remain outside this phase.
- **Regression**: `pnpm run build`, `pnpm run check:manifest-policy`,
  `pnpm run check:manifest-selfhost`, `pnpm test`, and
  `node dist/cli.js src/cli.ts --emit-c-only -o build/orch_selfhost_probe`.

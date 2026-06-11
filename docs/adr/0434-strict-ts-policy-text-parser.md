# 0434 - strict-ts policy text parser

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.15

## Context

ADR [0433](./0433-strict-ts-capability-policy-schema.md) fixed the first
normalized `strict-ts.json` policy slice as `{ capabilities: string[] }`, but it
deliberately stopped at an in-memory validator. Future `topaz check <entry.ts>`
must run from the native self-hosted CLI, so the manifest reader cannot depend
on host `JSON.parse`. The next bridge is a tiny, deterministic text parser for
the current policy shape that remains emit-able by Topaz itself.

## Decision

Add `parseManifestPolicyText(text)` to `src/manifest_policy.ts`. It accepts a
top-level object, treats missing `capabilities` as an empty grant set, accepts
`capabilities` arrays of ordinary ASCII strings, and ignores extra top-level
keys by recursively skipping enough JSON values for future keys. The parser
then reuses `validateManifestPolicyCapabilities(...)` so unknown and duplicate
capability diagnostics stay identical to the Phase 4.14 validator. Rejected
alternatives: using `JSON.parse` in `src/`, adding public `topaz check`, adding
`Map` / `Set` / key-reflection based parsing, supporting `\uXXXX` escapes before
capability names need them, and changing runtime/prelude/header behavior.

## Implementation

- `src/manifest_policy.ts:19` adds parser state local to the manifest policy
  module, keeping the source graph unchanged for the existing self-host gate.
- `src/manifest_policy.ts:49` exports `parseManifestPolicyText(text)` and
  routes successful capability arrays through the existing validator.
- `src/manifest_policy.ts:99` parses the top-level object and rejects duplicate
  `capabilities` keys while ignoring other future keys.
- `src/manifest_policy.ts:139` requires `capabilities` to be an array of
  strings and preserves input order before validation.
- `src/manifest_policy.ts:166` skips unknown JSON values including nested
  strings, numbers, booleans, null, arrays, and objects.
- `src/manifest_policy.ts:266` supports quoted ASCII strings and the current
  useful escapes, while rejecting unicode escapes with a deterministic message.
- `scripts/check-manifest-policy-parse.mjs:1` imports the built module and
  asserts accepted forms, ignored extra keys, syntax/type failures,
  duplicate-key failure, invalid skipped numbers, and reused unknown/duplicate
  capability diagnostics.
- `package.json:27`, `tests/smoke.sh:158`, `scripts/check-manifest-selfhost.mjs:12`,
  and `MEMO.md:348` wire the parser into local gates and roadmap state.

## Consequences

- **Accepted**: `{}`, `{ "capabilities": [] }`, and ordered known capability
  arrays parse into the normalized policy shape.
- **Accepted**: extra top-level keys are ignored without committing future schema
  shape to this phase.
- **Accepted**: invalid object syntax, non-object top-level values, non-array
  `capabilities`, non-string entries, duplicate top-level `capabilities`, and
  unsupported unicode escapes produce deterministic parser diagnostics.
- **Accepted**: unknown and duplicate capability names still use the existing
  validator diagnostics and accepted-grant order.
- **Rejected**: public `topaz check`, manifest file IO, permission enforcement,
  runtime sandboxing, runtime/prelude/header changes, and broad JSON compliance
  remain outside this phase.
- **Regression**: `pnpm run build`, `pnpm run check:manifest-policy`,
  `pnpm run check:manifest-policy-parse`, `pnpm run check:manifest-selfhost`,
  `pnpm test`, and
  `node dist/cli.js src/cli.ts --emit-c-only -o build/orch_selfhost_probe`.

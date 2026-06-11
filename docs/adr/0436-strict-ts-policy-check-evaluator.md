# 0436 - strict-ts policy check evaluator

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.17

## Context

ADR [0330](./0330-manifest-doctor-capability-guidance-design.md) reserved
`topaz check <entry.ts>` for validating that an existing manifest is understood
and covers inferred requirements. ADR [0433](./0433-strict-ts-capability-policy-schema.md)
fixed the first `{ capabilities: string[] }` policy shape, ADR
[0434](./0434-strict-ts-policy-text-parser.md) made parsing self-hostable, and
ADR [0435](./0435-strict-ts-policy-file-loader.md) added explicit file loading
with missing files represented as valid empty policies. The remaining internal
bridge is a deterministic evaluator that compares requirements with accepted
policy grants before adding any public CLI command.

## Decision

Add `src/manifest_check.ts` as a read-only evaluator and formatter over the
existing manifest requirement collector and manifest policy loader. It preserves
entry, policy path, found/valid booleans, requirements, missing issues, policy
diagnostics, and a final `ok` bit. Missing grants are produced by linear Array
scan in `collectManifestRequirements` order, and `ok` is true only when the
loaded policy is valid and every requirement effect has a matching capability.
Rejected alternatives: adding public `topaz check`, choosing entry-directory or
cwd manifest discovery, enforcing permissions in normal compile, writing or
prompting for manifests, changing doctor output, using `Map` / `Set`, or
touching runtime/prelude/header files.

## Implementation

- `src/manifest_check.ts:1` imports `ManifestRequirement` collection and
  `ManifestPolicyFileLoadResult` loading instead of duplicating either layer.
- `src/manifest_check.ts:11` exports `ManifestCheckIssue`, and
  `src/manifest_check.ts:16` exports `ManifestCheckResult` with preserved policy
  diagnostics and requirements.
- `src/manifest_check.ts:27` compares requirements against accepted policy
  capabilities with self-hostable linear Array helpers.
- `src/manifest_check.ts:55` exposes the path-explicit entry helper, and
  `src/manifest_check.ts:63` formats a compact `topaz check report`.
- `scripts/check-manifest-check.mjs:1`, `package.json:29`, and
  `tests/smoke.sh:186` add regression coverage for pure missing policy,
  effectful missing policy, full grants, partial grants, invalid policy, and
  unknown capability diagnostics.
- `scripts/check-manifest-selfhost.mjs:17` adds `src/manifest_check.ts` to the
  manifest self-host object gate.
- `MEMO.md:350` records Phase 4.17 completion without changing AGENTS.md or the
  frozen implementation archive.

## Consequences

- **Accepted**: pure entry graphs with a missing policy report `status: ok`,
  mark the policy missing, and show `missing capabilities: none`.
- **Accepted**: effectful entry graphs with missing or partial policy grants
  report `status: failed` with missing capabilities in requirement order and
  one issue per effect carrying the requirement occurrence count.
- **Accepted**: full policy grants report `status: ok`, and invalid policy files
  keep Phase 4.14/4.15 diagnostics such as `top-level value must be an object`
  and `unknown capability 'fs.delete'`.
- **Rejected**: public CLI wiring, manifest discovery, compile-time rejection,
  runtime sandboxing, manifest init/writes, doctor output changes, and runtime
  prelude/header changes remain outside this phase.
- **Regression**: `pnpm run build`, manifest requirement/policy/load/check
  gates, manifest self-host object compilation, full CLI self-host probes, and
  `pnpm test`.

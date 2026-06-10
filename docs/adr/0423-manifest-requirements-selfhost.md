# 0423 - manifest requirements self-host

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.5

## Context

Phase 4.4 / ADR [0422](./0422-manifest-requirements.md) introduced
`src/manifest_requirements.ts` as the internal requirement grouping layer for
descriptor-backed builtin effect provenance. That module immediately exposed a
self-host blocker: `Map<string, Array<...>>` value monomorphs are outside the
current generated container support. The compiler's subset floor is still what
the compiler can emit for itself, and this manifest layer can avoid the
unsupported container shape without changing the public internal API.

## Decision

Keep `ManifestRequirement`, `collectManifestRequirements(provenance)`, and
`collectManifestRequirementsForEntry(entry)` stable, but rewrite the grouping
implementation to use an array-backed requirement list plus linear membership
helpers. Fixed seed vocabulary ordering is preserved by copying known groups
first and then appending remaining first-seen groups that were not emitted yet.
Rejected alternatives: adding `Map<string, Array<T>>` lowering, generic
container expansion, or `Array.sort` was rejected as compiler/backend work
outside this phase; public doctor/check/explain/manifest commands, manifest
schema/parsing/writing, prompts, permission rejection/enforcement, new effect
atoms, broad propagation, loader/package-resolution changes, runtime header
changes, and runtime prelude changes remain out of scope.

## Implementation

- `src/manifest_requirements.ts:12` groups provenance into
  `Array<ManifestRequirement>` without `Map` or `Set`.
- `src/manifest_requirements.ts:32` preserves seed effect order and appends
  first-seen fallback groups by checking the output array.
- `src/manifest_requirements.ts:49` adds the small linear lookup/membership
  helpers used by both grouping and ordering.
- `scripts/check-manifest-selfhost.mjs:1` emits
  `src/manifest_requirements.ts` with Topaz and compiles the generated C to an
  object using `cc -O2 -Iruntime -Wall -Wextra -c`.
- `package.json:26` exposes `pnpm run check:manifest-selfhost`, and
  `tests/smoke.sh:144` asserts the self-host gate, target path, and former
  `Map<string, Array<...>>` blocker text.
- `MEMO.md:337` records the 4.5 checkpoint and keeps public manifest UX and
  enforcement as future work.

## Consequences

- **Accepted**: manifest requirements keep the same internal API and stable
  ordering while becoming self-host emittable.
- **Accepted**: a dedicated manifest self-host checker prevents this layer from
  regressing into unsupported container shapes.
- **Rejected**: no public manifest UX, schema, permission policy, runtime
  enforcement, loader behavior, runtime behavior, or container lowering support
  is added.
- **Regression**: `pnpm run build`, `pnpm run check:builtin-effects`,
  `pnpm run check:effect-provenance`, `pnpm run check:effect-report`,
  `pnpm run check:effect-selfhost`,
  `pnpm run check:manifest-requirements`,
  `pnpm run check:manifest-selfhost`, and `pnpm test`.

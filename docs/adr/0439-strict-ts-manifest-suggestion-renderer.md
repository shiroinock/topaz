# 0439 - strict-ts manifest suggestion renderer

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.20

## Context

`doctor` can explain required capabilities, `check` can compare those
requirements to an adjacent `strict-ts.json`, and the release guidance smoke now
proves those public read-only commands on the produced native artifact. v0.2
still needs manifest generation, but `topaz manifest init`, interactive
approval, policy discovery, and file writes carry extra CLI/UX decisions beyond
the first reusable building block.

## Decision

Add a self-hostable internal manifest suggestion renderer that turns inferred
`ManifestRequirement[]` into normalized `strict-ts.json` text for the current
schema only. It preserves the requirement order provided by
`collectManifestRequirements(...)`, drops duplicate capabilities by array scan,
uses two-space indentation, emits a final newline, and relies on the known
builtin capability vocabulary rather than adding string escaping expansion.
Rejected alternatives: adding `topaz manifest init`, prompting, writing
`strict-ts.json`, changing `topaz check` / `doctor` / `explain`, discovering
parent policies, adding `--policy`, extending the schema, or adding permission
enforcement/runtime sandboxing.

## Implementation

- `src/manifest_generate.ts:4` adds `manifestPolicyFromRequirements(...)` as a
  pure requirement-to-policy adapter with duplicate suppression.
- `src/manifest_generate.ts:15` adds `formatManifestPolicyText(...)` for the
  normalized two-space JSON text and empty-capability shape.
- `src/manifest_generate.ts:34` adds the convenience
  `formatManifestPolicyForRequirements(...)` wrapper for future CLI use.
- `scripts/check-manifest-generate.mjs:40` writes pure and effectful fixtures
  under `build/manifest_generate/`, collects requirements, formats policy text,
  and parses it back through `parseManifestPolicyText(...)`.
- `scripts/check-manifest-selfhost.mjs:22` adds `src/manifest_generate.ts` to
  the manifest self-host C-emission/object gate.
- `package.json:30` exposes `pnpm run check:manifest-generate`.
- `tests/smoke.sh:200` wires the generation checker into normal smoke, and
  `tests/smoke.sh:303` requires the new self-host target summary.
- `MEMO.md:353` records the Phase 4.20 checkpoint.

## Consequences

- **Accepted**: future manifest-init style commands can reuse one normalized
  renderer instead of hand-building JSON text.
- **Accepted**: empty requirement graphs render as `{ "capabilities": [] }`
  with the repository-standard multiline formatting and final newline.
- **Accepted**: duplicate provenance for the same effect renders a single
  capability while preserving stable first requirement order.
- **Rejected**: file writes, prompts, policy discovery, permission enforcement,
  runtime sandboxing, schema changes, runtime/prelude/header changes, and
  release workflow changes remain outside this phase.
- **Regression**: `pnpm run check:manifest-generate`, `pnpm run
  check:manifest-selfhost`, and `pnpm test`.

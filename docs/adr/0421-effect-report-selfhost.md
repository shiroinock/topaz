# 0421 - effect report self-host

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.3

## Context

Phase 4.0 / ADR [0418](./0418-builtin-effect-inventory.md), Phase 4.1 /
ADR [0419](./0419-effect-provenance-collector.md), and Phase 4.2 / ADR
[0420](./0420-effect-report-renderer.md) established the internal builtin
effect descriptor, provenance, and report layers. The future single-binary CLI
needs to import these layers, but `src/effect_provenance.ts` still used a
template escape outside the current Topaz parser subset, while
`src/effect_report.ts` depended on `node:path`, `process.cwd()`, and
`Array.prototype.sort()`.

## Decision

Keep the report/provenance API internal and make the existing modules emit
through Topaz itself. Descriptor keys now use a plain ASCII delimiter, report
paths are rendered exactly as the caller/provenance records provide them, and
effect summaries use a fixed builtin-effect vocabulary order with first-seen
fallbacks for unexpected atoms. Rejected alternatives: adding public
doctor/check/explain/manifest commands was rejected as a later UX phase;
expanding stdlib path/process helpers or adding `Array.sort` was rejected
because this phase only removes avoidable host JS dependencies; changing effect
atoms, descriptors, or propagation was rejected because the v0.2 seed
vocabulary remains fixed.

## Implementation

- `src/effect_provenance.ts:385` replaces the `\u0000` descriptor-key separator
  with a plain ASCII separator.
- `src/effect_report.ts:1` removes the `node:path` import and no longer calls
  `path.relative`, `path.isAbsolute`, or `process.cwd()`.
- `src/effect_report.ts:49` defines the summary order for existing builtin
  effect atoms instead of using `Array.prototype.sort()`.
- `src/effect_report.ts:60` appends known effect summaries in fixed order, then
  preserves first-seen order for any unknown atom without adding a new atom.
- `scripts/check-effect-selfhost.mjs:1` emits both target modules with
  `node dist/cli.js --emit-c-only` and compiles the generated C to objects with
  `cc -O2 -Iruntime -Wall -Wextra -c`.
- `package.json:24` exposes `pnpm run check:effect-selfhost`, and
  `tests/smoke.sh:115` asserts the self-host gate and former blocker names.
- `scripts/check-effect-report.mjs:40` updates expectations for exact
  caller/provenance paths.

## Consequences

- **Accepted**: `src/effect_provenance.ts` and `src/effect_report.ts` are now
  covered by a self-host emission gate before public capability UX exists.
- **Accepted**: report details preserve provenance record paths exactly rather
  than normalizing them relative to the current working directory.
- **Rejected**: public CLI commands, manifest schema/parsing/writing, permission
  rejection/enforcement, stdlib path expansion, `Array.sort`, runtime header
  changes, new effect atoms, descriptor vocabulary changes, and function effect
  propagation remain out of scope.
- **Regression**: `pnpm run build`, `pnpm run check:builtin-effects`,
  `pnpm run check:effect-provenance`, `pnpm run check:effect-report`,
  `pnpm run check:effect-selfhost`, and `pnpm test`.

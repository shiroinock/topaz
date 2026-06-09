# 0329 - zero-config package resolution design

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.1

## Context

Phase 3.0 defined capability and effect tracking in
[0328](./0328-capability-effect-tracking-design.md), including the idea that
package and host boundaries may eventually discharge capabilities. The next
ecosystem question is how Topaz should feel at the entrypoint and package
boundary. The desired baseline remains small-program friendly:
`topaz src/main.ts` should work without a required Topaz config file, while
dependencies may become compileable when their full source graph stays inside
the Topaz subset.

This phase records the package/module resolution direction only. It does not
add loader behavior, parser behavior, package.json reading, manifest handling,
stdlib checks, examples, smoke tests, or runtime behavior.

## Decision

Topaz keeps a zero-config CLI path: `topaz <entry.ts>` is the primary entry
experience. Relative imports keep the current static DFS behavior. Bare imports
are future resolution targets, and `node_modules` may be used as a source lookup
location, but that lookup is not a promise of npm runtime compatibility. A bare
dependency is compileable only when the resolved package source and its full
transitive graph are Topaz-compatible.

Package entry selection should be conservative and staged. First prefer an
explicit Topaz package entry when available, such as package.json
`"topaz": "./src/index.ts"` or a later object form. Fall back only to
source-like ESM entries that Topaz can parse, such as `exports`, `module`,
`main`, or `index.ts`, once later ADRs define the exact order and conditions.
Ambiguous, CommonJS-only, built artifact-only, or conditional export cases
should be rejected until separately designed.

`strict-ts.json` remains optional. Its role is policy for multi-entry builds,
target selection, import allowlists, and capability grants, not the prerequisite
that makes small programs compile. Capability and effect tracking from ADR 0328
should inform future package boundary checks, but no enforcement is added here.

Rejected alternatives: requiring `strict-ts.json` for every build was rejected
because it would make the smallest Topaz programs config-first; treating npm
compatibility as a goal was rejected because Topaz intentionally drops JS/TS
semantics outside the subset; using package.json integration as the primary
Topaz package boundary was rejected because package metadata cannot express the
full source graph and capability policy by itself; automatically transpiling
arbitrary npm JavaScript was rejected because it would hide unsupported
semantics; running lifecycle scripts or bundler/plugin hooks was rejected as
outside Topaz; silently shimming Node globals and CommonJS was rejected because
unsupported imports should fail clearly.

## Implementation

- `MEMO.md` records Phase 3.1 as complete and points the roadmap at this ADR.
- Future loader work may add bare source lookup, but should keep relative import
  DFS behavior intact and report unsupported package shapes clearly.
- Future package work may read package metadata only to select source-like
  entries; install, solve, transpile, bundle, and lifecycle behavior remain
  external to Topaz.
- No `src/`, `runtime/`, parser bridge, examples, smoke tests, package files,
  config files, or README behavior is changed by this ADR.

## Consequences

- **Accepted**: zero-config single-entry builds remain the default; bare imports
  can later resolve into Topaz-compatible dependency source graphs; optional
  policy/config can refine larger builds without blocking small ones.
- **Rejected**: CommonJS, dynamic import, ambient Node globals, package side
  effects, unsupported stdlib usage, ungranted capabilities, ambiguous exports,
  and unsupported JS/TS semantics must stop compilation with clear errors.
- **Regression**: no new examples or smoke entries; this phase is design-only
  and relies on the existing `pnpm run build` and `pnpm test` gates.
- **Scope out**: package.json schema details, exact `exports` condition
  ordering, `node_modules` traversal, lockfile handling, package installation,
  bundling, transpilation, stdlib policy, and capability enforcement remain
  follow-up decisions.

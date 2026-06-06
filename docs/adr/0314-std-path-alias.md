# 0314 - std/path alias

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.2b

## Context

[0313](./0313-stdlib-surface-design.md) fixed the public stdlib direction as
`std/fs`, `std/path`, and `std/process`, while keeping existing `node:*`
shortcuts for compiler/self-host compatibility.

`std/path` is the smallest alias to land first because the current `node:path`
surface is pure and already has complete named-import call-site shortcuts for
`dirname`, `resolve`, `basename`, `extname`, and `join`.

## Decision

Accept `std/path` as an alias for exactly the current `node:path` named import
set: `dirname`, `resolve`, `basename`, `extname`, and `join`. Keep `node:path`
accepted unchanged, and do not rewrite `src/*.ts` imports in this phase.

Reuse the existing codegen call-site shortcuts and runtime helpers unchanged.
This keeps the present subset boundary: the imported names are valid only as
recognized call callees, not as first-class values.

Rejected alternatives: adding `std/fs` in the same commit was rejected because
filesystem side effects deserve a separate regression slice; designing
`std/process` now was rejected because the public names are still unsettled;
rewriting compiler imports now was rejected because the first public alias
should prove green before compiler-source churn; namespace/default/value-level
imports remain rejected by the existing stdlib validation path.

## Implementation

- `src/loader.ts:153` documents `std/path` beside `node:path`.
- `src/loader.ts:161` recognizes `std/path` as a stdlib specifier.
- `src/loader.ts:175` reuses the `node:path` named-import allowlist for
  `std/path`, and `src/loader.ts:197` keeps diagnostics based on the actual
  specifier.
- `examples/std_path_basic.ts` covers all five accepted names through
  `std/path`.
- `examples/std_path_unknown_named_import_fail.ts` covers unsupported named
  imports from the new specifier.
- `tests/smoke.sh:445` adds the positive smoke case and `tests/smoke.sh:446`
  adds the failure smoke case.
- `MEMO.md:235` marks `2.2b stdlib aliases` complete.

## Consequences

- **Accepted**: public Topaz code can import path helpers from `std/path`
  without implying Node compatibility.
- **Accepted**: existing `node:path` examples and compiler imports continue to
  work unchanged.
- **Rejected**: unknown named imports such as `relative` fail with diagnostics
  that mention `std/path`.
- **Regression**: `std_path_basic` and `std_path_unknown_named_import_fail`
  bring the smoke suite to 288 cases.
- **Scope out**: `std/fs`, `std/process`, namespace/default imports,
  type-only imports, renamed imports, and first-class imported path helper
  values remain follow-ups or existing rejects.

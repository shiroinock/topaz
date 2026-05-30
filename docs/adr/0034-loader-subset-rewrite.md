# 0034. Loader subset rewrite (6g-2)

- **Status**: Accepted
- **Date**: 2026-05-31
- **Phase**: 1.5-6g-2

## Context

[0033](./0033-loader-topaz-parser-hard-flip.md) moved production loading to
`topaz_parser.parseFile` and `SourceModule[]`, but left `src/loader.ts` written
with TS-ish source forms that Topaz cannot parse or lower. The immediate
self-host blocker was the nested `visit` function inside `loadModuleGraph`,
reported as `src/loader.ts:29:3: expected expression`. The rewrite needed to
preserve 6g-1 DFS ordering, duplicate suppression, cycle diagnostics,
relative/stdlib import validation, and `.js` specifier resolution.

## Decision

Use an explicit `LoaderState` class with `loaded`, `order`, and `visiting`
fields plus a `visit(absPath, importedFrom)` method. Keep optional internal
values as `undefined` so narrowing follows the existing subset path, and replace
the stdlib `ReadonlyMap<string, ReadonlySet<string>>` constant with small
comparison helpers and stable diagnostic strings.

Rejected alternatives: adding nested-function support was rejected because this
phase is a source-shape rewrite, not a language expansion; keeping `class
extends Error` for loader diagnostics was rejected because Topaz's class parser
does not accept `extends`; a stdlib `Map` literal was rejected because it keeps
unsupported container initialization in the self-host path.

## Implementation

- `src/loader.ts:23` now constructs `LoaderState`, calls `visit`, and returns
  the same topological file order plus a copied loaded-path set.
- `src/loader.ts:30` moves DFS state and recursive loading into a class method,
  preserving duplicate-load suppression, visiting-set cycle checks, stdlib
  skipping, and relative import traversal.
- `src/loader.ts:88` changes loader diagnostics into a subset-safe
  `LoaderError` class carrying `message`; `loaderErrorAt` keeps the existing
  `file:line:col` text.
- `src/loader.ts:158` replaces the stdlib allowlist map with
  `isStdlibSpecifier`, `isAllowedStdlibImport`, and `allowedStdlibNames`.
- `src/loader.ts:245` returns each resolved specifier path directly so the
  function avoids uninitialized `let`.
- `src/cli.ts:10` and `src/cli.ts:140` catch `LoaderError` before generic
  `Error`, preserving CLI diagnostic formatting after removing `extends Error`.

## Consequences

- **Accepted**: `src/loader.ts` emits C through the current production frontend,
  and the generated C compiles to an object.
- **Rejected**: stdlib unknown named imports, namespace imports, type-only
  imports/specifiers, import renames, and non-relative non-stdlib specifiers
  retain their prior diagnostic substrings.
- **Regression**: no new examples were needed; existing loader coverage
  (`module_basic`, `module_side_effect`, `module_cycle`, stdlib import fail
  cases, and import type fail cases) still passes. Full smoke remains 272
  invocations.
- **Scope out**: `src/cli.ts` still stops at the planned 6h `node:util`
  `parseArgs` blocker.

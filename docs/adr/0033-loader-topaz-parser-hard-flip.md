# 0033. Loader Topaz parser hard flip (6g-1)

- Status: Accepted
- Date: 2026-05-31

## Context

6e-4 left the normal CLI compile path as `loader -> tsc SourceFile ->
convertFromTsc -> codegen`, even though codegen already consumed Topaz
`SourceModule[]`. 6g-1 flips the production frontend before the later loader
self-host rewrite: the loader must parse with the native Topaz parser while
preserving the existing DFS policy and import diagnostics. The immediate
self-host blocker for `src/cli.ts` should remain the planned `node:util`
specifier, not parser syntax around `import { ..., type T }`.

## Decision

Use a hard flip: `loadModuleGraph` returns `SourceModule[]`, `cli.ts` passes
those modules directly to `codegen`, and normal compilation no longer calls the
tsc bridge. To keep loader diagnostics stable, `ImportDecl` now preserves the
import forms the loader rejects: default, namespace, rename, type-only clause,
type-only specifier, side-effect-only import, module specifier span, and binding
spans. The tsc converter remains only as parser-check oracle support and now
preserves the same import shape instead of rejecting those forms early.

Rejected alternatives: a shadow path was rejected because production would stay
on tsc for another commit; a flag was rejected because it creates temporary CLI
surface; letting the Topaz parser reject unsupported imports was rejected
because loader-level error messages and `src/cli.ts` parsing need the full
import declaration shape.

## Implementation

- `src/ast.ts:623`: extend `ImportSpecifier` / `ImportDecl` with local names,
  type-only flags, default / namespace names, and module-path spans.
- `src/topaz_parser.ts:229`: parse side-effect, named, renamed, type-only,
  namespace, and default import declarations into the preserved import AST.
- `src/convert_from_tsc.ts:206`: mirror the same import AST from
  `ts.ImportDeclaration` for parser oracle comparisons.
- `src/loader.ts:23`: parse files with `topaz_parser.parseFile`, walk
  `SourceModule.items`, preserve DFS / cycle detection, and render loader
  errors from `SourceModule.lineStarts`.
- `src/cli.ts:76`: pass `graph.files` directly to `codegen`; `src/cli.ts:124`
  also formats parser / lexer object throws as `file:line:col`.
- `src/topaz_parser.ts:684`, `src/topaz_parser.ts:709`, and
  `src/topaz_parser.ts:1606`: keep existing unsupported-shape fail regressions
  on their prior message substrings now that the Topaz parser is on the hot path.

## Consequences

- **Accepted**: normal CLI compiles use native Topaz parser modules; relative
  side-effect imports participate in DFS; `src/ast.ts`, `src/lexer.ts`, and
  `src/topaz_parser.ts` emit C through the flipped path.
- **Rejected**: stdlib namespace imports, unknown stdlib named imports, import
  renames, type-only imports / specifiers, and non-relative non-stdlib
  specifiers retain loader-style diagnostics.
- **Regression**: `module_side_effect` covers side-effect relative import;
  `import_type_{clause,specifier}_fail` cover type-only import preservation.
  Full `npm test` passes with 272 smoke invocations.
- **Scope out**: loader itself is not rewritten into the Topaz subset here;
  optional generated-C comparison against `08.before` was not needed for the
  hard gate because `npm test` and self-host emit checks were green.

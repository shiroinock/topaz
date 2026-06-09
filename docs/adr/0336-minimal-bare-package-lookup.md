# 0336 - minimal bare package lookup

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.8

## Context

[0329](./0329-zero-config-package-resolution-design.md) kept zero-config
`topaz <entry.ts>` as the primary experience and left `node_modules` source
lookup as a future target, without promising npm runtime compatibility. Phase 3
now has public `std/fs`, `std/path`, and `std/process`, so package source lookup
is the last implementation surface before the MVP UX gate. The compiler source
is still constrained by the self-host subset, so package metadata parsing must
stay small, explicit, and friendly to the native Topaz parser/codegen path.

## Decision

Add bare package source lookup only for package roots: `pkg` and `@scope/pkg`.
Relative imports and builtin imports keep their existing behavior. Bare lookup
walks upward from the importing file directory and checks
`node_modules/<package>`. A package is accepted only when package.json has a
top-level string `"topaz": "./entry.ts"` or `"./entry.js"` source entry, or when
the package root has `index.ts`. The `.js` entry form maps to `.ts` like
relative imports.

Rejected alternatives: package subpaths were rejected because their entry
matrix needs a separate design; `exports`, `module`, `main`, `types`, browser
fields, CommonJS, conditional exports, install/lockfile handling, and lifecycle
scripts were rejected as npm compatibility rather than source lookup; `JSON.parse`
was rejected because loader metadata extraction must remain self-host-friendly.

## Implementation

- `src/loader.ts:194` preserves relative import resolution and sends only
  non-relative, non-builtin specifiers to package lookup.
- `src/loader.ts:238` walks ancestor `node_modules` directories and reports a
  clear missing-package diagnostic.
- `src/loader.ts:258` accepts only `pkg` and `@scope/pkg`, rejecting package
  subpaths, absolute paths, empty segments, `.` segments, and `..` segments.
- `src/loader.ts:301` selects package.json `"topaz"` or root `index.ts`, and
  reports packages with only `main` / `exports` as unsupported shapes.
- `src/loader.ts:368` validates `"topaz"` entries as package-relative
  `./*.ts` / `./*.js` paths, rejecting escape paths, `.cjs`, `.mjs`, `.json`,
  `.d.ts`, extensionless paths, and directory entries.
- `src/loader.ts:382` adds a tiny top-level `"topaz"` string extractor instead
  of full package.json semantics.
- `examples/fixtures/package_lookup/` contains positive and negative package
  fixtures, including a nested app and scoped package.
- `tests/smoke.sh:298` adds two positive module cases and five failure cases.

## Consequences

- **Accepted**: zero-config user programs can import simple Topaz-compatible
  packages from `node_modules` and the loaded package can use existing relative
  imports in the same single translation-unit graph.
- **Accepted**: unsupported package shapes fail at the package boundary with
  diagnostics that name the unsupported specifier or entry.
- **Rejected**: subpath imports, CommonJS/build-artifact entries, conditional
  exports, `main` / `exports` fallback, package installation, lifecycle scripts,
  manifest/capability enforcement, doctor/check/explain, and Node emulation
  remain outside this phase.
- **Regression**: `package_lookup_basic`, `package_lookup_ancestor`,
  `package_lookup_missing`, `package_lookup_subpath`,
  `package_lookup_topaz_escape`, `package_lookup_topaz_cjs`, and
  `package_lookup_main_exports_only` cover the new surface.

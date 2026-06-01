# 0036. Codegen source-shape cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0035](./0035-cli-subset-argv-parser.md) removed the `node:util.parseArgs`
blocker from `src/cli.ts`. The next full graph self-host probe
`node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe` entered
`src/codegen.ts` and stopped on TypeScript-only source shapes, starting with a
`readonly` array type in `TopazType`. This step keeps the language/runtime
surface unchanged and only rewrites production source toward the existing Topaz
subset.

## Decision

Normalize the codegen/CLI sources away from TypeScript conveniences that are
not part of the Topaz subset: `readonly` type syntax, `Extract<>` casts, local
generic helper methods, object destructuring, local type aliases, regex
literals, import type syntax, import renaming, `null` sentinels, and `as`
casts. The replacement style is explicit guards, small named aliases, concrete
helper variants, and ordinary field reads.

Rejected alternatives: teaching the parser/codegen these TypeScript source
forms would broaden the language for compiler-internal convenience rather than
user-visible need; leaving `CodegenError` as `extends Error` would require class
inheritance/runtime behavior that the current subset intentionally does not
model; adding `import type` support now would conflict with the existing import
type fail regressions and is not needed for stage2 code shape.

## Implementation

- `src/codegen.ts:1` changes the AST import to a regular named import so the
  Topaz loader no longer sees `import type` in production code.
- `src/codegen.ts:87` introduces `DunionType`, `FnType`, and `IterType`; array
  and function annotations now use `Array<T>` and explicit aliases instead of
  `readonly`/`Extract<>` forms.
- `src/codegen.ts:220` rewrites `typeEq` to narrow by `kind` guards rather than
  `as Extract<...>` casts.
- `src/codegen.ts:449`, `src/codegen.ts:600`, and `src/codegen.ts:661` replace
  regex/test-only, `extends Error`, and the `declare`-named method with subset
  forms.
- `src/codegen.ts:3057` and `src/codegen.ts:6076` split generic helpers into
  concrete typed helpers (`withSf*`, `underNarrowing*`).
- `src/codegen.ts:5496` moves the switch grouping alias out of the method body,
  and `src/codegen.ts:9375` removes the remaining `as Array<SourceModule>`
  entry cast.
- `src/cli.ts:7` imports `CodegenError` for subset-safe error reporting, removes
  the `type Token` import specifier, and uses `parseFile` without import rename.

## Consequences

- **Accepted**: source-only cleanup that preserves the current generated C and
  CLI behavior.
- **Rejected**: accepting these TypeScript-only forms as new user language
  features during this step.
- **Regression**: no new examples were added because there is no observable
  language behavior change; full `pnpm test` passes.
- **Next blocker**: the old `readonly` source-shape blocker is gone. The full
  graph probe now advances to module-shape validation and stops at
  `src/codegen.ts:46:1: non-root module may only contain import / class /
  interface / function / type alias declarations or hoistable scalar-literal
  const`, caused by top-level mutable codegen state such as `g_currentModule`.

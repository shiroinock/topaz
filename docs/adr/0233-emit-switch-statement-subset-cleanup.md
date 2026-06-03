# 0233. emit switch statement subset cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0232](./0232-for-of-body-statement-list-cleanup.md) advanced the full-graph
self-host probe to `src/codegen.ts:6683:5`, where `emitSwitchStatement` used
TypeScript-permitted uninitialized `T | undefined` locals. The same method also
had optional truthy checks, chained discriminated-union property access,
non-null assertions on indexed reads, and local `try/finally` restore blocks
that are outside the current Topaz self-host subset.

## Decision

Keep the accepted switch subset and C lowering unchanged, including
`do { ... } while (0)`, no implicit fall-through, `continue` rejection through
the synthetic switch loop context, and dunion discriminator narrowing. Rewrite
only `emitSwitchStatement` so its implementation uses explicit optional
initialization/comparison, stepwise narrowing, minimal diagnostic anchors, and
normal-path scope / loop-context restoration.

Rejected alternatives: adding switch fall-through was rejected as a language
expansion; removing dunion narrowing was rejected because it would reduce the
frontend subset; adding runtime helpers was rejected because this is a codegen
source cleanup; broadening parser or AST shapes was rejected as out of scope.

## Implementation

- `src/codegen.ts:6683-6711` initializes optional locals, narrows
  `switch (<ident>.<disc>)` step by step, and uses a minimal `{ pos }` anchor
  for the non-last `default` diagnostic.
- `src/codegen.ts:6714-6751` keeps group construction and fall-through
  rejection semantics, but avoids repeated optional property reads, untyped
  empty-array reassignment, and non-null assertions for the last case statement.
- `src/codegen.ts:6760-6790` preserves dunion case narrowing while replacing
  `Array<string | undefined>` and a `string | undefined` accumulator with
  boolean / string parallel storage.
- `src/codegen.ts:6801-6851` removes method-local `try/finally` restoration and
  restores switch loop context and method scope on the normal successful path
  after all case/default bodies are emitted.

## Consequences

- **Accepted**: existing switch forms and dunion discriminator switches keep the
  same generated C shape and narrowing behavior.
- **Rejected**: no new switch syntax is accepted, no fall-through support is
  added, and `continue` inside switch remains unsupported.
- **Regression**: no new example was added because behavior is unchanged.
  `pnpm test` passes with the existing 280 smoke cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:6683:5` blocker and now stops at
  `src/codegen.ts:6865:30`:

  ```text
  type mismatch: expected topaz_class_anon_88, got topaz_class_anon_80
  ```

# 0193. Set iterable constructor

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0192](./0192-optional-lookup-presence-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:4395:20`, where `collectCaptures` copies a
`Set<string>` with `new Set<string>(paramNames)`. [0184](./0184-set-constructor-iterable-cleanup.md)
previously rewrote same-shape compiler-source sites to avoid iterable Set
constructors, but the construct is a normal TypeScript container idiom and
Topaz already has Set storage, Set.add, Set for-of, and Iterator lowering.

## Decision

Add narrowly scoped `new Set<T>(source)` support when `source` yields exactly
`T` from `Array<T>`, `Set<T>`, or `Iterator<T>`. The constructor lowers to a
statement-expression that allocates a fresh Set, snapshots the source once, and
copies each yielded element through the existing `topaz_set_<T>_add` helper.

Rejected alternatives: rewriting `collectCaptures` would shrink compiler-source
coverage instead of improving the language subset; broad constructor inference
for unannotated `new Set(source)` is deferred because explicit `<T>` and
contextual `Set<T>` cover this blocker; Map iterable constructors remain
unsupported because pair / tuple representation is a separate design problem.

## Implementation

- `src/codegen.ts:9531` keeps `new Map(iterable)` rejected in inference, while
  `src/codegen.ts:9545` routes Set constructor typing through the shared Set
  resolver.
- `src/codegen.ts:6917` keeps Map constructor arguments rejected at emission,
  and `src/codegen.ts:6950` sends Set constructors to zero-arg allocation or
  iterable copy lowering.
- `src/codegen.ts:6996` validates that the Set source is Array / Set /
  Iterator and that the yielded element type exactly matches `T`.
- `src/codegen.ts:7021` resolves explicit `<T>` or contextual `Set<T>` and
  rejects more than one Set constructor argument.
- `src/codegen.ts:7060` emits evaluation-once Array, Set, and Iterator copy
  loops that call `topaz_set_<T>_add`.
- `tests/smoke.sh:168` adds the positive regression, and
  `tests/smoke.sh:246` adds the mismatch / non-iterable / arity / Map-fail
  regressions.

## Consequences

- **Accepted**: `new Set<T>(array)`, `new Set<T>(set)`, and
  `new Set<T>(iter)` copy through existing Set equality and duplicate rules.
- **Accepted**: contextual `const s: Set<T> = new Set(source)` works without
  adding broad uncontextual constructor inference.
- **Rejected**: non-iterable Set sources, Set source element mismatches, more
  than one Set constructor argument, and all Map constructor arguments.
- **Regression**: `set_constructor_iterable`,
  `set_constructor_mismatch_fail`, `set_constructor_non_iterable_fail`,
  `set_constructor_too_many_fail`, and `map_constructor_iterable_fail` bring
  the smoke suite to 282 checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4395:20` Set constructor blocker and
  now stops at `src/codegen.ts:4404:7` because nested fn types in arrow
  parameters are unsupported.

# 0184. Set constructor iterable cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0183](./0183-loop-context-pop-local-narrowing.md) moved the full graph
self-host probe to `src/codegen.ts:4249:33`, where arrow capture setup used
`new Set(params.map((p) => p.name))`. Topaz intentionally supports bare
`new Set()` but not iterable constructor arguments, and `src/codegen.ts` had two
additional same-root `new Set(iterable)` sites for destructuring method-name
collection.

## Decision

Replace compiler-source iterable Set constructors with bare `new Set<string>()`
construction followed by explicit `.add(...)` loops. Arrow capture exclusion now
adds each parameter name before calling `collectCaptures`, and destructuring
receiver setup adds class / interface method names from `.keys()` iterators.

Rejected alternatives: adding general Set iterable constructor support would be
broader language/runtime work; fixing only the first arrow-capture site would
leave the same unsupported source shape behind; changing capture or method
lookup semantics would add risk without helping the self-host subset cleanup.

## Implementation

- `src/codegen.ts:4248` creates `excludedNames` as a bare `Set<string>`.
- `src/codegen.ts:4250` populates `excludedNames` from arrow `params` with an
  explicit loop before `collectCaptures`.
- `src/codegen.ts:5477` builds class receiver `methods` with bare Set
  construction plus `.add(...)` over `cls.methods.keys()`.
- `src/codegen.ts:5489` applies the same method-name collection shape to
  interface receivers.

## Consequences

- **Accepted**: arrow capture exclusion still includes every parameter name.
- **Accepted**: object destructuring still rejects method bindings for class and
  interface receivers by consulting complete method-name sets.
- **Rejected**: `new Set(iterable)` remains unsupported; this ADR does not add a
  constructor-lowering rule.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4249:33` Set constructor blocker and
  now stops at `src/codegen.ts:4259:7` because `for-of` over `.entries()` in the
  compiler source requires a destructuring binding shape.

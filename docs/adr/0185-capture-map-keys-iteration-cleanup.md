# 0185. Capture map keys iteration cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0184](./0184-set-constructor-iterable-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:4259:7`, where arrow capture env typedef
generation iterated `captures.entries()` into a single value and then indexed
the pair. Topaz intentionally requires destructuring bindings for `.entries()`
for-of loops, and the arrow env initializer used the same source shape a few
lines later.

## Decision

Rewrite both arrow capture map iterations to iterate `captures.keys()` and read
the capture type with a checked `captures.get(name)`. If the map lookup is
missing, treat it as an internal codegen invariant failure with
`throwInternalCodegenError`; otherwise use the narrowed capture type for the env
field and initializer emission.

Rejected alternatives: adding value-binding support for `.entries()` would
broaden the language and contradict existing fail coverage; rewriting to
destructuring `for (const [name, t] of captures.entries())` would work but keep
unnecessary pair shapes in compiler internals; patching only the typedef loop
would leave the initializer loop as the next same-root blocker.

## Implementation

- `src/codegen.ts:4259` now iterates capture names with `captures.keys()` for
  env typedef field generation.
- `src/codegen.ts:4260` checks the corresponding `captures.get(n)` result and
  emits an internal missing-capture error for impossible map drift.
- `src/codegen.ts:4336` applies the same keys-plus-checked-get shape to env
  initializer generation.
- `src/codegen.ts:4345` still routes capture reads through
  `emitCapturedIdentifier`, preserving the existing outer-scope read semantics.

## Consequences

- **Accepted**: env typedef field generation still includes every captured
  binding.
- **Accepted**: env initializer generation still emits every captured binding
  with the same expression as before.
- **Rejected**: `.entries()` for-of still requires a destructuring binding; this
  ADR does not change the language rule.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4259:7` `.entries()` value-binding
  blocker and now stops at `src/codegen.ts:4318:15` because `finally` remains
  unsupported.

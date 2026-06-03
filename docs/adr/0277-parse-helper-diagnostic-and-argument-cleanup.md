# 0277 - parse helper diagnostic and argument cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0276](./0276-node-path-diagnostic-and-argument-cleanup.md) advanced the
self-host probe from the `node:path` helper cluster into the global parse helper
band. The next blocker was `src/codegen.ts:9114:9`, where the `parseInt` arity
diagnostic passed the full `CallExpr` object to `CodegenError`. The same helper
band still had post-arity `expr.args[n]!` reads in both `parseInt` and
`parseFloat`.

## Decision

Preserve the current global parse helper surface: `parseInt(s, radix)` requires
an explicit number radix, `parseFloat(s)` accepts one string, and both helpers
remain call-site shortcuts rather than value-level globals. Diagnostics in this
helper band now pass minimal `{ pos: ... }` anchors, and check helpers return
checked argument locals for emit-side lowering instead of re-indexing
`expr.args[n]!` after validation. Rejected alternatives: adding one-argument
auto-radix `parseInt` was rejected because the existing explicit-radix subset is
intentional; adding `Number()`, `Number.parseInt`, `Number.parseFloat`, or a
`Math` namespace was rejected because those are new helper surfaces; changing
runtime parsing or NaN behavior was rejected because this phase is only a
self-hostability cleanup.

## Implementation

- `src/codegen.ts:107`: added a checked-argument result type for
  `parseInt(s, radix)` without optional fields.
- `src/codegen.ts:9116`: `checkParseIntArgs` now anchors arity, first-argument,
  and radix diagnostics on `{ pos }` and returns checked `s` / `radix`
  expressions.
- `src/codegen.ts:9142`: `emitParseInt` emits from the checked locals instead of
  re-indexing call arguments after validation.
- `src/codegen.ts:9149`: `checkParseFloatArgs` now anchors arity and string
  argument diagnostics on `{ pos }` and returns the checked string expression.
- `src/codegen.ts:9167`: `emitParseFloat` emits from the checked local instead
  of re-indexing the call argument after validation.

## Consequences

- **Accepted**: existing valid `parse_number` behavior is unchanged.
- **Rejected**: wrong arity for `parseInt` / `parseFloat`, non-string first
  arguments, non-number `parseInt` radix, and bare `parseInt` value use remain
  rejected.
- **Regression**: no new examples were added because behavior is unchanged and
  the existing `parse_number`, `parse_int_*`, and `parse_float_*` smoke cases
  preserve the current parse helper surface. `tests/smoke.sh` has 280 primary
  compile/run/fail entries, or 296 `run_*` entries including warning-free
  variants.
- **Self-host**: the old `src/codegen.ts:9114:9` blocker is removed. The next
  probe blocker is `src/codegen.ts:9256:32`, which is outside this parse helper
  cleanup.

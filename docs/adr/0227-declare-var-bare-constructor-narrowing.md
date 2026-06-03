# 0227. declareVar bare constructor narrowing

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0226](./0226-declare-var-initialized-result-cleanup.md) moved the full-graph
self-host probe to `src/codegen.ts:6141:10`, where the inferred-variable branch
of `declareVar` checked for unannotated bare `new Map()` / `new Set()` with a
single chained boolean expression. That expression narrowed `init` to a
`new_expr`, but then read `init.callee.name` before explicitly narrowing the
nested `init.callee` discriminated union to an identifier.

The existing source-level behavior was already the desired behavior:
unannotated bare Map/Set constructors should keep the same diagnostic, while
annotated or explicitly generic constructors should continue through the
existing inference and emission paths.

## Decision

Rewrite only the bare Map/Set constructor guard in `declareVar` to use nested
expression narrowing: first check `init.kind === "new_expr"`, then bind
`const callee = init.callee`, then check `callee.kind === "ident"` before
reading `callee.name`. The diagnostic uses a minimal `{ pos: init.pos }`
anchor so the self-host source does not need to pass the full expression union
as the error site.

Rejected alternatives: broadening discriminated-union property access was
rejected as language semantics scope; adding constructor type-argument
inference was rejected as feature scope; moving or rewriting the variable
inference branches was rejected because the existing successful C output and
diagnostics should remain unchanged.

## Implementation

- `src/codegen.ts:6138-6149` replaces the chained `init.callee.name` guard with
  explicit `new_expr` and `ident` narrowing before checking `Map` / `Set` and
  the empty type-argument list.
- `src/codegen.ts:6142-6146` keeps the original bare constructor diagnostic
  text and source position through a minimal `initAnchor`.
- `src/codegen.ts:6150-6163` is intentionally unchanged: inferred initializers
  still call `inferType(init)`, reject void storage, emit array literals through
  `emitArrayLiteral`, emit new expressions through `emitNewExpression`, and
  fall back to `emitExpression`.

## Consequences

- **Accepted**: unannotated bare `new Map()` / `new Set()` still reject with
  the existing message and position.
- **Accepted**: other inferred variables and successful constructor emissions
  keep their existing paths.
- **Rejected**: no new constructor inference, discriminated-union access rule,
  variable inference, or generated-C behavior is introduced.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing Map/Set constructor fail cases, variable declaration
  cases, and the full self-host probe. `pnpm test` passes with the existing 277
  smoke cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:6141:10` blocker and now stops at
  `src/codegen.ts:6204:32`: `type mismatch: expected topaz_class_anon_36, got
  topaz_dunion_anon_33_or_anon_34_or_anon_35_or_anon_36_or_anon_37_or_anon_38_or_anon_39_or_anon_40_or_anon_43_or_anon_45_or_anon_46_or_anon_48_or_anon_49_or_anon_79_or_anon_80_or_anon_81`.

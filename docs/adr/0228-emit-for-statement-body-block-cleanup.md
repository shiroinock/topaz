# 0228. emitForStatement body block cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0227](./0227-declare-var-bare-constructor-narrowing.md) moved the full-graph
self-host probe to `src/codegen.ts:6204:32`, where `emitForStatement` checked
`stmt.body.kind === "block_stmt"` and then passed `stmt.body` to
`emitBlock(BlockStmt, ...)`. The runtime behavior was already correct, but the
self-host subset does not narrow a discriminated-union property access deeply
enough through that branch for the `emitBlock` parameter.

`emitStatementAsBlock` already exists for exactly this statement-body shape:
it wraps block and non-block statements in a fresh body scope and emits the same
block text used by `if`, `while`, and `do-while` lowering.

## Decision

Replace the manual block/non-block body branch in `emitForStatement` with
`emitStatementAsBlock(stmt.body, indent)` while the loop context is live. The
outer for-init scope is still restored after body emission, and the generated
`for (${init}; ${cond}; ${update}) ...` formatting is kept unchanged.

Rejected alternatives: broadening discriminated-union property narrowing was
rejected as language-semantics scope; changing `emitBlock` to accept a wider
statement union was rejected because its parameter contract is intentionally
block-specific; changing for-of lowering was rejected because this phase only
targets ordinary `for` statement body emission.

## Implementation

- `src/codegen.ts:6200-6204` now keeps `loopCtx` active while
  `emitStatementAsBlock(stmt.body, indent)` emits the body, then restores
  `loopCtx` and the outer for-init scope before returning the existing
  formatted `for` string.
- `src/codegen.ts:5770-5792` continues to own block and non-block statement
  wrapping, including the fresh body scope for both cases.
- The optional init, condition, and update lowering in
  `src/codegen.ts:6170-6198` is intentionally unchanged.

## Consequences

- **Accepted**: block and non-block `for` bodies still emit with the existing
  fresh body scope.
- **Accepted**: `break` / `continue` checks still see the loop context during
  body emission.
- **Rejected**: no new discriminated-union narrowing rule, `emitBlock`
  contract, loop semantics, generated-C formatting, or for-of behavior is
  introduced.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing `for`, `break` / `continue`, and full self-host probe
  coverage. `pnpm test` passes with the existing 277 smoke cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:6204:32` blocker and now stops at
  `src/codegen.ts:6252:8`:

  ```text
  cannot access '.optional' on discriminated union topaz_dunion_anon_12_or_anon_15_or_anon_16_or_anon_17_or_anon_18_or_anon_19_or_anon_20_or_anon_21_or_anon_22_or_anon_23_or_anon_24_or_anon_25_or_anon_26_or_anon_27_or_anon_30_or_anon_31_or_anon_32_or_anon_70_or_anon_71_or_anon_72_or_anon_73_or_anon_74_or_anon_75_or_anon_76_or_anon_77_or_anon_8 - narrow it first with `switch (x.kind)`
  ```

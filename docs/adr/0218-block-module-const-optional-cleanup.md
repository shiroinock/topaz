# 0218. block/module const optional cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0217](./0217-check-try-body-no-escape-visitor-cleanup.md) moved the
full-graph self-host probe to `src/codegen.ts:5778:11`, where
`emitStatementAsBlock` used an optional narrowing payload as a truthy
condition. The adjacent module-const hoist helpers still carried the same
compiler-source subset hazards: optional/object truthiness and non-null
assertions around scalar literal initializers.

This cleanup is source normalization only. Topaz should still reject optional
object truthiness and should not broaden module-const hoisting or non-null
assertion support to make the compiler source compile.

## Decision

Normalize the block wrapper and module-const hoist cluster to explicit
`undefined` checks with initialized locals. `emitStatementAsBlock` copies the
optional narrowing payload before branching, and the module-const helpers bind
initializer, scalar literal, and annotation locals only after presence checks.

Rejected alternatives: adding optional object truthiness was rejected because it
would change Topaz language semantics for a compiler-source cleanup. Broadening
the hoistable initializer set was rejected because existing scalar literal
hoisting is sufficient. Sweeping unrelated optional checks or supporting new
non-null assertion cases was rejected as outside this phase's ownership.

## Implementation

- `src/codegen.ts:5770-5792` replaces both `if (narrow)` checks in
  `emitStatementAsBlock` with a copied optional local and `!== undefined`
  checks before calling `scope.narrow`.
- `src/codegen.ts:5804-5819` makes `canHoistModuleConst` bind `stmt.init` and
  `stmt.type` through explicit presence checks before calling
  `tryScalarLiteralInit` or `typeFromAnnotation`.
- `src/codegen.ts:5835-5850` removes the `d.init!` and scalar literal `!`
  assumptions from `tryHoistModuleConst`, reusing the same explicit local
  pattern before registering the hoisted binding.

## Consequences

- **Accepted**: statement block narrowing behavior is unchanged.
- **Accepted**: module const hoisting still accepts the same scalar literal
  forms and leaves non-hoistable declarations on the regular emission path.
- **Rejected**: optional object truthiness, new hoistable initializer forms,
  module global initialization changes, and broader non-null assertion support
  remain out of scope.
- **Regression**: no new example was added because this is compiler-source
  cleanup; existing module const hoist, module global, statement narrowing, and
  the smoke suite still pass. `tests/smoke.sh` still contains 277 cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5778:11` optional truthiness blocker
  and now stops at `src/codegen.ts:5816:60`: `type mismatch: expected
  topaz_class_anon_88, got topaz_class_anon_34`.

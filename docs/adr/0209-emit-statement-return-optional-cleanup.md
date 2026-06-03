# 0209. emitStatement return optional cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0208](./0208-extract-discriminator-narrowing-subset-cleanup.md) moved the
full graph self-host probe into `emitStatement`'s `return_stmt` branch, where
`this.currentReturnType` was checked with optional truthiness and `stmt.value`
was checked with expression truthiness. Topaz conditions are strict boolean,
and optional state must be copied to locals and narrowed through explicit
`=== undefined` checks before later use.

## Decision

Normalize only the `return_stmt` branch in `emitStatement`. The branch now
copies `this.currentReturnType` and `stmt.value` into optional locals, checks
each one explicitly against `undefined`, and uses narrowed locals for
`typeIdent`, `emitWithExpected`, and `cTypeName` while preserving all return
lowering behavior.

Rejected alternatives: adding truthy/falsy optional narrowing was rejected
because Topaz conditions remain strict boolean. Changing return diagnostics,
function/method return context ownership, or the `liveTryFrames` lowering was
rejected because this phase is source cleanup for one self-host blocker.
Sweeping adjacent statement branches was rejected as outside this phase.

## Implementation

- `src/codegen.ts:5351-5356` copies `this.currentReturnType` and `stmt.value`
  into local optional values and narrows the return type with an explicit
  `currentReturnTypeMaybe === undefined` check.
- `src/codegen.ts:5357-5376` replaces the bare-return and value-return checks
  with the narrowed `currentReturnType` and `returnValue` locals.
- `src/codegen.ts:5377-5384` keeps the existing `liveTryFrames` value-return
  lowering unchanged and uses the narrowed return type for the temporary C
  type.

## Consequences

- **Accepted**: existing bare-return, value-return, void-return, and
  try-return behavior is unchanged.
- **Rejected**: no optional truthiness, new return semantics, or broader
  statement cleanup is introduced.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by existing return, void, try-return, and full smoke cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5351:12` optional truthiness blocker
  and now stops at `src/codegen.ts:5353:32` with
  `type mismatch: expected topaz_class_anon_88, got topaz_class_anon_48` while
  constructing the outside-function `CodegenError`.

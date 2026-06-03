# 0212. emitStatement if else optional cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

Phase 178 added `String.prototype.trimStart` and moved the full-graph
self-host probe to `src/codegen.ts:5412:11`, where the `if_stmt` branch in
`emitStatement` used `stmt.elseBranch` directly as a condition. Topaz keeps
conditions strictly `boolean`, so optional statement presence must be checked
explicitly instead of relying on object truthiness. [ADR 0206](./0206-carry-narrowing-strict-optional-cleanup.md)
already applied the same optional-presence pattern to carry narrowing.

## Decision

Normalize only the `emitStatement` `if_stmt` else emission path by copying
`stmt.elseBranch` into a local optional and checking it with
`!== undefined` before passing the narrowed statement to
`emitStatementAsBlock`.

Rejected alternatives: adding optional truthiness was rejected because it would
weaken the strict boolean subset. Changing `extractNarrowing` or
`emitStatementAsBlock` was rejected because the existing then/else narrowing
and formatting behavior already match the desired output. Sweeping while,
do-while, or unrelated statement branches was rejected to keep this self-host
step limited to the observed blocker.

## Implementation

- `src/codegen.ts:5412-5415` introduces `elseBranchMaybe`, checks
  `elseBranchMaybe !== undefined`, and emits the else block through the
  narrowed local while preserving the existing ` else ${...trimStart()}`
  formatting.

## Consequences

- **Accepted**: `if` statements with and without `else` keep the same emitted
  C text, and existing then/else narrowing stays unchanged.
- **Rejected**: optional object truthiness and broader statement-emission
  cleanup remain out of scope.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by existing if, compound-condition, and carry-narrowing smoke
  cases plus the full self-host probe; `pnpm test` still passes the existing
  289 checks.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5412:11` optional-truthiness blocker
  and now stops at `src/codegen.ts:5424:7`: `variable declaration must have an
  initializer`.

# 0232. for-of body statement list cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0231](./0231-for-of-array-path-subset-cleanup.md) moved the full-graph
self-host probe to `src/codegen.ts:6471:9`, where Array for-of body emission
used a ternary over `stmt.body.kind` and then read `.stmts`. Topaz only narrows
discriminated unions through `switch (x.kind)`, so the compiler source needed a
for-of-local cleanup without changing accepted for-of forms.

The adjacent Map / Set hash lowering and Iterator lowering used the same body
statement-list construction and still had compiler-source `try/finally`
restoration blocks. Prior restore cleanup ADRs keep state restoration on the
normal successful path while `finally` lowering remains unsupported.

## Decision

Share one switch-narrowed for-of body emission helper across Array, hash, and
iterator lowerings. Keep `applyCarryNarrowing` immediately after each emitted
body statement, keep loop context live while body statements are emitted, and
normalize hash / iterator restoration to the same normal-path pop sequence as
the Array path.

Rejected alternatives: broadening discriminated-union narrowing for ternaries
was rejected as language-semantics work; adding `finally` support was rejected
as out of scope; changing hash-table or iterator C loop shape was rejected
because this phase is compiler-source cleanup only.

## Implementation

- `src/codegen.ts:6231-6254` adds for-of body helpers; the public helper switches
  on `body.kind` before the block helper reads `.stmts`.
- `src/codegen.ts:6495`, `src/codegen.ts:6576`, and `src/codegen.ts:6652`
  route Array, hash, and iterator body emission through that shared helper.
- `src/codegen.ts:6542-6556` and `src/codegen.ts:6625-6635` make binding
  annotation checks explicit and use minimal `{ pos }` anchors after local
  narrowing.
- `src/codegen.ts:6565-6606` and `src/codegen.ts:6646-6668` remove hash and
  iterator local `try/finally` restoration, restoring loop and scope state only
  after successful body emission.

## Consequences

- **Accepted**: Array, Set / Map values / keys / entries, and Iterator for-of
  bodies lower to the same generated C shape and keep carry narrowing behavior.
- **Rejected**: no new for-of accepted / rejected forms, `finally` lowering, or
  broader narrowing rule is introduced.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing for-of positive/fail cases plus the full self-host
  probe. `pnpm test` passes with the existing 280 smoke cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:6471:9` blocker and now stops at
  `src/codegen.ts:6683:5`:

  ```text
  variable declaration must have an initializer
  ```

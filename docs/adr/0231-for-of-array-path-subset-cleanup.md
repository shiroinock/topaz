# 0231. for-of array path subset cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0230](./0230-for-of-special-result-initialized-cleanup.md) moved the
full-graph self-host probe to `src/codegen.ts:6388:9`, where the ordinary
non-special for-of path still passed a full `ForOfStmt` as a diagnostic anchor.
The adjacent Array lowering also kept compiler-source-only shapes that Topaz
does not self-host yet: a non-null `arrayElem(...)!`, optional truthiness on
the binding annotation, full annotation-node anchors, and local `try/finally`
state restoration.

## Decision

Normalize only the ordinary Array for-of path. Reuse minimal `{ pos }` anchors,
make the array element lookup and binding annotation presence explicit, and
restore scope / loop state only on the normal path after emitting the loop
body. A codegen error aborts the current compile, matching prior restore
cleanup decisions while `finally` remains unsupported.

Rejected alternatives: changing Map / Set special-form lowering or iterator
lowering was rejected as phase scope; adding destructuring support outside
`.entries()` was rejected as new language behavior; broadening diagnostic anchor
assignability was rejected because the self-host cleanup can stay local.

## Implementation

- `src/codegen.ts:6235-6236` introduces local statement and source anchors for
  the ordinary for-of section.
- `src/codegen.ts:6388-6433` uses those anchors for non-special destructuring
  and unsupported-RHS diagnostics without changing the accepted forms.
- `src/codegen.ts:6435-6450` replaces `arrayElem(rhsType)!` and optional
  truthiness with explicit checks before validating an annotated Array binding.
- `src/codegen.ts:6465-6493` removes the Array path's local `try/finally`
  restore blocks and pops loop / body / binding state on the normal path.

## Consequences

- **Accepted**: plain Array `for-of` lowers to the same C shape as before.
- **Rejected**: no new plain Array destructuring, Map bare RHS, Set / Iterator
  internals, or generated-C behavior changes are introduced.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing for-of Array positive/fail cases plus the full
  self-host probe. `pnpm test` passes with the existing 280 smoke cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:6388:9` blocker and now stops at
  `src/codegen.ts:6471:9`:

  ```text
  cannot access '.stmts' on discriminated union topaz_dunion_anon_33_or_anon_34_or_anon_35_or_anon_36_or_anon_37_or_anon_38_or_anon_39_or_anon_40_or_anon_43_or_anon_45_or_anon_46_or_anon_48_or_anon_49_or_anon_79_or_anon_80_or_anon_81 - narrow it first with `switch (x.kind)`
  ```

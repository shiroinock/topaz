# 0093. markRecursiveAliases flat deps (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0092](./0092-dunion-common-field-variant-indexed-read.md) moved the full graph
self-host probe to `src/codegen.ts:1524`, where `markRecursiveAliases` used
`Map<string, string[]>` for alias dependencies. The current subset does not
support nested containers, and earlier 6i prep steps have preferred rewriting
compiler-internal structures over broadening the subset for one internal use.

## Decision

Represent alias dependency edges as flat parallel arrays (`depFrom` and
`depTo`) and scan those arrays when Tarjan needs successors. Also handle each
SCC immediately when it closes, avoiding `string[][]` storage.

Rejected alternative: adding nested container monomorphs such as
`Map<string, Array<string>>` is broader runtime/codegen work and would expand
the subset for a compiler-internal graph.

## Implementation

- `src/codegen.ts:1524` replaces `Map<string, string[]> deps` with `depFrom` and
  `depTo`.
- `src/codegen.ts:1532` rewrites successor iteration to scan flat edges.
- `src/codegen.ts:1560` processes each completed SCC immediately.
- `src/codegen.ts:1573` detects singleton self-edges by scanning flat edges.

## Consequences

- **Accepted**: recursive alias detection keeps Tarjan's behavior.
- **Rejected**: no nested container support is added.
- **Regression**: no new example was added because existing recursive alias
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.

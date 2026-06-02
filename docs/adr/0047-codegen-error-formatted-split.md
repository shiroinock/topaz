# 0047. CodegenError formatted split (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0046](./0046-codegen-array-only-entrypoint.md) removed the array-or-single
module convenience union and exposed the next full graph self-host blocker:
`cTypeName: union topaz_union_class_anon_88_or_string is not \`T | undefined\``.
The source of that union was `CodegenError` accepting either a node-like
`{ pos: number }` anchor or an already formatted diagnostic string.

Topaz currently lowers `T | undefined` and discriminated unions, but it does
not yet have a principled representation for arbitrary non-optional unions.
Diagnostic helper ergonomics should not force that representation decision.

## Decision

Keep `CodegenError` as the node-positioned diagnostic error and split the
already formatted path into a concrete `FormattedCodegenError` helper. The
ordinary constructor now accepts only `{ pos: number }` plus an optional
message, while the formatted helper builds a placeholder `CodegenError`,
overwrites its `message`, and returns that value to preserve the CLI
`instanceof CodegenError` path without using class inheritance.

Rejected alternatives: implementing general `T | U` lowering now is the
long-term direction but requires representation, narrowing, equality,
container, and diagnostic choices beyond this blocker; adding a special case
for `{ pos: number } | string` in `cTypeName` would hide a language gap behind
one helper; rewriting all diagnostic call sites to preformat strings would add
churn and lose the local node-positioning convention.

## Implementation

- `src/codegen.ts:612` keeps `CodegenError` exported but narrows its
  constructor to node anchors only.
- `src/codegen.ts:628` adds `FormattedCodegenError`, which stores a
  `CodegenError` whose `message` is the already composed diagnostic text.
- `src/codegen.ts:3219` routes `Emitter.typeErr` through
  `FormattedCodegenError.value` so type-machine diagnostics can still include
  `file:line:col`.

## Consequences

- **Accepted**: ordinary `new CodegenError(node, message)` diagnostics keep
  their node-positioned behavior.
- **Accepted**: preformatted type-machine diagnostics still produce the same
  visible `file:line:col: message` text.
- **Rejected**: `CodegenError` no longer accepts `string | object` or any other
  general non-optional union constructor shape.
- **Regression**: no example was added because diagnostic behavior is intended
  to remain unchanged; `pnpm run build`, `pnpm test`, and the full graph probe
  cover this self-hosting cut.
- **Future direction**: this remains a temporary source normalization for
  self-hosting, not a rejection of principled arbitrary union lowering.

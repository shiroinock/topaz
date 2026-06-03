# 0208. extractDiscriminatorNarrowing subset cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0207](./0207-extract-narrowing-identifier-variant-cleanup.md) moved the full
graph self-host probe to `src/codegen.ts:5268:5`, where
`extractDiscriminatorNarrowing` declared `pa` and `litText` without
initializers. The same helper also depended on `if` guard narrowing before
reading property-access and identifier fields, and used `find(...)!` to compute
the two-variant complement. Topaz requires initialized locals, explicit subset
narrowing through `switch (x.kind)`, and no non-null assertion on indexed or
lookup-like reads.

## Decision

Normalize only `extractDiscriminatorNarrowing` while preserving the existing
recognized forms: `<id>.<disc> === "lit"` / `"lit" === <id>.<disc>` and their
`!==` polarity equivalents. The helper now records initialized scalar anchors
for the receiver identifier, discriminator property name, and literal text, plus
boolean presence flags, then runs the existing dunion lookup and complement
logic after explicit checks.

Rejected alternatives: adding broad optional-object assignment support was
rejected because this phase is compiler-source cleanup, not a language
expansion. Keeping a `PropAccessExpr | undefined = undefined` accumulator was
rejected because Topaz treats annotations as hints and the self-host path
inferred the local as `undefined` from its initializer. Adding new
discriminator-narrowing forms or changing complement behavior for dunions with
more than two variants was rejected as outside this phase.

## Implementation

- `src/codegen.ts:5268-5308` replaces the uninitialized `pa` / `litText`
  locals with initialized scalar anchors and a `foundMatch` flag.
- `src/codegen.ts:5274-5305` reads property-access and receiver identifier
  fields only inside `switch (x.kind)` narrowed blocks.
- `src/codegen.ts:5312-5343` moves dunion-specific reads into a
  `switch (bType.kind)` case, replaces the matching class optional with an
  initialized `matchCls` plus `foundClass`, and replaces `find(...)!` with an
  explicit complement loop plus `foundOther`.

## Consequences

- **Accepted**: existing discriminator narrowing forms and two-variant
  complement narrowing keep the same behavior.
- **Rejected**: no truthy/falsy optional narrowing, new discriminator syntax,
  non-null assertion support, or complement behavior for larger dunions is
  introduced.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by existing dunion discriminator narrowing, compound carry
  narrowing, and full smoke coverage.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5268:5` uninitialized-local blocker
  and now stops at `src/codegen.ts:5351:12`, where `emitStatement` checks
  `this.currentReturnType` with optional truthiness.

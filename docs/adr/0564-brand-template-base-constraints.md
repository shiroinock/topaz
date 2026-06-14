# 0564 - Brand template base constraints

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.97

## Context

ADR [0523](./0523-generic-brand-template-alias.md) accepted erased
`Brand<T, K>` helpers, while ADR [0524](./0524-constrained-brand-template-payload.md),
[0529](./0529-propertykey-brand-template-payload.md), and
[0533](./0533-propertykey-union-brand-template-payload.md) accepted payload
constraints as descriptor metadata. Real TypeScript brand helpers also commonly
constrain the base parameter, for example `T extends string` or
`T extends PropertyKey`, even though Topaz still erases the brand at runtime.

## Decision

Recognized two-parameter brand-template aliases now store a base-constraint
descriptor: unconstrained, exactly `string`, exactly `PropertyKey`, or the exact
union set `string | number | symbol`. The descriptor is enforced only when a
`Brand<Base, Payload>` reference resolves its concrete base type. Unconstrained
helpers keep the old accepted base set; `string` accepts only `string`; both
`PropertyKey` spellings accept `string` and `number` while keeping `symbol`
type-only.

Rejected alternatives: general generic constraint checking would cross into
ordinary aliases, functions, and classes; ignoring the parsed base constraint
would accept `Brand<number, ...>` through `T extends string`; public
`PropertyKey` or runtime `symbol` value support would widen unrelated
annotation/runtime boundaries; partial unions and `keyof` constraints need a
real constraint solver.

## Implementation

- `src/codegen.ts:1473` adds the base-constraint descriptor to
  `base_payload` brand-template metadata.
- `src/codegen.ts:4555` parses recognized base constraints during
  `tryMakeBrandAliasTemplate` and keeps base defaults rejected.
- `src/codegen.ts:4619` stores unconstrained bases and `src/codegen.ts:4624`
  shares the exact `string` / `PropertyKey` /
  `string | number | symbol` spelling classifier with the payload constraint
  gate.
- `src/codegen.ts:4720` enforces the descriptor at brand-template reference
  sites after `brandBase(...)` resolves the concrete base kind.
- `tests/smoke.sh:3514` adds accepted identifier and computed-key helper forms;
  `tests/smoke.sh:3551` pins constrained-base rejection diagnostics.
- `MEMO.md:490` records the phase 5.97 completion line.

## Consequences

- **Accepted**: identifier and computed-key `Brand<T extends string, K>`,
  `Brand<T extends PropertyKey, K>`, and
  `Brand<T extends string | number | symbol, K>` helpers.
- **Rejected**: `Brand<number, ...>` under `T extends string`, boolean bases
  under the two `PropertyKey` spellings, unsupported base constraints such as
  `T extends boolean`, and base parameter defaults.
- **Preserved**: payload constraints/defaults from phases 5.57, 5.62, and 5.66,
  unconstrained brand-template base behavior, ordinary generic constraint
  rejection, and lack of runtime `symbol` support.
- **Regression count**: smoke now covers 623 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.

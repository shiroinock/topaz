# 0524 - constrained brand template payload

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.57

## Context

ADR [0523](./0523-generic-brand-template-alias.md) accepted the narrow
`type Brand<T, K> = T & { readonly field: K }` helper shape, but many TypeScript
brand helpers spell the payload parameter as `K extends string`. The previous
frontend rejected every type-parameter constraint before codegen could decide
whether the alias was the already-supported brand-template shape. This blocked a
type-only compatibility spelling without requiring general generic constraints.

## Decision

Preserve optional type-parameter constraints in the shared AST and in both
parser frontends, while still rejecting type-parameter defaults. During
brand-template registration only, accept a second parameter that is either
unconstrained or constrained to exactly `string`; continue to reject any base
parameter constraint and any non-string payload constraint with focused brand
diagnostics. Generic functions and generic classes keep constraint rejection in
codegen, and unrecognized generic aliases still fall through to the ordinary
unsupported generic-alias diagnostic.

Rejected alternatives: implementing generic constraints generally would need
function inference, class monomorphization, interface checks, and alias
substitution semantics; dropping constraints in the parser would lose source
information needed by the future generic audit; accepting payload constraints
such as `string | number` or `keyof T` would require a real constraint solver;
accepting `T extends string` on the base parameter would add template-level
semantics already enforced at `Brand<Base, "Payload">` reference sites.

## Implementation

- `src/ast.ts:572` adds `constraint` to `TypeParam`.
- `src/convert_from_tsc.ts:533` converts `tp.constraint` through the existing
  type converter while keeping default type parameters unsupported.
- `src/topaz_parser.ts:424` parses optional `extends <type>` inside type
  parameter lists and keeps `=` as an unsupported default marker.
- `src/codegen.ts:2552` and `src/codegen.ts:2712` reject constraints on generic
  classes and functions before they can be silently ignored.
- `src/codegen.ts:4362` validates brand-template parameter constraints, accepts
  exactly `K extends string`, rejects base constraints, and preserves the
  existing brand-template body matcher and resolver.
- `tests/smoke.sh:3438` adds constrained identifier/computed brand-template
  positives plus three focused constraint rejection samples.
- `MEMO.md:450` records the phase 5.57 completion line.

## Consequences

- **Accepted**: `type Brand<T, K extends string> = T & { readonly __brand: K }`
  and the computed-key spelling `T & { readonly [Key]: K }`, with unchanged
  `Brand<Base, "Payload">` base-erased nominal brand resolution.
- **Rejected**: payload constraints other than exactly `string`, constraints on
  the base type parameter, and constrained generic functions/classes outside
  the brand-template exception.
- **Preserved**: unconstrained `Brand<T, K>` helpers, `type_alias_generic_fail`,
  existing cross-brand / implicit / bad-payload / bad-shape rejections, and
  ordinary generic alias unsupported diagnostics.
- **Deferred**: general generic constraint checking, type-parameter defaults,
  alias monomorphization, runtime `symbol`, and arbitrary computed property
  expressions.
- **Regression**: `brand_generic_template_constrained` and
  `brand_generic_computed_template_constrained` cover accepted forms; the three
  new `*_constraint*_fail` samples pin rejected forms.
- **Regression count**: smoke now covers 520 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.

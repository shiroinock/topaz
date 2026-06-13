# 0539 - interface phantom brand descriptor

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.72

## Context

ADR [0534](./0534-phantom-object-brand-helper-alias.md), ADR
[0535](./0535-constrained-phantom-object-brand-helper.md), and ADR
[0536](./0536-default-phantom-object-brand-helper.md) accepted alias-backed
phantom helper descriptors for `Base & Phantom<Payload>`. Real TypeScript
opaque patterns also spell the phantom side as a single-readonly-field
interface, for example `interface UserIdBrand { readonly __brand: "UserId" }`
and `type UserId = string & UserIdBrand`. Accepting that spelling should not
reopen generic interface realization or add runtime `symbol` semantics.

## Decision

Register a descriptor overlay for non-generic interfaces with exactly one
readonly field whose payload spelling is a string literal, `typeof Identifier`,
`unknown`, or `never`. The ordinary interface registration remains in place;
the descriptor is consulted only when a reference to that interface is the
phantom side of a two-part primitive brand intersection. The nominal brand key
uses the interface name, field spelling, and payload spelling.

Rejected alternatives: implementing generic `interface Phantom<K>` now would
reopen the generic interface backlog; expanding the interface structurally
would turn an erased type-only descriptor into object realization; stealing the
name away from ordinary interface registration would make bare `UserIdBrand`
surprising; supporting computed interface keys is deferred because the parser
does not preserve computed interface field metadata; payload literals beyond
the established brand set and runtime `unique symbol` values remain deferred.

## Implementation

- `src/codegen.ts:1442` adds the interface phantom descriptor shape.
- `src/codegen.ts:1708` stores descriptor overlays separately from generic
  brand helper aliases.
- `src/codegen.ts:3576` registers valid single-readonly-field interface
  descriptors while still collecting normal interface members.
- `src/codegen.ts:3587` gives type-query and `never` descriptor fields an
  erased runtime placeholder so interface vtable emission does not require
  runtime symbol or bottom-value semantics.
- `src/codegen.ts:4348` recognizes descriptor-backed interface references as
  the phantom side of a brand intersection.
- `src/codegen.ts:4625` resolves descriptor-backed interfaces to base-erased
  nominal brands keyed by interface name, field, and payload spelling.
- `examples/brand_interface_phantom.ts` covers string-literal, `unknown`,
  `never`, and `typeof Identifier` payloads plus same-brand assignment,
  brand-to-base widening, and distinct interface-backed values.
- `examples/brand_interface_phantom_cross_assign_fail.ts` and
  `examples/brand_interface_phantom_bad_shape_fail.ts` pin nominal separation
  and preserved bad-shape diagnostics.
- `MEMO.md:465` records the phase boundary.

## Consequences

- **Accepted**: `Base & InterfaceBrand` when `Base` is `string`, `number`,
  `boolean`, or `bigint` and the interface is exactly one readonly phantom
  field with an established payload spelling.
- **Rejected**: mutable, method, empty, multi-field, computed-key, and generic
  interface shapes as phantom descriptors.
- **Preserved**: bare interface references still resolve as ordinary interface
  types, and nonprimitive brand bases keep the existing diagnostic.
- **Deferred**: generic interface realization, structural object expansion for
  interface brands, parser support for computed interface keys, and runtime
  `symbol` / `unique symbol` semantics.
- **Regression**: `brand_interface_phantom`,
  `brand_interface_phantom_cross_assign_fail`, and
  `brand_interface_phantom_bad_shape_fail`.
- **Regression count**: smoke now covers 580 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.

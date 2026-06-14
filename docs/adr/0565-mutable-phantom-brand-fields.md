# 0565 - Mutable phantom brand fields

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.98

## Context

ADR [0521](./0521-nominal-erased-string-phantom-brand.md) through ADR
[0540](./0540-computed-interface-phantom-brand-key.md) built the erased brand
track around single `readonly` phantom fields. Real TypeScript brand helpers
often spell the field as mutable-looking metadata, for example
`{ __brand: K }`, even though Topaz never materializes that property at
runtime. Keeping `readonly` mandatory rejects otherwise equivalent nominal
brand descriptors.

## Decision

Recognized erased brand descriptor positions now treat `readonly` as optional:
direct primitive brand intersections, computed-key direct intersections,
two-parameter `Brand<T, K>` helpers, one-parameter `Phantom<K>` helpers, and
single-field interface phantom descriptors. The field is still required,
single-member, field-only, and payload-limited to the existing brand payload
spellings. The nominal key continues to use alias/interface name, field
spelling, and payload spelling only; mutability does not split the brand.

Rejected alternatives: accepting general mutable object/interface lowering
would widen structural runtime semantics outside the erased brand track;
optional phantom fields would mix descriptor recognition with optional property
semantics; runtime properties for brands would violate erasure; including
mutability in brand keys would make two equivalent TypeScript spellings
incompatible.

## Implementation

- `src/codegen.ts:3698` registers interface phantom descriptors without a
  readonly requirement while keeping the single field / payload / computed-name
  gates.
- `src/codegen.ts:4439` keeps brand intersections limited to one primitive base
  and one phantom object/reference, but updates diagnostics to required
  phantom objects rather than readonly phantom objects.
- `src/codegen.ts:4487` keeps direct phantom type literals single-field and
  `src/codegen.ts:4503` rejects optional fields while accepting mutable fields.
- `src/codegen.ts:4680` lets brand-template and phantom-helper descriptors use
  mutable required fields while still rejecting optional, multi-field, method,
  and unsupported computed shapes.
- `tests/smoke.sh:3491` adds direct mutable brand coverage, and
  `tests/smoke.sh:3542` adds interface mutable descriptor coverage.
- `tests/smoke.sh:3496` pins optional direct phantom rejection; existing
  `interface_computed_field_fail` keeps ordinary computed interface fields
  outside descriptor positions rejected.
- `MEMO.md:491` records the phase 5.98 completion line.

## Consequences

- **Accepted**: mutable required direct, computed-key, generic-template,
  phantom-helper, and interface descriptor brand spellings.
- **Rejected**: optional phantom fields, multi-field or method descriptors,
  unsupported computed names, arbitrary structural computed fields, and runtime
  symbol/property semantics.
- **Preserved**: readonly descriptor spellings, existing payload/default/base
  constraint behavior, brand erasure, and nominal key compatibility between
  readonly and mutable spellings.
- **Regression count**: smoke now covers 626 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.

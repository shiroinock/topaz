# 0224. object destructuring receiver info cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0223](./0223-scalar-literal-init-switch-narrowing.md) moved the full-graph
self-host probe to `src/codegen.ts:5976:5`, where
`emitObjectDestructuringDecl` declared `fields`, `methods`, `receiverKind`, and
`receiverName` without initializers before assigning them in class/interface
receiver branches. The compiler-source subset requires every `let` / `const`
local to be initialized at declaration time.

Object destructuring behavior was already fixed by the existing positive and
fail samples. This phase only normalizes the compiler source shape for the
self-host path.

## Decision

Store receiver metadata in one initialized object before validating destructured
fields or emitting field reads. Class and interface branches still perform the
same registry lookups, build the same method-name set, and assign the same field
map and receiver name. `receiverKind` is stored as `string` rather than a string
literal union because the current self-host subset widens the initializer object
literal; the emitted accessor branch still compares against `"class"`.

Rejected alternatives: broadening uninitialized local handling was rejected as
type-system scope; adding support for destructuring optional unions or
discriminated unions was rejected as object-destructuring semantics scope;
rewriting plain variable declarations or for-of lowering was rejected as outside
this phase.

## Implementation

- `src/codegen.ts:5976-5986` initializes a receiver metadata object with empty
  maps/sets and neutral receiver text.
- `src/codegen.ts:5987-6016` replaces the metadata object in the existing class
  and interface branches after building method-name sets from `methods.keys()`.
- `src/codegen.ts:6034-6064` uses the metadata object for missing-field checks,
  method-as-value diagnostics, and class/interface accessor selection.

## Consequences

- **Accepted**: object destructuring accepts the same class and interface
  receivers as before.
- **Rejected**: missing field, method-as-value, union, dunion, and non-class
  receiver diagnostics keep their existing messages and unsupported status.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing `object_destructuring` positive/fail cases and full
  smoke coverage. `tests/smoke.sh` coverage remains 281 case invocations.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5976:5` uninitialized receiver metadata
  blocker and now stops at `src/codegen.ts:5989:12`: `if (!cls)` has a
  non-boolean optional class-info condition.

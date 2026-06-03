# 0225. object destructuring registry optional cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0224](./0224-object-destructuring-receiver-info-cleanup.md) moved the
full-graph self-host probe to `src/codegen.ts:5989:12`, where
`emitObjectDestructuringDecl` used `if (!cls)` after a class registry lookup.
The interface receiver branch had the same optional truthiness shape, and both
branches still depended on non-null assertions around
`classNameOf(recvType)!` / `interfaceNameOf(recvType)!`.

Object destructuring behavior and diagnostics were already covered by existing
positive and fail samples. This phase only normalizes the compiler source shape
so the self-host subset does not need optional truthiness or non-null assertions
in this helper.

## Decision

Normalize object destructuring's class and interface registry lookups through
explicit optional locals. Each branch now narrows the receiver name with an
`=== undefined` guard, looks up the registry by the narrowed name, and checks
the registry result with `=== undefined` before building the same receiver
metadata as before.

Rejected alternatives: adding optional object truthiness was rejected as a
language-feature expansion; changing registry behavior was rejected as semantic
scope; changing object destructuring receiver acceptance or generated accessors
was rejected because successful programs should emit the same C.

## Implementation

- `src/codegen.ts:5987-5996` replaces the class receiver non-null assertion and
  truthy registry check with explicit `classNameMaybe` / `className` locals and
  `undefined` guards.
- `src/codegen.ts:6007-6016` applies the same cleanup to interface receivers
  through `interfaceNameMaybe` / `interfaceName`.
- `src/codegen.ts:5997-6025` preserves method-set construction and receiver
  metadata assignment after the narrowed registry entries are available.

## Consequences

- **Accepted**: object destructuring accepts the same class and interface
  receivers as before.
- **Rejected**: optional unions, discriminated unions, missing fields, and
  method-as-value cases keep their existing unsupported status and diagnostics.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing `object_destructuring` positive/fail cases and full
  smoke coverage. `pnpm test` passes with the existing case set.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5989:12` optional class registry
  blocker and now stops at `src/codegen.ts:6098:5`: `let varType: TopazType;`
  is a variable declaration without an initializer.

# 0040. Module global types name key (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0039](./0039-loop-context-linked-frames.md) removed the `loopCtx` container
blocker and moved the full graph self-host probe to `src/codegen.ts:999:30`.
The next blocker was `Emitter.moduleGlobalTypes: Map<Stmt, TopazType>`, used
only as a compiler-internal cache between module-global declaration emission and
the later initializer emission pass. Lowering that shape would require
`Map<dunion, dunion>` because `Stmt` and `TopazType` are both discriminated
unions in the Topaz AST subset.

## Decision

Key `moduleGlobalTypes` by the module-global variable name instead of the
statement object. The flattened module model already gives declarations one
global namespace, and `scope.declareBinding` rejects redeclarations before the
initializer lookup can depend on an ambiguous name.

Rejected alternatives: adding general `Map<dunion, dunion>` support would
expand user-visible container behavior for one internal cache; assigning numeric
statement ids would add an AST identity system only for this lookup; moving the
cached type into `TopLevelEntry` is viable but touches more top-level data flow
than this blocker needs.

## Implementation

- `src/codegen.ts:999` changes `moduleGlobalTypes` to
  `Map<string, TopazType>`.
- `src/codegen.ts:4890` stores the module-global type under `d.name` after the
  existing `scope.declareBinding` uniqueness check.
- `src/codegen.ts:4899` retrieves the initializer type by `stmt.name` after
  confirming the statement is an initialized `var_decl`.

## Consequences

- **Accepted**: non-root module-global initialization behavior from
  [0037](./0037-non-root-module-globals.md) is preserved without relying on
  statement identity.
- **Rejected**: flattened-name collisions remain invalid through existing scope
  redeclaration behavior; user-facing dunion keys in `Map` remain unsupported.
- **Regression**: no new example was added because `module_global_state` already
  covers observable non-root module globals and the change is compiler-internal.
  `tests/smoke.sh` still contains 257 cases.
- **Next blocker**: the old `moduleGlobalTypes` blocker is gone. The full graph
  probe now reaches `src/codegen.ts:1005:30` and stops on missing
  `Map<topaz_class_anon_3, string>` support for
  `Emitter.preAllocatedAnons: Map<TypeLiteralNode, string>`.

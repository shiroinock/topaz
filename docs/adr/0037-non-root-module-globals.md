# 0037. Non-root module globals (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0036](./0036-codegen-source-shape-cleanup.md) moved the full graph self-host
probe past TypeScript-only source shapes. The next blocker was
`src/codegen.ts:46:1`: non-root modules rejected every executable top-level
statement except scalar-literal `const` hoists, but `codegen.ts` itself needs
module-scope state (`g_currentModule`) and object-valued constants (`T_NUMBER`,
`T_BOOLEAN`, etc.) to be visible from emitted functions.

## Decision

Allow a narrow non-root module-global form: a single-binding `let` or `const`
with an explicit type annotation and initializer. Codegen lowers it into a C
file-scope `static <type> name;` declaration plus a main-entry initialization
assignment emitted before root top-level statements. Existing scalar-literal
`const` hoisting remains unchanged, and root module top-level declarations keep
their previous main-local behavior.

Rejected alternatives: allowing arbitrary non-root statements would introduce
module side effects and ordering beyond what self-hosting needs; rewriting all
compiler globals into parameters or factories would touch the `CodegenError`
position path and many call sites; extending compile-time scalar hoisting to
object/string values is insufficient because mutable module state still needs a
runtime initialization point.

## Implementation

- `src/codegen.ts:46`, `src/codegen.ts:103`, and `src/codegen.ts:601` make the
  compiler source satisfy the stricter annotated-global and field-init subset
  requirements.
- `src/codegen.ts:873` records whether a top-level statement came from the root
  module, so root semantics stay unchanged.
- `src/codegen.ts:979`, `src/codegen.ts:1940`, and `src/codegen.ts:2024` track
  non-root module globals, emit file-scope C storage, and emit main-entry
  initializers.
- `src/codegen.ts:4816`, `src/codegen.ts:4840`, and `src/codegen.ts:4852`
  validate annotated globals, register them in global scope, and lower their
  initializers with the declared type as context.
- `examples/module_global_state_util.ts` and
  `examples/module_global_state_main.ts` cover non-root `let`, string `const`,
  and object-valued `const` globals used from imported functions.

## Consequences

- **Accepted**: non-root annotated module globals with initializers; globals are
  visible to functions in the same flattened program and initialized once from
  main before root top-level execution.
- **Rejected**: arbitrary non-root executable statements and unannotated
  non-root globals.
- **Regression**: `module_global_state`; full `pnpm test` passes.
- **Next blocker**: the old non-root module-shape blocker is gone. The full
  graph probe now reaches `src/codegen.ts:627:18` and stops on
  `no Array monomorph for element type topaz_map_string_class_anon_88`, caused
  by `Scope` using `Array<Map<string, Binding>>`.

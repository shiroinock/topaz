# 0419 - effect provenance collector

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.1

## Context

Phase 4.0 / ADR [0418](./0418-builtin-effect-inventory.md) pinned the builtin
effect vocabulary, but v0.2 still lacked source locations that future
`doctor`, manifest generation, `check`, and `explain` flows can show to users.
ADR [0330](./0330-manifest-doctor-capability-guidance-design.md) calls for
file:line provenance, while ADR [0409](./0409-host-abi-substrate-policy.md)
keeps runtime host ABI helpers as substrate until capability UX exists.

## Decision

Add an internal, descriptor-backed provenance collector over the loaded
`ModuleGraph`. It returns deterministic `file` / `line` / `col` records with
effect atom, semantic builtin name, descriptor status, source kind, and detail.
Rejected alternatives: a public `topaz doctor` / `check` / `explain` command was
rejected because command shape belongs to a later UX phase; manifest schema or
permission policy was rejected because this phase only supplies source facts;
runtime enforcement was rejected because runtime behavior remains unchanged.

## Implementation

- `src/effect_provenance.ts:1` exports `BuiltinEffectProvenance`,
  `collectBuiltinEffectProvenance(graph)`, and
  `collectBuiltinEffectProvenanceForEntry(entry)`.
- `src/effect_provenance.ts:34` builds descriptor lookup tables from
  `builtinImportDescriptors()` and `builtinSyntheticGlobalDescriptors()`, then
  skips internal runtime-prelude modules while walking the source graph.
- `src/effect_provenance.ts:77` records effectful builtin named imports and
  keeps imported binding provenance local to that source module.
- `src/effect_provenance.ts:200` scans statements and expressions for imported
  builtin calls, `process.argv` reads, process/stdio synthetic calls, and
  console calls; `src/effect_provenance.ts:307` maps `console.warn(...)` to the
  `console.error` descriptor.
- `scripts/check-effect-provenance.mjs:1` writes a temporary fixture under
  `build/`, imports the built JS API, asserts exact deterministic provenance
  lines, and guards that pure `std/path` calls do not produce effects.
- `package.json:22` exposes `pnpm run check:effect-provenance`, and
  `tests/smoke.sh:57` runs it before the normal smoke examples.
- `MEMO.md:333` records Phase 4.1 as the first source-provenance seed.

## Consequences

- **Accepted**: v0.2 now has an internal API that can explain builtin effect
  requirements with descriptor metadata and source locations.
- **Accepted**: smoke prints `PASS [effect_provenance]` after checking
  `fs.read`, `fs.write`, `process.argv`, `io.stdout`, `io.stderr`, and
  `console.warn(...)` detail coverage.
- **Rejected**: pure path imports/calls still produce no effect provenance.
- **Regression**: `pnpm run build`, `pnpm run check:builtin-effects`,
  `pnpm run check:effect-provenance`, and `pnpm test`.
- **Scope外**: public CLI commands, manifest parsing/writing, compile-time
  permission rejection, runtime permission enforcement, and user-defined
  function effect propagation remain future v0.2 work.

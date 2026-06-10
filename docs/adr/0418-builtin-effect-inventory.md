# 0418 - builtin effect inventory

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.0

## Context

`v0.1.3` closes the runtime TS prelude checkpoint and pins the remaining C
substrate boundaries before the v0.2 capability work. The v0.2.0 allocation is
capability/effect inference, manifest generation, and doctor/check/explain UX.
`src/builtin_descriptors.ts` already records effects for public stdlib imports,
compatibility imports, and synthetic globals, but that table was not yet a
deterministic development inventory or smoke gate.

## Decision

Treat the builtin descriptor effect table as the first v0.2 seed artifact. Pin
the seed vocabulary with an offline Node checker that imports the built
descriptor module, validates descriptor metadata, and prints deterministic
effect/status summaries. Rejected alternatives: public `topaz explain`,
`topaz check`, or `--explain-effects` commands were rejected because command
shape and zero-config policy still need their own design; a manifest schema was
rejected because this phase only guards the vocabulary; runtime permission
enforcement was rejected because ADR [0409](./0409-host-abi-substrate-policy.md)
keeps host calls as substrate until manifest/capability UX exists.

## Implementation

- `scripts/check-builtin-effects.mjs:1` adds the offline checker and pins the
  v0.2 seed vocabulary: `fs.read`, `fs.metadata`, `fs.write`, `process.argv`,
  `process.exit`, `io.stdout`, `io.stderr`, and `process.spawn`.
- `scripts/check-builtin-effects.mjs:58` rejects empty metadata, unknown
  statuses/effects, duplicate descriptor identities, missing effects on known
  impure builtins, and accidental impurity on path, URL, or `import.meta.url`
  descriptors.
- `package.json:21` exposes `pnpm run check:builtin-effects`.
- `tests/smoke.sh:11` runs the checker, asserts summary/vocabulary/status lines,
  and probes the optional module-path test hook with an unknown effect.
- `MEMO.md:332` records Phase 4.0 as the v0.2 seed inventory gate.

## Consequences

- **Accepted**: `pnpm run check:builtin-effects` reports a deterministic builtin
  effect summary for the current descriptor table.
- **Accepted**: smoke now prints `PASS [builtin_effect_inventory]` and fails if
  a descriptor introduces an unpinned effect vocabulary entry.
- **Rejected**: empty `semanticName` / `explanation`, unknown status, empty or
  unknown effects, duplicate import/synthetic identities, missing effects for
  known impure builtins, and impure path/URL/import.meta.url descriptors.
- **Regression**: `pnpm run build`, `pnpm run check:builtin-effects`, and
  `pnpm test`.
- **Scope外**: public CLI explain/check/doctor commands, manifest schema,
  runtime permission enforcement, and source-level effect inference remain for
  future v0.2 phases.

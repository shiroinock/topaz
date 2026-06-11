# 0444 - v0.2 guidance docs

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.25

## Context

ADR [0426](./0426-public-doctor-cli.md), ADR
[0437](./0437-public-check-cli.md), ADR
[0440](./0440-public-manifest-init-cli.md), ADR
[0442](./0442-manifest-init-write-flag.md), and ADR
[0443](./0443-release-manifest-init-write-smoke.md) moved the v0.2 guidance
CLI from design into the current release candidate surface. The README and MVP
handoff still described capabilities, manifests, `doctor`, `check`, and
`explain` as wholly future work, which was accurate for the MVP snapshot but
stale for current HEAD.

## Decision

Document the implemented v0.2 guidance loop as user-facing release-candidate
surface: `doctor` reports required capabilities, `manifest init` previews the
normalized `{ "capabilities": [...] }` policy, `manifest init --write` creates
an entry-adjacent policy only when absent, `check` validates that adjacent
policy, and `explain` describes known capability atoms and stdlib modules.
Rejected alternatives: changing CLI behavior, expanding the manifest schema,
claiming compile-time permission enforcement or runtime sandboxing, rewriting
the historical MVP snapshot as if guidance commands were MVP requirements,
tagging or publishing a release, or changing runtime/prelude/header boundaries.

## Implementation

- `README.md:89` adds the capability / manifest guidance section with the
  `doctor -> manifest init -> check -> explain` loop and zero-config compile
  boundary.
- `README.md:148` replaces the stale post-MVP sentence with a split between
  implemented v0.2 guidance and future enforcement/sandboxing/language work.
- `docs/mvp.md:52` preserves the MVP handoff as a snapshot while pointing
  current readers to README for post-MVP v0.2 guidance commands.
- `docs/mvp.md:237` keeps guidance after the original MVP boundary and notes
  that current repository builds have since implemented the CLI.
- `.agents/skills/topaz-release/SKILL.md:151` adds the v0.2 RC black-box smoke
  commands for help, doctor, manifest preview/write, check, and explain.
- `.agents/skills/topaz-release/SKILL.md:198` carries that guidance smoke into
  v0.2 final release verification.
- `MEMO.md:358` records Phase 4.25 and `MEMO.md:378` narrows the remaining
  ecosystem backlog to enforcement, sandboxing, schema, and discovery work.

## Consequences

- **Accepted**: README now lets a reader discover the current v0.2 guidance
  loop without implying normal compile requires `strict-ts.json`.
- **Accepted**: release operators have a black-box v0.2 guidance smoke beyond
  the historical fib artifact check.
- **Accepted**: MVP docs still describe the original MVP boundary, with a
  pointer to the live post-MVP command contract.
- **Rejected**: CLI behavior, command output, manifest schema, compile-time
  permission enforcement, runtime sandboxing, release tags, publication policy,
  and runtime/prelude/header content remain unchanged.
- **Regression**: `pnpm run build` and `pnpm test`.

# 0442 - manifest init write flag

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.23

## Context

ADR [0440](./0440-public-manifest-init-cli.md) made `topaz manifest init
<entry.ts>` a public write-free stdout preview, and ADR
[0441](./0441-release-manifest-init-smoke.md) proved that preview on native
release artifacts. v0.2 still needs a deterministic path that creates the
entry-adjacent `strict-ts.json`, but overwrite policy, prompts, and compile-time
permission enforcement are separate decisions.

## Decision

Add only an explicit `--write` mode to `topaz manifest init`. Preview mode keeps
printing the normalized policy text to stdout. Write mode accepts `--write`
before or after the entry, computes the same text, writes it to
`join(dirname(resolvedEntry), manifestPolicyFilename())` only when the file is
absent, and prints `wrote <absolute-path>` on success. Rejected alternatives:
writing by default, overwriting an existing policy, adding `--force` / `--yes`
or prompts, discovering parent/package policies, accepting `--policy`, adding
normal compile permission enforcement, changing the manifest schema, or touching
runtime/prelude/header files.

## Implementation

- `src/cli.ts:3` imports `existsSync` so `manifest init --write` can reject
  existing entry-adjacent policy files before writing.
- `src/cli.ts:30` and `src/cli.ts:46` expose `--write` in help without adding it
  to the normal compile option parser.
- `src/cli.ts:197` keeps `runManifestCommand(...)` scoped to `init`, tracks a
  `writePolicy` boolean, rejects repeated `--write`, and preserves compile-only
  flag and unknown-option diagnostics.
- `src/cli.ts:239` shares requirement collection and normalized text generation
  between preview and write mode; `src/cli.ts:246` chooses the entry-adjacent
  `strict-ts.json`, refuses overwrite, writes the text, and prints success.
- `scripts/check-cli-selfhost.mjs:11` requires the generated native CLI help to
  mention `--write`.
- `tests/smoke.sh:711` checks help, `tests/smoke.sh:913` keeps preview exact and
  write-free, and `tests/smoke.sh:945` covers write success, entry-before/after
  flag placement, `topaz check` round-trip, overwrite refusal, repeated
  `--write`, and non-manifest command rejection.
- `MEMO.md:356` records the Phase 4.23 checkpoint.

## Consequences

- **Accepted**: `topaz manifest init <entry.ts>` remains stdout-only and does
  not create a policy file.
- **Accepted**: `topaz manifest init <entry.ts> --write` creates exactly one
  entry-adjacent `strict-ts.json` whose contents match
  `formatManifestPolicyForRequirements(...)`, and the file passes existing
  `topaz check`.
- **Rejected**: existing `strict-ts.json` overwrite, repeated `--write`,
  `--write` on compile / `doctor` / `check` / `explain`, extra positionals, and
  non-`.ts` entries keep deterministic `topaz:` diagnostics.
- **Scope outside**: interactive prompt, overwrite/force flags, parent policy
  discovery, `--policy`, compile-time permission enforcement, runtime
  sandboxing, schema expansion, release artifact write-mode smoke, release
  publishing, package version changes, and runtime/prelude/header changes.
- **Regression**: `pnpm run build`, `pnpm run check:manifest-generate`, `pnpm
  run check:manifest-selfhost`, `pnpm run check:cli-selfhost`, `node
  dist/cli.js src/cli.ts --emit-c-only -o build/orch_selfhost_probe`, and `pnpm
  test`.

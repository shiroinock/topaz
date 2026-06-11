# 0435 - strict-ts policy file loader

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.16

## Context

ADR [0434](./0434-strict-ts-policy-text-parser.md) made the current
`strict-ts.json` text format self-hostable without using host `JSON.parse`, but
it deliberately left file IO outside the manifest policy module. Future
`topaz check <entry.ts>` needs a native CLI path that can read an explicit
policy file while preserving zero-config builds: a missing policy file must
mean "no grants requested", not a fatal manifest error.

## Decision

Add `loadManifestPolicyFile(path)` to `src/manifest_policy.ts` as a
path-explicit internal API. It first probes `existsSync(path)`. Missing files
return `found: false`, preserve the path, and carry an ok empty policy with no
diagnostics. Present files are read with `readFileSync(path, "utf8")` and then
fed directly into `parseManifestPolicyText(text)`, so all parser and validator
diagnostics from Phase 4.15 remain unchanged. Rejected alternatives: adding
public `topaz check`, walking from an entry file to discover manifests, using
host `JSON.parse`, introducing permission enforcement or runtime sandboxing,
and changing runtime/prelude/header behavior.

## Implementation

- `src/manifest_policy.ts:1` imports the existing supported `node:fs`
  primitives used by the self-hostable loader.
- `src/manifest_policy.ts:21` exports `ManifestPolicyFileLoadResult` with
  `found`, `path`, and nested `result` fields.
- `src/manifest_policy.ts:45` implements the missing-file zero-config branch and
  the present-file parse branch without changing `manifestPolicyFilename()`.
- `scripts/check-manifest-policy-load.mjs:1` creates fixtures under
  `build/manifest_policy_load` and asserts missing, empty, valid, non-object,
  unknown-capability, and duplicate-key behavior through the built module.
- `package.json:28` and `tests/smoke.sh:172` add the loader checker to the local
  gate beside the existing manifest policy checks.
- `scripts/check-manifest-selfhost.mjs:15` and `MEMO.md:349` record that
  `src/manifest_policy.ts` now clears the validator, text parser, and file
  loader self-host boundary.

## Consequences

- **Accepted**: missing explicit manifest paths produce `found: false`, an ok
  empty policy, and no diagnostics.
- **Accepted**: present `{}` and known capability files produce `found: true`
  and the same normalized policies as the text parser.
- **Accepted**: present invalid files still report the exact Phase 4.15 parser
  or validator diagnostic, including non-object, unknown capability, duplicate
  capability, and duplicate top-level key cases.
- **Rejected**: directory discovery, public `topaz check`, permission
  enforcement, runtime sandboxing, Map/Set-backed policy storage, and
  runtime/prelude/header changes remain outside this phase.
- **Regression**: `pnpm run build`, `pnpm run check:manifest-policy`,
  `pnpm run check:manifest-policy-parse`,
  `pnpm run check:manifest-policy-load`, `pnpm run check:manifest-selfhost`,
  `node dist/cli.js src/cli.ts --emit-c-only -o build/orch_selfhost_probe`,
  `pnpm run check:cli-selfhost`, and `pnpm test`.

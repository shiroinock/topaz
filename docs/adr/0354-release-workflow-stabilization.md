# 0354 - release workflow stabilization

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: release prep

## Context

`v0.1.0-rc.2` and `v0.1.0` both produced valid draft GitHub Releases, and the
downloaded `topaz-darwin-arm64` assets passed checksum and black-box compiler
smoke checks. The remaining release friction was a GitHub Actions annotation:
`actions/checkout@v4`, `actions/setup-node@v4`, and
`actions/upload-artifact@v4` targeted the deprecated Node.js 20 JavaScript
action runtime.

The first `v0.1.1-rc.1` attempt used GitHub's Node 24 force-run environment
switch, but the run still emitted an annotation saying those actions targeted
Node.js 20 and were being forced onto Node.js 24. That proved the env switch was
a compatibility bridge, not a clean release workflow fix.

The same release runs also showed that the practical human checklist needs to
include the downloaded asset check, not just the local `pnpm run build:release`
gate.

## Decision

Treat `v0.1.1` as a patch-level release workflow stabilization. The workflow
uses official GitHub action majors that target the current Node.js action
runtime (`actions/checkout@v6`, `actions/setup-node@v6`, and
`actions/upload-artifact@v7`), while README, MVP docs, and the repo-local
release skill explicitly require checksum verification and a downloaded-binary
black-box compiler smoke before publication.

Rejected alternatives: keeping only the Node 24 force-run environment switch was
rejected after `v0.1.1-rc.1` still emitted a deprecation annotation; changing
release artifact shape was rejected because `v0.1.1` should preserve the
`v0.1.0` single-binary MVP contract.

## Implementation

- `.github/workflows/release-artifact.yml`: updates official GitHub action
  majors to Node 24-compatible releases.
- `README.md`: checksum verification is part of downloaded compiler usage.
- `docs/mvp.md`: black-box handoff checklist now includes checksum verification.
- `.agents/skills/topaz-release/SKILL.md`: RC and final release flows require
  downloaded asset verification and binary-only compiler smoke.
- `MEMO.md`: records `v0.1.1` as an MVP-preserving patch.

## Consequences

- **Accepted**: release workflow warnings from the Node.js 20 action runtime are
  handled by moving to official action majors that target the current runtime.
- **Accepted**: release operators and black-box testers get the same downloaded
  asset verification steps.
- **Rejected**: this patch does not expand language syntax, runtime semantics,
  stdlib surface, package lookup, or release asset names.
- **Future work**: if GitHub changes the JavaScript action runtime again,
  revisit action majors before cutting the next patch release.

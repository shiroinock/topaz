---
name: topaz-release
description: Topaz の release candidate / GitHub Release 準備を再現する repo-local skill。version 番号の選定、local gate、v* tag による GitHub Actions artifact build、draft Release 確認、公開前チェックを扱う。main push を release intent と見なさない。
---

# Topaz Release Workflow

Use this skill when preparing a Topaz release candidate, final release, or
release dry run. The release intent is a `v*` tag, not a normal `main` push.
The GitHub Actions workflow creates draft releases only; publishing remains a
manual decision until signing/notarization policy is added.

## Version Policy

Topaz uses `0.x.y` SemVer while the language and packaging contract are still
settling.

- `v0.1.0`: single-binary MVP release.
- `v0.1.y`: MVP bugfixes, diagnostic/doc/workflow fixes, and self-host gate
  stabilization that do not expand the language surface.
- `v0.2.0`: capability/effect inference, manifest generation, `doctor`,
  `check`, and `explain`.
- `v0.3.0`: async/await and Promise execution.
- `v0.4.0`: RegExp execution.
- `v0.5.0`: generic method/interface support.
- `v0.6.0`: remaining BigInt surface.
- `v0.7.0+`: migration tooling, Wasm/WASI backend, and other larger tracks.

Pre-release tags use `-rc.N`, for example `v0.1.0-rc.1`. Prefer RC tags for
black-box validation before a final `v0.x.y` tag. Avoid `alpha` unless the user
explicitly wants experimental public preview artifacts.

Patch vs minor rule:

- Patch: existing promises preserved; fixes only.
- Minor: accepted syntax, runtime semantics, stdlib/package surface, artifact
  shape, or release UX meaningfully expands.

## Preflight

Start from a clean tree unless the user explicitly asks to release local
uncommitted work.

```sh
git status --short
pnpm run build
pnpm test
pnpm run build:release
```

`pnpm run build:release` is the local mirror of the release workflow. Generated
C warnings are expected unless `cc`, `pnpm`, or the final native compiler fails.

## RC Release Flow

Use this for a release candidate such as `v0.1.0-rc.1`.

1. Confirm the intended version from `MEMO.md` and the current release goal.
2. Ensure the release commit is the intended `HEAD`.
3. Create an annotated tag:

   ```sh
   git tag -a v0.1.0-rc.1 -m "Topaz v0.1.0-rc.1"
   ```

4. Push the tag only when the user has asked to publish the RC:

   ```sh
   git push origin v0.1.0-rc.1
   ```

5. Wait for the `release artifact` GitHub Actions workflow.
6. Confirm the draft GitHub Release has:

   - `topaz-darwin-arm64`
   - `SHA256SUMS`
   - a checksum that verifies with `shasum -a 256 -c SHA256SUMS`

7. Download the draft Release assets into a temporary directory and run the
   black-box compiler smoke from there:

   ```sh
   shasum -a 256 -c SHA256SUMS
   chmod +x ./topaz-darwin-arm64
   ./topaz-darwin-arm64 <repo>/examples/fib.ts -o ./fib
   ./fib
   ```

   The expected output is `5702887`. This specifically checks that the release
   binary does not depend on a checked-out `runtime/` directory.

8. Give a subagent or tester only the binary, checksum, README/MVP docs, and
   the validation prompt. Do not leak the expected answer unless the task is
   explicitly a guided check.

## Final Release Flow

Use this after an RC has passed black-box validation.

1. Apply any fixes and repeat preflight.
2. Create the final annotated tag, for example `v0.1.0`.
3. Push the tag to create/update the draft Release.
4. Verify the Actions artifact and release assets.
5. Download the draft Release assets and repeat the checksum + black-box
   compiler smoke from the RC flow.
6. Review release notes, known limitations, checksum, and docs.
7. Publish the GitHub Release manually.

Do not auto-publish a non-draft release from Codex. If the user explicitly asks
to publish, confirm that the draft assets, checksum, and release notes have
already been reviewed.

The release workflow opts JavaScript actions into Node.js 24 with
`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`; if GitHub changes that migration
path, update `.github/workflows/release-artifact.yml` before cutting the next
patch release.

## Recovery

- Wrong tag before push: delete it locally with `git tag -d <tag>`.
- Wrong tag after push: stop and ask; deleting remote release tags is a public
  history action.
- Failed workflow: inspect the run, fix in a new commit, then tag the next RC.
- Bad draft asset: rebuild by fixing the commit and pushing a new tag, or rerun
  the workflow only when the source commit is still the intended release commit.

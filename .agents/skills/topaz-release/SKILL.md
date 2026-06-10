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
- `v0.1.2`: already-published runtime prelude start / string-buffer boundary /
  substrate freshness release. Treat the public tag and GitHub Release as
  immutable history; do not retag it for later runtime checkpoint work.
- `v0.1.3`: runtime TS prelude checkpoint covering internal prelude injection,
  stable hidden prelude symbols for migrated pure helpers, closed legacy
  migration lanes, active StringBuffer / BigIntBuffer intrinsic substrate
  families, and pinned pre-v0.2 C substrate boundaries. It does not expand the
  public language surface or runtime semantics.
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

## Final Release Notes Format

Before publishing a non-RC final release such as `v0.1.2`, replace the draft
placeholder body with structured release notes. Do not publish a final release
whose notes are still the workflow placeholder such as "Draft native compiler
artifact release for ...".

Use this format, matching the `v0.1.1` release notes:

````md
Patch release for the Topaz single-binary MVP.

## Changes

- Summarize the release in 3-5 user-visible or maintainer-relevant bullets.
- Prefer tag-diff themes over listing every phase commit.
- Mention workflow, artifact, runtime, or diagnostic changes when they affect
  how the release should be consumed or trusted.

## Assets

- `topaz-darwin-arm64`: native Topaz compiler for Apple Silicon macOS.
- `SHA256SUMS`: checksum file for the compiler asset.

## Verification

Before publishing, the release asset was downloaded and verified with:

```sh
shasum -a 256 -c SHA256SUMS
chmod +x ./topaz-darwin-arm64
./topaz-darwin-arm64 <repo>/examples/fib.ts -o ./fib
./fib
```

The checksum passed and `fib` printed `5702887`.

## Notes

The compiler binary does not require Node.js, pnpm, or a checked-out `runtime/`
directory. It still invokes the platform C compiler (`cc`) when producing
native output.
````

For a minor release, keep the same section structure but adjust the opening
sentence from "Patch release ..." to the appropriate release type. If known
limitations changed, add them under `## Notes` without removing the binary
dependency note.

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

   - `isDraft: true`
   - `isPrerelease: true`
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
6. Write or update the release notes using the final release notes format
   above, then apply them with `gh release edit <tag> --notes-file <file>`.
7. Read the release back with
   `gh release view <tag> --json body,isDraft,isPrerelease,url` and confirm the
   notes are structured, non-placeholder, still draft, and not prerelease.
8. Review release notes, known limitations, checksum, and docs.
9. Publish the GitHub Release manually.

Do not auto-publish a non-draft release from Codex. If the user explicitly asks
to publish, confirm that the draft assets, checksum, and release notes have
already been reviewed.

The release workflow should use GitHub JavaScript action majors that target the
current runner runtime. If a release run emits an action runtime deprecation
annotation, update `.github/workflows/release-artifact.yml` before cutting the
next patch release.

## Recovery

- Wrong tag before push: delete it locally with `git tag -d <tag>`.
- Wrong tag after push: stop and ask; deleting remote release tags is a public
  history action.
- Failed workflow: inspect the run, fix in a new commit, then tag the next RC.
- Bad draft asset: rebuild by fixing the commit and pushing a new tag, or rerun
  the workflow only when the source commit is still the intended release commit.

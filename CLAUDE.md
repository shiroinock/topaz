# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Greenfield repository. As of this writing the tree contains only `README.md`, `LICENSE`, and a Node-flavored `.gitignore` — no source code, no `package.json`, no build/test tooling yet. The stated goal in `README.md` is:

> wanna make TypeScript compiler

Treat any request as either (a) bootstrapping the project (choosing a toolchain, scaffolding `package.json`/`tsconfig.json`, laying out the compiler pipeline) or (b) adding to a pipeline that does not yet exist. Confirm the intended toolchain before scaffolding — the `.gitignore` covers npm/yarn/pnpm/Vite/Next/etc. indiscriminately and does not imply a choice has been made.

## Commands

None yet. There is no build, lint, or test command to document until the project is scaffolded. Do not invent commands in this file; update it once real scripts exist in `package.json` (or equivalent).

## Architecture

None yet. Once the compiler takes shape, document the pipeline stages (e.g. scanner → parser → binder → checker → emitter) and where each lives, since that is the kind of cross-file structure that is hard to recover from reading individual files. Skip per-file descriptions — those can be discovered directly.

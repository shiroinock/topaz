# Topaz MVP Snapshot

This document is the MVP handoff note for someone who only has a Topaz binary
artifact and the documentation. It describes what the MVP can do, how to use the
compiler from this checkout, and where the current line is drawn.

## MVP Definition

Topaz uses TypeScript syntax as the frontend for a deliberately smaller native
language. The MVP promise is:

```text
Topaz-subset TypeScript source graph -> one native executable
```

The compiled program is a native binary. A repository checkout can also build a
self-hosted native compiler artifact with `pnpm run build:release`. The Node.js
CLI (`node dist/cli.js` or `pnpm run topaz`) remains the development/bootstrap
entry path, while the release artifact is the Node-free compiler binary.

## If You Only Received A Generated Binary

Run the included generated native binary directly:

```sh
./topaz-hello
```

Expected output for the validation binary:

```text
hello from topaz
```

This runtime-only check does not require Node.js, `pnpm`, or a repository
checkout.

## If You Received A Topaz Compiler Binary

Run the compiler binary directly:

```sh
./topaz-darwin-arm64 hello.ts -o hello
./hello
```

The compiler binary itself does not require Node.js or `pnpm`. It still invokes
the platform C compiler (`cc`) when producing a native output binary. Use
`--emit-c-only` to stop after generated C.

## Build The Compiler From A Repository Checkout

From the repository checkout:

```sh
pnpm install
pnpm run build
```

Then invoke the compiler through either command:

```sh
pnpm run topaz <entry.ts> -o build/app
node dist/cli.js <entry.ts> -o build/app
```

To build the native compiler release artifact from a checkout:

```sh
pnpm run build:release
```

This writes `dist-release/topaz-<os>-<arch>` and `dist-release/SHA256SUMS`.
The same release gate is available as the GitHub Actions `release artifact`
workflow. Manual runs upload the artifact and checksum as workflow artifacts;
`v*` tag pushes also create or update a draft GitHub Release.

## Compile And Run A Program From A Repository Checkout

Create a file:

```ts
// hello.ts
import { writeStdout } from "std/process";

function main(): void {
  writeStdout("hello from topaz\n");
}

main();
```

Compile and run it:

```sh
pnpm run topaz hello.ts -o build/hello
./build/hello
```

Expected output:

```text
hello from topaz
```

Use `--emit-c-only` to inspect generated C without invoking `cc`:

```sh
pnpm run topaz hello.ts -o build/hello --emit-c-only
```

## Import Surface

MVP user programs can use:

- Relative source imports such as `./lib` or `./lib.ts`.
- Public stdlib imports from `std/fs`, `std/path`, and `std/process`.
- Minimal package-root imports from `node_modules`.

Compatibility imports such as `node:*` exist for the compiler source and older
examples, but new user-facing code should prefer `std/*`.

## Public Stdlib

`std/fs`:

- `readFileSync(path, "utf8"): string`
- `existsSync(path): boolean`
- `writeFileSync(path, content): void`
- `mkdirSync(path, { recursive: true }): void`

`std/path`:

- `dirname(path): string`
- `resolve(path): string`
- `basename(path): string`
- `basename(path, ext): string`
- `extname(path): string`
- `join(...parts): string`

`std/process`:

- `argv: Array<string>`
- `exit(code): never`
- `writeStdout(value): void`
- `writeStderr(value): void`
- `writeError(value): void`

`writeError` accepts only `string` and appends a newline. `writeStdout` and
`writeStderr` write the string as-is.

## Minimal Package Lookup

Bare package imports are intentionally narrow. Topaz searches ancestor
`node_modules` directories and accepts only package roots:

```ts
import { value } from "pkg";
import { scoped } from "@scope/pkg";
```

Accepted package entry shapes:

- `package.json` with top-level `"topaz": "./src/index.ts"`.
- `package.json` with top-level `"topaz": "./src/index.js"`, which maps to the
  matching `.ts` source.
- Package root `index.ts` when no `"topaz"` field is present.

Rejected package shapes:

- Package subpaths such as `pkg/subpath`.
- `main`, `exports`, conditional exports, and CommonJS entry points.
- npm install behavior, lifecycle scripts, and Node runtime emulation.
- Package entry paths that escape the package root.
- Package entry extensions other than `.ts` and `.js`-to-`.ts`.

## Important Language Boundaries

Topaz is not JavaScript with a native backend. The subset is intentional:

- Conditions must be `boolean`; truthy/falsy coercion is not supported.
- Use `===` and `!==`; `==` and `!=` are rejected.
- `let` and `const` require initializers; `var` is unsupported.
- Strings are immutable ASCII strings.
- `throw` values must be class instances.
- `Map.get(k)` returns `V | undefined`; narrow before using the value.
- `Set` and `Map` iteration order is hash order, not insertion order.
- Unsupported syntax should stop at compile time with a clear diagnostic.

This list is enough for the MVP handoff. A repository checkout contains a fuller
divergence list in `AGENTS.md`.

## Diagnostics

Unsupported syntax, unsupported package shapes, and type mismatches should stop
compilation. When a source position is available, diagnostics should include:

```text
file:line:col
```

Treat an unsupported diagnostic as the expected boundary, not as a request to
emulate JavaScript behavior.

## Black-Box Usage Checklist

For an external validation run, give the tester only:

- This document.
- A Topaz-generated native binary for runtime-only validation.
- A `topaz-<os>-<arch>` compiler binary if they need to compile new source
  without Node.js.
- A repository checkout plus `pnpm` only if they need to rebuild the compiler
  artifact or run development gates.

Ask them to verify:

- The generated native binary runs without Node.js.
- The compile instructions create one runnable output binary from a simple
  `hello.ts`.
- `std/process` can print output.
- Unsupported package shapes fail clearly when attempted.
- The documentation distinguishes the Node-based development/bootstrap CLI from
  the native compiler release artifact.

## Post-MVP

The following are intentionally after the MVP:

- Capability inference, manifest generation, `doctor`, `check`, and `explain`.
- Runtime sandboxing.
- Async/await and Promise execution.
- Regexp execution.
- Richer package support, package subpaths, `exports`, CommonJS, and npm
  compatibility.
- Published non-draft GitHub Releases, signing, and notarization.

# Topaz

Topaz is an AOT native compiler for a deliberately small TypeScript-syntax
language. It uses TypeScript syntax as the frontend, but it does not try to
preserve JavaScript semantics: unsupported syntax, module shapes, and package
forms are rejected at compile time instead of being emulated.

## Setup

```sh
pnpm install
pnpm run build
pnpm test
```

When `runtime/runtime.h` changes, refresh the embedded compiler copy before
testing:

```sh
pnpm run generate:runtime-header
pnpm run check:runtime-header
```

## Compile And Run

The MVP entry path is zero-config: give Topaz a `.ts` entry file and it emits
one native binary for the loaded source graph.

```sh
pnpm run topaz examples/fib.ts -o build/fib
./build/fib
```

Use `--emit-c-only` when you want to inspect the generated C without invoking
`cc`:

```sh
pnpm run topaz examples/fib.ts -o build/fib --emit-c-only
```

## Native Compiler Artifact

The self-hosted compiler can be built as a native binary:

```sh
pnpm run build:release
```

This first checks that `src/runtime_header.ts` is fresh, then runs the self-host
fixed-point gate and writes:

- `dist-release/topaz-darwin-arm64` on Apple Silicon macOS.
- `dist-release/SHA256SUMS`.

The release artifact is the native compiler. It can compile a Topaz-subset
source graph without Node.js or a checked-out `runtime/` directory. Downloaded
GitHub Release assets may need `chmod +x` before first use:

```sh
(
  cd dist-release
  shasum -a 256 -c SHA256SUMS
)
chmod +x ./dist-release/topaz-darwin-arm64
./dist-release/topaz-darwin-arm64 examples/fib.ts -o build/fib
./build/fib
```

The same artifact can be built by GitHub Actions with the `release artifact`
workflow. Manual runs upload `topaz-darwin-arm64` and `SHA256SUMS` as workflow
artifacts; `v*` tag pushes also create or update a draft GitHub Release with
those assets.

## Public Stdlib

Public user code should import supported helpers from:

- `std/fs`
- `std/path`
- `std/process`

The compiler source still keeps some compatibility imports such as `node:*`,
but those are not the public surface for new Topaz programs.

## Package Lookup

Topaz can resolve minimal source packages from `node_modules` without a config
file:

- Package roots only: `pkg` and `@scope/pkg`.
- Accepted entry points: package.json `"topaz": "./src/index.ts"` or a package
  root `index.ts`.
- A `"topaz"` entry ending in `.js` maps to the corresponding `.ts` source.

Unsupported package shapes are outside the MVP and are rejected at the package
boundary: package subpaths, npm install behavior, CommonJS, `main`, `exports`,
conditional exports, lifecycle scripts, and Node emulation are not supported.

## MVP Boundary

The MVP is `topaz <entry.ts>` compiling a Topaz-subset TypeScript source graph
to one native binary with no required config file. Relative imports, the public
stdlib modules above, minimal package-root lookup, and clear diagnostics for
unsupported syntax/module/package shapes are in scope.

See [docs/mvp.md](docs/mvp.md) for the full MVP snapshot and black-box usage
checklist.

Post-MVP work includes capabilities, manifest generation, `doctor`, `check`,
`explain`, async/await, regexp, richer package support, and runtime sandboxing.

Diagnostics should stop compilation with `file:line:col` where the compiler has
a source position for the unsupported construct.

## CLI

```sh
node dist/cli.js --help
```

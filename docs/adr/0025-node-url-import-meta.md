# 0025 — node:url.fileURLToPath + import.meta.url

- **Status**: Accepted
- **Date**: 2026-05-30
- **Phase**: 1.5-6 prep #25

## Context

`src/cli.ts:5-6` の `import { parseArgs } from "node:util"` / `import { fileURLToPath } from "node:url"` のうち、後者と `cli.ts:85` の `dirname(fileURLToPath(import.meta.url))` を解禁するための prep。[0024](./0024-node-child-process-exec.md) `node:child_process.execFileSync` まで揃って残る cli.ts blocker は `node:util` / `node:url` の 2 specifier。`node:util.parseArgs` は call-site ごとに anon class を合成して `values` の hyphenated field 名を ElementAccess に流し、なおかつ `boolean | undefined` / `string | undefined` を truthy/falsy 条件で読む 3 連の divergence 解消が必要で、prep の単発 substep には大きすぎる。一方 `node:url.fileURLToPath` は単一引数 string → string で、組で必要な `import.meta.url` も `MetaProperty` の認識を入れるだけで lowering が閉じる。1.5-6h (cli.ts Topaz 化) で argv 手書きに倒すまでの繋ぎとして先に本対を着地させ、`node:util.parseArgs` は次の prep #26 ないし 1.5-6h で扱う。

## Decision

`node:url` specifier の named import allowlist に `fileURLToPath` を 1 つだけ追加し、`fileURLToPath(url: string): string` を **call-site 限定 shortcut** で受理する。あわせて `import.meta.url` を **唯一の MetaProperty 経路**として解禁し、`topaz_runtime_module_url()`(file:// + realpath of executable)に lower する。fileURLToPath は POSIX 限定で、`file://` prefix + 空 / `localhost` authority のみ受理、percent-decode したバイト列を arena に複製して返す。`import.meta.url` 以外の `import.meta.X` / 裸の `import.meta` / `new.target` はすべて CodegenError で reject。

却下案: A=`URL` / `URLSearchParams` / `pathToFileURL` 等の他 named import も同時に解禁(理由: cli.ts は `fileURLToPath` しか使わず、URL クラス本体は class 表現 + 多数の method で scope が大きい。必要になったら拡張)。B=`fileURLToPath` を bare value で参照可能にする(理由: 他の stdlib shortcut (`readFileSync` / `dirname` 等) と揃えて call-site 限定にし、`unknown identifier` で fall させる方が将来のオーバーロード余地が広い)。C=`import.meta.url` を modulewise の "そのソースファイルの URL" に lower(理由: native binary では module 概念が link 後に消えるので無意味、self-hosting で実用上欲しいのは「runtime/ ディレクトリの起点」=実行バイナリ位置の方)。D=`fileURLToPath` を Windows path も含めて Node 互換(理由: Topaz の self-hosting 想定環境は POSIX、Windows 対応は drive letter + backslash の分岐が増えて scope が広がる)。E=`import.meta.url` のキャッシュなし呼び(理由: プロセスライフタイム内で答えは変わらず、毎回 syscall を打つ理由がない)。

## Implementation

- `src/loader.ts:141-149` の `STDLIB_SPECIFIERS` に `node:url` → `Set(["fileURLToPath"])` を 1 行追加。loader 側は他 stdlib と同じ allowlist 検査経路 (`validateStdlibImport`) を共有。
- `src/codegen.ts:6508-6512` (emitCall) / `8460-8464` (inferType): identifier `fileURLToPath` を `execFileSync` の直後に dispatch。
- `src/codegen.ts:7180-7204` に `checkNodeUrlFileURLToPathArgs` / `emitNodeUrlFileURLToPath` を追加。1 引数 string を要求し `topaz_url_file_url_to_path(url)` に lower。
- `src/codegen.ts:5581-5590` (emitExpression) / `7882-7891` (inferType): `ts.isPropertyAccessExpression(expr) && ts.isMetaProperty(expr.expression)` を最初に拾って `checkImportMetaUrl` 経由で `topaz_runtime_module_url()` / `T_STRING` に lower。直後に bare `ts.isMetaProperty(expr)` を `rejectBareMetaProperty` で reject(MetaProperty が PropertyAccessExpression の expression 位置に無いケース = 単独使用)。
- `src/codegen.ts:7206-7240`: `checkImportMetaUrl` は `keywordToken === ImportKeyword` / `name === "meta"` / RHS `name === "url"` の 3 条件を順に検査して各々で別エラー文を出し、`rejectBareMetaProperty` は `new.target` と `import.meta` を分けて reject。
- `runtime/runtime.h:17-19` で `<mach-o/dyld.h>` を `__APPLE__` 限定 include。
- `runtime/runtime.h:903-1005` に `topaz_url_file_url_to_path` / `topaz_runtime_module_url` を `topaz_child_exec_inherit` 直後に配置。前者は `file://` prefix + 空 / `localhost` host のみ受理、`%XX` を 1 バイトに decode し arena に複製。後者は `__APPLE__` で `_NSGetExecutablePath`、`__linux__` で `readlink("/proc/self/exe")`、realpath 正規化 + `file://` prefix を **static char[4096] にキャッシュ**して 2 回目以降は syscall を打たない。

## Consequences

- **受理**: `import { fileURLToPath } from "node:url"` の named import、`fileURLToPath(url)` の 1 引数 string 呼び出し、`file://path` / `file:///path` / `file://localhost/path` の URL、`%XX` の percent-decode、`import.meta.url` のみの MetaProperty 経路。
- **reject**: `node:url` から `fileURLToPath` 以外の named import (URL / URLSearchParams / pathToFileURL / ...)、fileURLToPath の引数 0 / 2 個以上、非 string 引数、bare value 使用、`file:` 以外の scheme / 非 `localhost` の host、非絶対パス、不正な percent-encoding、`import.meta` の bare 使用、`import.meta.url` 以外の property、`new.target`。
- **回帰**: positive `node_url_basic`(`import.meta.url` の `file://` prefix 検査 / fileURLToPath 後の絶対パス検査 / basename が test slug と一致 / dirname 非空 / `%20`+`%2F` decode / `localhost` authority の計 9 行 stdout)、fail `node_url_arity_fail` / `node_url_type_fail` / `node_url_as_value_fail` / `node_url_unknown_named_import_fail` / `import_meta_bare_fail` / `import_meta_wrong_prop_fail`。累計 254 ケース、`npm test` 全 pass。
- **scope 外 / 将来課題**: `pathToFileURL`、`URL` / `URLSearchParams` class、Windows path 変換、`file://` 以外の scheme、`new.target`、`import.meta.resolve` / 他 property、他言語 stdlib path API。cli.ts の次の blocker は `node:util.parseArgs`(prep #26 or 1.5-6h で扱う)。

## Notes

- 同じ call-site shortcut 機構: prep #13 `readFileSync`、prep #17 [0017](./0017-node-fs-exists-sync.md)、prep #18 [0018](./0018-node-path-dirname-resolve.md)、prep #19 [0019](./0019-node-fs-write-file-sync.md)、prep #20 [0020](./0020-node-fs-mkdir-sync.md)、prep #21 [0021](./0021-node-path-basename.md)、prep #22 [0022](./0022-node-path-extname.md)、prep #23 [0023](./0023-node-path-join.md)、prep #24 [0024](./0024-node-child-process-exec.md)。
- MetaProperty を識別子経路の前段で拾うパターンは初例。今後 `new.target` を解禁する場合も `rejectBareMetaProperty` の分岐を組み替える形で同じ場所に同居させられる。

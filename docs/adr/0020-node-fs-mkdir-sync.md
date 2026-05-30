# 0020 — node:fs.mkdirSync (recursive only)

- **Status**: Accepted
- **Date**: 2026-05-30
- **Phase**: 1.5-6 prep #20

## Context

`src/cli.ts` を self-hosting サブセットに通す経路で、[0019](./0019-node-fs-write-file-sync.md)
が `writeFileSync` を解禁した時点で同 import 行 `import { mkdirSync, readFileSync,
writeFileSync } from "node:fs"` (`cli.ts:3`) の残った blocker が `mkdirSync` だった。
cli.ts は出力 path の親ディレクトリを `mkdirSync(dirname(output), { recursive: true })`
で確保するため、第 2 引数の object literal を読まなければならない — `readFileSync` /
`existsSync` / `writeFileSync` までの単純 N-string 引数の shortcut では扱えない。

## Decision

`node:fs.mkdirSync(path: string, { recursive: true }): void` を同じ **call-site 限定
shortcut** として追加し、**recursive-only に固定**する。第 2 引数は syntactic な object
literal でなければならず、property は `recursive: true` の 1 つだけ。変数 / 別 shape /
`recursive: false` / 追加 property はすべて codegen で reject。runtime は
`topaz_fs_mkdir_p(path)` 1 本に lower、segment 単位で `mkdir(prefix, 0777)` を呼んで
EEXIST は ignore (= `mkdir -p` 相当)。返り値は void で、[0019](./0019-node-fs-write-file-sync.md)
の `writeFileSync` 同様 `inferType` 経路で「returns void and cannot be used as a value」
を投げる。

却下案: A=options 引数を省略可能にして常に recursive(理由: Node の `mkdirSync(path)` は
non-recursive で意味が divergence する。call-site で `{ recursive: true }` を明示させた
方が読み手に意図が伝わる)。B=`recursive: false` も受理し runtime で分岐(理由:
non-recursive mode は self-hosting でも cli.ts でも使わない、scope を絞って実装を 1 本に
留める方が ADR の粒度を保てる)。C=options を任意 object として受けて property を runtime
で読む(理由: object literal の C ABI を介する必要があり、`Set` / `Map` レベルの大物。
syntactic literal を call-site で固定する方が prep の趣旨に合う)。D=options 引数も
runtime 側で `{recursive: true}` の C 値を構築(理由: 同上、scope の無駄)。

## Implementation

- `runtime/runtime.h:1-16` で `<errno.h>` / `<sys/stat.h>` を include 追加。
- `runtime/runtime.h:255-294` に `topaz_fs_mkdir_p(topaz_string path)`。先頭の `/` を
  飛ばし、以降は `/` を挟む各 prefix を null 終端で切り出して `mkdir(prefix, 0777)`、
  EEXIST は ignore、それ以外は abort。末尾 `/` の有無に関わらず最終 prefix を mkdir する
  形に書く(初版は `i <= path.len` の境界条件で無限ループしたため、`while (i < path.len)`
  に分けて末尾 prefix を loop 外で mkdir)。
- `src/loader.ts:140` の `STDLIB_SPECIFIERS` の `node:fs` allow set に `mkdirSync` を
  追加。
- `src/codegen.ts` emitCall identifier 分岐に `mkdirSync` → `emitNodeFsMkdirSync`
  (`writeFileSync` 分岐の直後)。inferType identifier 分岐に同名 →
  `CodegenError("returns void and cannot be used as a value")`。
- `src/codegen.ts` に `checkNodeFsMkdirSyncArgs` / `emitNodeFsMkdirSync` を
  `emitNodeFsWriteFileSync` の直後に追加。第 2 引数は `ts.isObjectLiteralExpression` を
  通り、`properties.length === 1`、property は `PropertyAssignment`、name は identifier
  `recursive`、initializer は `TrueKeyword` であることを順に検査する。

## Consequences

- **受理**: `mkdirSync(path, { recursive: true })`(path は string、変数 / 関数 param /
  式結果も可)。文として呼び出す形のみ。runtime は `mkdir -p` 相当の挙動で既存ディレクトリは
  no-op。
- **reject**: 引数 0/1/3 個以上、path が非 string、第 2 引数が object literal 以外(変数
  含む)、property が 0 個 or 2 個以上、property name が `recursive` でない、initializer が
  リテラル `true` でない、bare value 利用、`const r = mkdirSync(...)` 等の value 文脈使用。
- **回帰**: positive `node_fs_mkdir`、fail `node_fs_mkdir_arity_fail` /
  `node_fs_mkdir_path_type_fail` / `node_fs_mkdir_opts_not_object_fail` /
  `node_fs_mkdir_opts_wrong_key_fail` / `node_fs_mkdir_opts_recursive_false_fail` /
  `node_fs_mkdir_opts_extra_prop_fail` / `node_fs_mkdir_as_value_fail`。既存
  `node_fs_unknown_named_import_fail` は `mkdirSync` を `unlinkSync` に差し替え。累計
  226 ケース、`npm test` 全 pass。
- **scope 外 / 将来課題**: `mkdirSync(path)` の non-recursive、`mode` option、`{ recursive:
  true }` を持つ任意の variable / fn 戻り値からの options 渡し、`unlinkSync` /
  `rmdirSync` / `rmSync` 等の他 fs API。`cli.ts:3` の import 行はこれで全 named import が
  通る — `cli.ts` の次の blocker は `node:child_process` / `node:util` / `node:url` の
  namespace / 専用 API(prep #21 以降または 1.5-6h の rewrite で扱う)。

## Notes

- 同じ call-site shortcut 機構: prep #13 `readFileSync`、prep #17 `existsSync`
  ([0017](./0017-node-fs-exists-sync.md))、prep #18 `dirname`/`resolve`
  ([0018](./0018-node-path-dirname-resolve.md))、prep #19 `writeFileSync`
  ([0019](./0019-node-fs-write-file-sync.md))。
- void 戻り型の reject パターン: `Array.push` / `console.log` / `writeFileSync` と同じく
  `inferType` 経路で明示 CodegenError を投げる方式。
- syntactic object literal を call-site で要求するパターンは Topaz 初。同等の方針が必要に
  なれば(例えば `JSON.stringify(value, null, 2)` の第 3 引数 indent 等)この実装が雛形。

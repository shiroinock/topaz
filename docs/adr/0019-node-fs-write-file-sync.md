# 0019 — node:fs.writeFileSync (utf8, 2-arg)

- **Status**: Accepted
- **Date**: 2026-05-30
- **Phase**: 1.5-6 prep #19

## Context

`src/cli.ts` を self-hosting サブセットに通す経路で、[0017](./0017-node-fs-exists-sync.md)
`existsSync` と [0018](./0018-node-path-dirname-resolve.md) `dirname`/`resolve`
を解禁した後、`src/cli.ts:3` の `import { mkdirSync, readFileSync, writeFileSync }
from "node:fs"` のうち `writeFileSync` がまだ allow set 外で loader が
`unsupported named import 'writeFileSync'` で落とす。同 import 行に `mkdirSync`
も並んでいるが、`mkdirSync` は options 引数 (`{ recursive: true }`) の object
literal を要するため別作業に切り出す。今回は `writeFileSync` 単体の解禁に絞る。

## Decision

`node:fs.writeFileSync(path: string, content: string): void` を [0017](./0017-node-fs-exists-sync.md)
の `existsSync` および prep #13 `readFileSync` と同じ **call-site 限定の
syntactic shortcut**
として追加する。encoding は implicit utf8 で、Node の 3 引数目 (encoding /
options) は受けない。返り値は void で、`console.log` / `Array.push` と同じく
`inferType` 経路で「returns void and cannot be used as a value」を投げる。
runtime は `topaz_fs_write_text_file(path, content)` を `fopen("wb") + fwrite +
fclose` で実装、`O_TRUNC` 等価で既存ファイルを上書きする (Node の既定挙動)。
path/content は `topaz_string` なので NUL 終端のため `arena_alloc` でコピー。

却下案: A=encoding 引数を必須化して `writeFileSync(path, content, "utf8")` に
固定する(理由: `cli.ts:78` の現行コードが 2 引数で書かれており、self-hosting
鏡像のための prep という目的に逆行する。読み書き対称性を取るより呼び出し側の
書き換えを減らす方を優先)。B=`mkdirSync` も同時投入(理由: `{ recursive: true }`
の object literal 引数を読む lowering を要するため scope が広がる。同 import
行の通過は `mkdirSync` 解禁時 (prep #20 を予定) にまとめて行う方が ADR の粒度を
保てる)。C=Buffer 引数も受ける(理由: Topaz 方言に Buffer 型がない、string 限定
で十分)。

## Implementation

- `runtime/runtime.h:232-251` に `topaz_fs_write_text_file(topaz_string path,
  topaz_string content)`(`fopen "wb"` + `fwrite` + `fclose`、短書込みは abort)。
- `src/loader.ts:138-141` の `STDLIB_SPECIFIERS` の `node:fs` allow set に
  `writeFileSync` を追加。
- `src/codegen.ts` emitCall identifier 分岐に `writeFileSync` →
  `emitNodeFsWriteFileSync`(`existsSync` 分岐の直後)。inferType identifier
  分岐に同名 → `CodegenError("returns void and cannot be used as a value")`。
- `src/codegen.ts` に `checkNodeFsWriteFileSyncArgs`(2 引数・両方 string)+
  `emitNodeFsWriteFileSync` を `emitNodeFsExistsSync` の直後に追加。

## Consequences

- **受理**: `writeFileSync(path, content)`(両 string、変数 / 関数 param / 式
  結果 / template literal の content も可)。文として呼び出す形のみ。出力は
  Node `writeFileSync(path, content, "utf8")` と byte 単位で一致(既存上書き)。
- **reject**: 引数 0/1/3 個、非 string path / content、bare value 利用
  (`unknown identifier 'writeFileSync'`)、`const r = writeFileSync(...)` /
  `console.log(writeFileSync(...))` 等の value 文脈使用、`node:fs` からの
  `mkdirSync` 等の他 named import(prep #20 以降)。
- **回帰**: positive `node_fs_write_file`、fail `node_fs_write_file_arity_fail` /
  `node_fs_write_file_path_type_fail` / `node_fs_write_file_content_type_fail` /
  `node_fs_write_file_as_value_fail`。既存 `node_fs_unknown_named_import_fail`
  は `writeFileSync` を `mkdirSync` に差し替え。累計 221 ケース、`npm test`
  全 pass。
- **scope 外 / 将来課題**: `mkdirSync({ recursive: true })`、`unlinkSync`、
  `appendFileSync`、Buffer 引数。`cli.ts:3` の import 行は `mkdirSync` 解禁待ち
  (prep #20)。`writeFileSync` は subset 内で予約 builtin になり、同名の user
  関数を call-site で shadow する(`readFileSync` 等と同じ既知の divergence)。

## Notes

- 同じ call-site shortcut 機構: prep #13 `readFileSync`、prep #17 `existsSync`
  ([0017](./0017-node-fs-exists-sync.md))、prep #18 `dirname`/`resolve`
  ([0018](./0018-node-path-dirname-resolve.md))。
- void 戻り型の reject パターン: `Array.push` / `console.log` と同じく
  `inferType` 経路で明示 CodegenError を投げる方式。

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as ts from "typescript";

import { parseFile } from "./parser.js";

// Phase 1.5-2: ES module 静的解決。CLI から root を渡され、`import` を DFS で
// 辿って依存グラフを構築する。返り値は topological 順 (依存が先、root が最後)
// の SourceFile 配列。codegen 側はこの配列を順に flatten するだけで済む。
//
// 設計上の制約 (CLAUDE.md / docs/archive/self-hosting-inventory.md §6):
// - 相対パス (`./foo` / `../foo` / `./foo.js`) のみ受ける。`.js` 拡張子は `.ts`
//   に解決する (TS のお作法どおり、source 側は `.js` で書く)。
// - `node:*` / bare specifier / 絶対パスは parser 戦略 (1.5-6) 側に降ろすため
//   ここで明示エラーにする。
// - default import / namespace import / rename import は未対応。
// - 循環依存はエラー。
export type ModuleGraph = {
  // topological 順。root が末尾。
  files: ts.SourceFile[];
  // 絶対パス (resolve 済み) の Set。重複読込防止用。
  loaded: Set<string>;
};

export function loadModuleGraph(rootPath: string): ModuleGraph {
  const root = resolve(rootPath);
  const loaded = new Map<string, ts.SourceFile>();
  const order: ts.SourceFile[] = [];
  // DFS の path stack: 循環検出用。
  const visiting = new Set<string>();

  function visit(absPath: string, importedFrom: { file: string; spec: ts.StringLiteralLike } | null): void {
    if (loaded.has(absPath)) return;
    if (visiting.has(absPath)) {
      // 循環。importedFrom 側のソース位置を添えて落とす (root を含むため
      // importedFrom は null になり得ない: visiting に入っている時点で別 module
      // からの再帰呼び出しなので import 元が存在する)。
      const from = importedFrom!;
      throw new LoaderError(
        from.file,
        from.spec,
        `circular import detected: '${absPath}' is already being loaded`,
      );
    }
    visiting.add(absPath);
    if (!existsSync(absPath)) {
      if (importedFrom) {
        throw new LoaderError(
          importedFrom.file,
          importedFrom.spec,
          `cannot resolve module '${importedFrom.spec.text}' (looked for '${absPath}')`,
        );
      }
      throw new Error(`topaz: cannot resolve module '${absPath}'`);
    }
    const sf = parseFile(absPath);
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      const specNode = stmt.moduleSpecifier as ts.StringLiteralLike;
      const specText = specNode.text;
      // Phase 1.5-6 prep #13: `node:fs` は loader 側で「stdlib specifier」
      // として受理し、visit を skip。named import の名前リスト validation だけ
      // 別経路 (validateStdlibImport) で走らせて、codegen 側で個別の identifier
      // を syntactic shortcut として処理する。
      if (isStdlibSpecifier(specText)) {
        validateStdlibImport(absPath, stmt, specText);
        continue;
      }
      validateImport(absPath, stmt);
      const target = resolveSpecifier(absPath, specNode, specText);
      visit(target, { file: absPath, spec: specNode });
    }
    visiting.delete(absPath);
    loaded.set(absPath, sf);
    order.push(sf);
  }

  visit(root, null);
  return { files: order, loaded: new Set(loaded.keys()) };
}

class LoaderError extends Error {
  constructor(file: string, node: ts.Node, message: string) {
    const sf = node.getSourceFile();
    if (sf) {
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      super(`${file}:${line + 1}:${character + 1}: ${message}`);
    } else {
      super(`${file}: ${message}`);
    }
  }
}

function validateImport(filePath: string, stmt: ts.ImportDeclaration): void {
  // `import "./foo.js"` (side-effect-only) は OK、依存追加のみ。
  if (!stmt.importClause) return;
  const clause = stmt.importClause;
  if (clause.isTypeOnly) {
    throw new LoaderError(filePath, stmt, "`import type` is unsupported (Phase 1.5-2)");
  }
  if (clause.name) {
    throw new LoaderError(
      filePath,
      stmt,
      "default import (`import X from \"...\"`) is unsupported (Phase 1.5-2)",
    );
  }
  const named = clause.namedBindings;
  if (!named) return;
  if (ts.isNamespaceImport(named)) {
    throw new LoaderError(
      filePath,
      stmt,
      "namespace import (`import * as X from \"...\"`) is unsupported (Phase 1.5-2)",
    );
  }
  if (!ts.isNamedImports(named)) {
    throw new LoaderError(filePath, stmt, "unsupported import form");
  }
  for (const el of named.elements) {
    if (el.isTypeOnly) {
      throw new LoaderError(filePath, el, "`import type` is unsupported (Phase 1.5-2)");
    }
    if (el.propertyName) {
      throw new LoaderError(
        filePath,
        el,
        "import rename (`import { a as b }`) is unsupported (Phase 1.5-2)",
      );
    }
  }
}

// Phase 1.5-6 prep #13: stdlib specifier。loader は visit を skip し、import
// 経由で取り込んだ識別子は codegen 側で syntactic shortcut として処理する。
// 現状は `node:fs` から `readFileSync` / `existsSync` (1.5-6 prep #17) /
// `writeFileSync` (1.5-6 prep #19) / `mkdirSync` (1.5-6 prep #20)、
// `node:path` から `dirname` / `resolve` (1.5-6 prep #18) /
// `basename` (1.5-6 prep #21) / `extname` (1.5-6 prep #22) /
// `join` (1.5-6 prep #23) を受理。
const STDLIB_SPECIFIERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["node:fs", new Set(["readFileSync", "existsSync", "writeFileSync", "mkdirSync"])],
  ["node:path", new Set(["dirname", "resolve", "basename", "extname", "join"])],
]);

function isStdlibSpecifier(spec: string): boolean {
  return STDLIB_SPECIFIERS.has(spec);
}

function validateStdlibImport(filePath: string, stmt: ts.ImportDeclaration, spec: string): void {
  const allowed = STDLIB_SPECIFIERS.get(spec)!;
  // side-effect-only `import "node:fs"` は意味が無いので明示エラー。
  if (!stmt.importClause) {
    throw new LoaderError(
      filePath,
      stmt,
      `side-effect-only import of stdlib specifier '${spec}' is unsupported`,
    );
  }
  const clause = stmt.importClause;
  if (clause.isTypeOnly) {
    throw new LoaderError(filePath, stmt, "`import type` is unsupported (Phase 1.5-2)");
  }
  if (clause.name) {
    throw new LoaderError(
      filePath,
      stmt,
      `default import from stdlib specifier '${spec}' is unsupported`,
    );
  }
  const named = clause.namedBindings;
  if (!named) {
    throw new LoaderError(filePath, stmt, `stdlib import from '${spec}' requires named bindings`);
  }
  if (ts.isNamespaceImport(named)) {
    throw new LoaderError(
      filePath,
      stmt,
      `namespace import of stdlib specifier '${spec}' is unsupported`,
    );
  }
  if (!ts.isNamedImports(named)) {
    throw new LoaderError(filePath, stmt, "unsupported import form");
  }
  for (const el of named.elements) {
    if (el.isTypeOnly) {
      throw new LoaderError(filePath, el, "`import type` is unsupported (Phase 1.5-2)");
    }
    if (el.propertyName) {
      throw new LoaderError(
        filePath,
        el,
        "import rename (`import { a as b }`) is unsupported (Phase 1.5-2)",
      );
    }
    if (!allowed.has(el.name.text)) {
      throw new LoaderError(
        filePath,
        el,
        `unsupported named import '${el.name.text}' from stdlib specifier '${spec}' (allowed: ${Array.from(allowed).join(", ")})`,
      );
    }
  }
}

function resolveSpecifier(fromFile: string, node: ts.StringLiteralLike, spec: string): string {
  // 受け入れるのは相対パスのみ。`node:*` / npm bare / 絶対パスは明示エラー。
  // node:* は parser 戦略 (1.5-6) と地続きなのでここでは降ろさない。
  if (!spec.startsWith("./") && !spec.startsWith("../")) {
    throw new LoaderError(
      fromFile,
      node,
      `non-relative module specifier '${spec}' is unsupported (only './foo' / '../foo' allowed in Phase 1.5-2)`,
    );
  }
  const fromDir = dirname(fromFile);
  // `.js` 拡張子で書かれていたら `.ts` に置き換える (TS の慣習)。
  let candidate: string;
  if (spec.endsWith(".js")) {
    candidate = resolve(fromDir, spec.slice(0, -3) + ".ts");
  } else if (spec.endsWith(".ts")) {
    // `.ts` 直書きも受ける (loader 内部で正規化しておく)。
    candidate = resolve(fromDir, spec);
  } else {
    candidate = resolve(fromDir, spec + ".ts");
  }
  return candidate;
}

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ImportDecl, ImportSpecifier, SourceModule } from "./ast.js";
import { parseFile } from "./topaz_parser.js";

// Phase 1.5-6g-1: production loading now uses the native Topaz parser. The
// loader still owns module-specifier validation, DFS order, and cycle errors;
// codegen owns the non-root executable statement policy.
export type ModuleGraph = {
  // topological 順。root が末尾。
  files: SourceModule[];
  // 絶対パス (resolve 済み) の Set。重複読込防止用。
  loaded: Set<string>;
};

type ImportSite = {
  file: string;
  module: SourceModule;
  stmt: ImportDecl;
};

export function loadModuleGraph(rootPath: string): ModuleGraph {
  const root = resolve(rootPath);
  const state = new LoaderState();
  state.visit(root, undefined);
  return { files: state.order, loaded: state.loadedPaths() };
}

class LoaderState {
  loaded: Map<string, SourceModule> = new Map<string, SourceModule>();
  order: Array<SourceModule> = [];
  visiting: Set<string> = new Set<string>();

  visit(absPath: string, importedFrom: ImportSite | undefined): void {
    if (this.loaded.has(absPath)) return;
    if (this.visiting.has(absPath)) {
      if (importedFrom !== undefined) {
        throw loaderErrorAt(
          importedFrom.file,
          importedFrom.module,
          importedFrom.stmt.modulePathPos,
          `circular import detected: '${absPath}' is already being loaded`,
        );
      }
      return;
    }
    this.visiting.add(absPath);
    if (!existsSync(absPath)) {
      if (importedFrom !== undefined) {
        throw loaderErrorAt(
          importedFrom.file,
          importedFrom.module,
          importedFrom.stmt.modulePathPos,
          `cannot resolve module '${importedFrom.stmt.modulePath}' (looked for '${absPath}')`,
        );
      }
      throw new LoaderError(`topaz: cannot resolve module '${absPath}'`);
    }
    const mod = parseFile(absPath);
    for (const item of mod.items) {
      if (item.kind !== "module_decl") continue;
      const decl = item.decl;
      if (decl.kind !== "import_decl") continue;
      const specText = decl.modulePath;
      if (isStdlibSpecifier(specText)) {
        validateStdlibImport(absPath, mod, decl, specText);
        continue;
      }
      validateImport(absPath, mod, decl);
      const target = resolveSpecifier(absPath, mod, decl, specText);
      this.visit(target, { file: absPath, module: mod, stmt: decl });
    }
    this.visiting.delete(absPath);
    this.loaded.set(absPath, mod);
    this.order.push(mod);
  }

  loadedPaths(): Set<string> {
    const out = new Set<string>();
    for (const path of this.loaded.keys()) {
      out.add(path);
    }
    return out;
  }
}

export class LoaderError {
  message: string;
  constructor(message: string) {
    this.message = message;
  }
}

function loaderErrorAt(file: string, module: SourceModule, pos: number, message: string): LoaderError {
  const loc = posToLineCol(module, pos);
  return new LoaderError(`${file}:${loc.line}:${loc.col}: ${message}`);
}

function posToLineCol(module: SourceModule, pos: number): { line: number; col: number } {
  let lineIndex = 0;
  for (let i = 0; i < module.lineStarts.length; i++) {
    const lineStart = module.lineStarts[i];
    if (lineStart > pos) break;
    lineIndex = i;
  }
  return { line: lineIndex + 1, col: pos - module.lineStarts[lineIndex] + 1 };
}

function validateImport(filePath: string, module: SourceModule, stmt: ImportDecl): void {
  if (stmt.isTypeOnly) {
    throw loaderErrorAt(filePath, module, stmt.pos, "`import type` is unsupported (Phase 1.5-2)");
  }
  if (stmt.defaultName !== undefined) {
    throw loaderErrorAt(
      filePath,
      module,
      stmt.defaultNamePos,
      "default import (`import X from \"...\"`) is unsupported (Phase 1.5-2)",
    );
  }
  if (stmt.namespaceName !== undefined) {
    throw loaderErrorAt(
      filePath,
      module,
      stmt.namespaceNamePos,
      "namespace import (`import * as X from \"...\"`) is unsupported (Phase 1.5-2)",
    );
  }
  for (const el of stmt.specifiers) {
    validateImportSpecifier(filePath, module, el);
  }
}

function validateImportSpecifier(filePath: string, module: SourceModule, el: ImportSpecifier): void {
  if (el.isTypeOnly) {
    throw loaderErrorAt(filePath, module, el.pos, "`import type` is unsupported (Phase 1.5-2)");
  }
  if (el.importedName !== el.localName) {
    throw loaderErrorAt(
      filePath,
      module,
      el.pos,
      "import rename (`import { a as b }`) is unsupported (Phase 1.5-2)",
    );
  }
}

// Phase 1.5-6 prep #13: stdlib specifier。loader は visit を skip し、import
// 経由で取り込んだ識別子は codegen 側で syntactic shortcut として処理する。
// 現状は `node:fs` から `readFileSync` / `existsSync` (1.5-6 prep #17) /
// `writeFileSync` (1.5-6 prep #19) / `mkdirSync` (1.5-6 prep #20)、
// `node:path` / `std/path` から `dirname` / `resolve` (1.5-6 prep #18) /
// `basename` (1.5-6 prep #21) / `extname` (1.5-6 prep #22) /
// `join` (1.5-6 prep #23)、
// `node:child_process` から `execFileSync` (1.5-6 prep #24)、
// `node:url` から `fileURLToPath` (1.5-6 prep #25) を受理。
function isStdlibSpecifier(spec: string): boolean {
  if (spec === "node:fs") return true;
  if (spec === "node:path") return true;
  if (spec === "std/path") return true;
  if (spec === "node:child_process") return true;
  if (spec === "node:url") return true;
  return false;
}

function isAllowedStdlibImport(spec: string, name: string): boolean {
  if (spec === "node:fs") {
    if (name === "readFileSync") return true;
    if (name === "existsSync") return true;
    if (name === "writeFileSync") return true;
    if (name === "mkdirSync") return true;
    return false;
  }
  if (spec === "node:path" || spec === "std/path") {
    if (name === "dirname") return true;
    if (name === "resolve") return true;
    if (name === "basename") return true;
    if (name === "extname") return true;
    if (name === "join") return true;
    return false;
  }
  if (spec === "node:child_process") {
    if (name === "execFileSync") return true;
    return false;
  }
  if (spec === "node:url") {
    if (name === "fileURLToPath") return true;
    return false;
  }
  return false;
}

function allowedStdlibNames(spec: string): string {
  if (spec === "node:fs") return "readFileSync, existsSync, writeFileSync, mkdirSync";
  if (spec === "node:path") return "dirname, resolve, basename, extname, join";
  if (spec === "std/path") return "dirname, resolve, basename, extname, join";
  if (spec === "node:child_process") return "execFileSync";
  if (spec === "node:url") return "fileURLToPath";
  return "";
}

function validateStdlibImport(filePath: string, module: SourceModule, stmt: ImportDecl, spec: string): void {
  if (stmt.specifiers.length === 0 && stmt.defaultName === undefined && stmt.namespaceName === undefined) {
    throw loaderErrorAt(
      filePath,
      module,
      stmt.pos,
      `side-effect-only import of stdlib specifier '${spec}' is unsupported`,
    );
  }
  if (stmt.isTypeOnly) {
    throw loaderErrorAt(filePath, module, stmt.pos, "`import type` is unsupported (Phase 1.5-2)");
  }
  if (stmt.defaultName !== undefined) {
    throw loaderErrorAt(
      filePath,
      module,
      stmt.defaultNamePos,
      `default import from stdlib specifier '${spec}' is unsupported`,
    );
  }
  if (stmt.namespaceName !== undefined) {
    throw loaderErrorAt(
      filePath,
      module,
      stmt.namespaceNamePos,
      `namespace import of stdlib specifier '${spec}' is unsupported`,
    );
  }
  if (stmt.specifiers.length === 0) {
    throw loaderErrorAt(filePath, module, stmt.pos, `stdlib import from '${spec}' requires named bindings`);
  }
  for (const el of stmt.specifiers) {
    validateImportSpecifier(filePath, module, el);
    if (!isAllowedStdlibImport(spec, el.importedName)) {
      throw loaderErrorAt(
        filePath,
        module,
        el.pos,
        `unsupported named import '${el.importedName}' from stdlib specifier '${spec}' (allowed: ${allowedStdlibNames(spec)})`,
      );
    }
  }
}

function resolveSpecifier(fromFile: string, module: SourceModule, stmt: ImportDecl, spec: string): string {
  if (!spec.startsWith("./") && !spec.startsWith("../")) {
    throw loaderErrorAt(
      fromFile,
      module,
      stmt.modulePathPos,
      `non-relative module specifier '${spec}' is unsupported (only './foo' / '../foo' allowed in Phase 1.5-2)`,
    );
  }
  const fromDir = dirname(fromFile);
  if (spec.endsWith(".js")) {
    return resolve(fromDir, spec.slice(0, -3) + ".ts");
  }
  if (spec.endsWith(".ts")) {
    return resolve(fromDir, spec);
  }
  return resolve(fromDir, spec + ".ts");
}

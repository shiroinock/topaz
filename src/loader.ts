import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { ImportDecl, ImportSpecifier, SourceModule } from "./ast.js";
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
  const loaded = new Map<string, SourceModule>();
  const order: SourceModule[] = [];
  const visiting = new Set<string>();

  function visit(absPath: string, importedFrom: ImportSite | null): void {
    if (loaded.has(absPath)) return;
    if (visiting.has(absPath)) {
      const from = importedFrom!;
      throw new LoaderError(
        from.file,
        from.module,
        from.stmt.modulePathPos,
        `circular import detected: '${absPath}' is already being loaded`,
      );
    }
    visiting.add(absPath);
    if (!existsSync(absPath)) {
      if (importedFrom) {
        throw new LoaderError(
          importedFrom.file,
          importedFrom.module,
          importedFrom.stmt.modulePathPos,
          `cannot resolve module '${importedFrom.stmt.modulePath}' (looked for '${absPath}')`,
        );
      }
      throw new Error(`topaz: cannot resolve module '${absPath}'`);
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
      visit(target, { file: absPath, module: mod, stmt: decl });
    }
    visiting.delete(absPath);
    loaded.set(absPath, mod);
    order.push(mod);
  }

  visit(root, null);
  return { files: order, loaded: new Set(loaded.keys()) };
}

class LoaderError extends Error {
  constructor(file: string, module: SourceModule, pos: number, message: string) {
    const loc = posToLineCol(module, pos);
    super(`${file}:${loc.line}:${loc.col}: ${message}`);
  }
}

function posToLineCol(module: SourceModule, pos: number): { line: number; col: number } {
  let lineIndex = 0;
  for (let i = 0; i < module.lineStarts.length; i++) {
    if (module.lineStarts[i]! > pos) break;
    lineIndex = i;
  }
  return { line: lineIndex + 1, col: pos - module.lineStarts[lineIndex]! + 1 };
}

function validateImport(filePath: string, module: SourceModule, stmt: ImportDecl): void {
  if (stmt.isTypeOnly) {
    throw new LoaderError(filePath, module, stmt.pos, "`import type` is unsupported (Phase 1.5-2)");
  }
  if (stmt.defaultName !== undefined) {
    throw new LoaderError(
      filePath,
      module,
      stmt.defaultNamePos,
      "default import (`import X from \"...\"`) is unsupported (Phase 1.5-2)",
    );
  }
  if (stmt.namespaceName !== undefined) {
    throw new LoaderError(
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
    throw new LoaderError(filePath, module, el.pos, "`import type` is unsupported (Phase 1.5-2)");
  }
  if (el.importedName !== el.localName) {
    throw new LoaderError(
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
// `node:path` から `dirname` / `resolve` (1.5-6 prep #18) /
// `basename` (1.5-6 prep #21) / `extname` (1.5-6 prep #22) /
// `join` (1.5-6 prep #23)、
// `node:child_process` から `execFileSync` (1.5-6 prep #24)、
// `node:url` から `fileURLToPath` (1.5-6 prep #25) を受理。
const STDLIB_SPECIFIERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["node:fs", new Set(["readFileSync", "existsSync", "writeFileSync", "mkdirSync"])],
  ["node:path", new Set(["dirname", "resolve", "basename", "extname", "join"])],
  ["node:child_process", new Set(["execFileSync"])],
  ["node:url", new Set(["fileURLToPath"])],
]);

function isStdlibSpecifier(spec: string): boolean {
  return STDLIB_SPECIFIERS.has(spec);
}

function validateStdlibImport(filePath: string, module: SourceModule, stmt: ImportDecl, spec: string): void {
  const allowed = STDLIB_SPECIFIERS.get(spec)!;
  if (stmt.specifiers.length === 0 && stmt.defaultName === undefined && stmt.namespaceName === undefined) {
    throw new LoaderError(
      filePath,
      module,
      stmt.pos,
      `side-effect-only import of stdlib specifier '${spec}' is unsupported`,
    );
  }
  if (stmt.isTypeOnly) {
    throw new LoaderError(filePath, module, stmt.pos, "`import type` is unsupported (Phase 1.5-2)");
  }
  if (stmt.defaultName !== undefined) {
    throw new LoaderError(
      filePath,
      module,
      stmt.defaultNamePos,
      `default import from stdlib specifier '${spec}' is unsupported`,
    );
  }
  if (stmt.namespaceName !== undefined) {
    throw new LoaderError(
      filePath,
      module,
      stmt.namespaceNamePos,
      `namespace import of stdlib specifier '${spec}' is unsupported`,
    );
  }
  if (stmt.specifiers.length === 0) {
    throw new LoaderError(filePath, module, stmt.pos, `stdlib import from '${spec}' requires named bindings`);
  }
  for (const el of stmt.specifiers) {
    validateImportSpecifier(filePath, module, el);
    if (!allowed.has(el.importedName)) {
      throw new LoaderError(
        filePath,
        module,
        el.pos,
        `unsupported named import '${el.importedName}' from stdlib specifier '${spec}' (allowed: ${Array.from(allowed).join(", ")})`,
      );
    }
  }
}

function resolveSpecifier(fromFile: string, module: SourceModule, stmt: ImportDecl, spec: string): string {
  if (!spec.startsWith("./") && !spec.startsWith("../")) {
    throw new LoaderError(
      fromFile,
      module,
      stmt.modulePathPos,
      `non-relative module specifier '${spec}' is unsupported (only './foo' / '../foo' allowed in Phase 1.5-2)`,
    );
  }
  const fromDir = dirname(fromFile);
  let candidate: string;
  if (spec.endsWith(".js")) {
    candidate = resolve(fromDir, spec.slice(0, -3) + ".ts");
  } else if (spec.endsWith(".ts")) {
    candidate = resolve(fromDir, spec);
  } else {
    candidate = resolve(fromDir, spec + ".ts");
  }
  return candidate;
}

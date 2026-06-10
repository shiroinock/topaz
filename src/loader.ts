import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ImportDecl, ImportSpecifier, SourceModule } from "./ast.js";
import { allowedBuiltinImportNames, isAllowedBuiltinImport, isBuiltinImportSpecifier } from "./builtin_descriptors.js";
import { runtimePreludeSource } from "./runtime_prelude.js";
import { parseFile, parseSource } from "./topaz_parser.js";

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
  const prelude = parseSource("runtime/prelude.ts", runtimePreludeSource());
  prelude.isInternalModule = true;
  prelude.stableModuleId = "runtime_prelude";
  return { files: [prelude, ...state.order], loaded: state.loadedPaths() };
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
      if (isBuiltinImportSpecifier(specText)) {
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
    if (!isAllowedBuiltinImport(spec, el.importedName)) {
      throw loaderErrorAt(
        filePath,
        module,
        el.pos,
        `unsupported named import '${el.importedName}' from stdlib specifier '${spec}' (allowed: ${allowedBuiltinImportNames(spec)})`,
      );
    }
  }
}

function resolveSpecifier(fromFile: string, module: SourceModule, stmt: ImportDecl, spec: string): string {
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return resolveRelativeSpecifier(fromFile, spec);
  }
  return resolveBarePackageSpecifier(fromFile, module, stmt, spec);
}

function resolveRelativeSpecifier(fromFile: string, spec: string): string {
  const fromDir = dirname(fromFile);
  if (spec.endsWith(".js")) {
    return resolve(fromDir, spec.slice(0, -3) + ".ts");
  }
  if (spec.endsWith(".ts")) {
    return resolve(fromDir, spec);
  }
  return resolve(fromDir, spec + ".ts");
}

class TopazPackageEntry {
  kind: string;
  value: string;
  reason: string;

  constructor(kind: string, value: string, reason: string) {
    this.kind = kind;
    this.value = value;
    this.reason = reason;
  }
}

class JsonStringResult {
  ok: boolean;
  value: string;
  next: number;
  reason: string;

  constructor(ok: boolean, value: string, next: number, reason: string) {
    this.ok = ok;
    this.value = value;
    this.next = next;
    this.reason = reason;
  }
}

function resolveBarePackageSpecifier(fromFile: string, module: SourceModule, stmt: ImportDecl, spec: string): string {
  const packageName = packageNameFromSpecifier(fromFile, module, stmt, spec);
  let dir = dirname(fromFile);
  while (true) {
    const packageDir = resolve(dir, "node_modules", packageName);
    if (existsSync(packageDir)) {
      return resolvePackageEntry(fromFile, module, stmt, packageName, packageDir);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw loaderErrorAt(
    fromFile,
    module,
    stmt.modulePathPos,
    `cannot resolve package '${packageName}' from '${fromFile}' (looked in ancestor node_modules directories)`,
  );
}

function packageNameFromSpecifier(filePath: string, module: SourceModule, stmt: ImportDecl, spec: string): string {
  if (spec.length === 0) {
    throw loaderErrorAt(filePath, module, stmt.modulePathPos, "empty package specifier is unsupported");
  }
  if (spec.startsWith("/")) {
    throw loaderErrorAt(filePath, module, stmt.modulePathPos, `absolute module specifier '${spec}' is unsupported`);
  }
  const badSegment = firstInvalidSegment(spec);
  if (badSegment !== "") {
    throw loaderErrorAt(
      filePath,
      module,
      stmt.modulePathPos,
      `unsupported package specifier '${spec}': segment '${badSegment}' is not allowed`,
    );
  }
  const slash = firstSlash(spec, 0);
  if (spec.startsWith("@")) {
    if (slash < 0) {
      throw loaderErrorAt(
        filePath,
        module,
        stmt.modulePathPos,
        `unsupported scoped package specifier '${spec}' (expected '@scope/pkg')`,
      );
    }
    const secondSlash = firstSlash(spec, slash + 1);
    if (secondSlash >= 0) {
      throw loaderErrorAt(
        filePath,
        module,
        stmt.modulePathPos,
        `package subpath import '${spec}' is unsupported`,
      );
    }
    return spec;
  }
  if (slash >= 0) {
    throw loaderErrorAt(filePath, module, stmt.modulePathPos, `package subpath import '${spec}' is unsupported`);
  }
  return spec;
}

function resolvePackageEntry(
  fromFile: string,
  module: SourceModule,
  stmt: ImportDecl,
  packageName: string,
  packageDir: string,
): string {
  const packageJson = resolve(packageDir, "package.json");
  if (existsSync(packageJson)) {
    const entry = extractTopazPackageEntry(readFileSync(packageJson, "utf8"));
    if (entry.kind === "invalid") {
      throw loaderErrorAt(
        fromFile,
        module,
        stmt.modulePathPos,
        `unsupported topaz package entry for '${packageName}': ${entry.reason}`,
      );
    }
    if (entry.kind === "value") {
      return resolveTopazPackageEntry(fromFile, module, stmt, packageName, packageDir, entry.value);
    }
  }

  const indexPath = resolve(packageDir, "index.ts");
  if (existsSync(indexPath)) return indexPath;

  throw loaderErrorAt(
    fromFile,
    module,
    stmt.modulePathPos,
    `package '${packageName}' has no supported Topaz source entry (expected package.json topaz string or index.ts; main/exports are unsupported)`,
  );
}

function resolveTopazPackageEntry(
  fromFile: string,
  module: SourceModule,
  stmt: ImportDecl,
  packageName: string,
  packageDir: string,
  entry: string,
): string {
  const reason = validateTopazEntryPath(entry);
  if (reason !== "") {
    throw loaderErrorAt(
      fromFile,
      module,
      stmt.modulePathPos,
      `unsupported topaz package entry for '${packageName}': ${reason}`,
    );
  }
  let sourceEntry = entry;
  if (entry.endsWith(".js")) {
    sourceEntry = entry.slice(0, entry.length - 3) + ".ts";
  }
  const selected = resolve(packageDir, sourceEntry);
  if (!existsSync(selected)) {
    throw loaderErrorAt(
      fromFile,
      module,
      stmt.modulePathPos,
      `package '${packageName}' topaz entry '${sourceEntry}' does not exist (looked for '${selected}')`,
    );
  }
  return selected;
}

function validateTopazEntryPath(entry: string): string {
  if (!entry.startsWith("./")) return `entry '${entry}' must start with './'`;
  if (entry.endsWith(".d.ts")) return `entry '${entry}' uses unsupported .d.ts output`;
  if (!entry.endsWith(".ts") && !entry.endsWith(".js")) {
    return `entry '${entry}' must end in .ts or .js`;
  }
  const rest = entry.slice(2);
  const badSegment = firstInvalidSegment(rest);
  if (badSegment !== "") {
    return `entry '${entry}' contains unsupported segment '${badSegment}'`;
  }
  return "";
}

function extractTopazPackageEntry(text: string): TopazPackageEntry {
  let i = 0;
  let depth = 0;
  while (i < text.length) {
    const ch = text.charCodeAt(i);
    if (ch === 34) {
      const parsed = readJsonString(text, i);
      if (!parsed.ok) return new TopazPackageEntry("invalid", "", parsed.reason);
      if (depth === 1) {
        let afterKey = skipJsonWhitespace(text, parsed.next);
        if (afterKey < text.length && text.charCodeAt(afterKey) === 58) {
          if (parsed.value === "topaz") {
            afterKey = skipJsonWhitespace(text, afterKey + 1);
            if (afterKey >= text.length || text.charCodeAt(afterKey) !== 34) {
              return new TopazPackageEntry("invalid", "", "`topaz` must be a JSON string");
            }
            const value = readJsonString(text, afterKey);
            if (!value.ok) return new TopazPackageEntry("invalid", "", value.reason);
            return new TopazPackageEntry("value", value.value, "");
          }
        }
      }
      i = parsed.next;
    } else if (ch === 123 || ch === 91) {
      depth = depth + 1;
      i = i + 1;
    } else if (ch === 125 || ch === 93) {
      depth = depth - 1;
      i = i + 1;
    } else {
      i = i + 1;
    }
  }
  return new TopazPackageEntry("missing", "", "");
}

function readJsonString(text: string, start: number): JsonStringResult {
  let out = "";
  let i = start + 1;
  while (i < text.length) {
    const ch = text.charCodeAt(i);
    if (ch === 34) return new JsonStringResult(true, out, i + 1, "");
    if (ch < 32) return new JsonStringResult(false, "", i, "control character in package.json string");
    if (ch === 92) {
      if (i + 1 >= text.length) return new JsonStringResult(false, "", i, "unterminated JSON string escape");
      const esc = text.charCodeAt(i + 1);
      if (esc === 34) {
        out = out + "\"";
      } else if (esc === 92) {
        out = out + "\\";
      } else if (esc === 47) {
        out = out + "/";
      } else if (esc === 98 || esc === 102 || esc === 110 || esc === 114 || esc === 116 || esc === 117) {
        return new JsonStringResult(false, "", i, "non-path JSON escapes in package.json strings are unsupported");
      } else {
        return new JsonStringResult(false, "", i, "unsupported JSON string escape in package.json");
      }
      i = i + 2;
    } else {
      out = out + String.fromCharCode(ch);
      i = i + 1;
    }
  }
  return new JsonStringResult(false, "", i, "unterminated JSON string");
}

function skipJsonWhitespace(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    const ch = text.charCodeAt(i);
    if (ch !== 32 && ch !== 10 && ch !== 13 && ch !== 9) return i;
    i = i + 1;
  }
  return i;
}

function firstSlash(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    if (text.charCodeAt(i) === 47) return i;
    i = i + 1;
  }
  return -1;
}

function firstInvalidSegment(text: string): string {
  let start = 0;
  let i = 0;
  while (i <= text.length) {
    if (i === text.length || text.charCodeAt(i) === 47) {
      const segment = text.slice(start, i);
      if (segment === "") return "<empty>";
      if (segment === "." || segment === "..") return segment;
      start = i + 1;
    }
    i = i + 1;
  }
  return "";
}

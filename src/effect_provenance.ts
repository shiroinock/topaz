import {
  BuiltinEffect,
  BuiltinImportDescriptor,
  BuiltinStatus,
  BuiltinSyntheticGlobalDescriptor,
  builtinImportDescriptors,
  builtinSyntheticGlobalDescriptors,
} from "./builtin_descriptors.js";
import { CallExpr, Expr, IdentExpr, ImportDecl, ModuleItem, SourceModule, Stmt } from "./ast.js";
import { loadModuleGraph, ModuleGraph } from "./loader.js";

export type BuiltinEffectSource = "import" | "call" | "value";

export type BuiltinEffectProvenance = {
  file: string;
  line: number;
  col: number;
  effect: BuiltinEffect;
  semanticName: string;
  status: BuiltinStatus;
  source: BuiltinEffectSource;
  detail: string;
};

type ImportedBuiltinBinding = {
  descriptor: BuiltinImportDescriptor;
  importName: string;
};

type ProvenanceSink = {
  records: Array<BuiltinEffectProvenance>;
};

export function collectBuiltinEffectProvenance(graph: ModuleGraph): Array<BuiltinEffectProvenance> {
  const sink: ProvenanceSink = { records: [] };
  const importDescriptors = builtinImportDescriptors();
  const syntheticDescriptors = builtinSyntheticGlobalDescriptors();
  const importDescriptorByKey = new Map<string, BuiltinImportDescriptor>();
  const syntheticDescriptorByName = new Map<string, BuiltinSyntheticGlobalDescriptor>();
  for (const desc of importDescriptors) {
    importDescriptorByKey.set(importDescriptorKey(desc.specifier, desc.importedName), desc);
  }
  for (const desc of syntheticDescriptors) {
    syntheticDescriptorByName.set(desc.globalName, desc);
  }

  for (const mod of graph.files) {
    if (mod.isInternalModule) continue;
    collectModuleProvenance(mod, importDescriptorByKey, syntheticDescriptorByName, sink);
  }
  return sink.records;
}

export function collectBuiltinEffectProvenanceForEntry(entry: string): Array<BuiltinEffectProvenance> {
  return collectBuiltinEffectProvenance(loadModuleGraph(entry));
}

function collectModuleProvenance(
  mod: SourceModule,
  importDescriptorByKey: Map<string, BuiltinImportDescriptor>,
  syntheticDescriptorByName: Map<string, BuiltinSyntheticGlobalDescriptor>,
  sink: ProvenanceSink,
): void {
  const importedBindings = new Map<string, ImportedBuiltinBinding>();
  for (const item of mod.items) {
    if (item.kind !== "module_decl") continue;
    const decl = item.decl;
    if (decl.kind !== "import_decl") continue;
    collectImportDeclProvenance(mod, decl, importDescriptorByKey, importedBindings, sink);
  }

  for (const item of mod.items) {
    collectModuleItemUses(mod, item, importedBindings, syntheticDescriptorByName, sink);
  }
}

function collectImportDeclProvenance(
  mod: SourceModule,
  decl: ImportDecl,
  importDescriptorByKey: Map<string, BuiltinImportDescriptor>,
  importedBindings: Map<string, ImportedBuiltinBinding>,
  sink: ProvenanceSink,
): void {
  for (const spec of decl.specifiers) {
    const desc = importDescriptorByKey.get(importDescriptorKey(decl.modulePath, spec.importedName));
    if (desc === undefined) continue;
    importedBindings.set(spec.localName, { descriptor: desc, importName: spec.importedName });
    recordDescriptorEffects(mod, spec.pos, desc, "import", `import { ${spec.importedName} } from "${decl.modulePath}"`, sink);
  }
}

function collectModuleItemUses(
  mod: SourceModule,
  item: ModuleItem,
  importedBindings: Map<string, ImportedBuiltinBinding>,
  syntheticDescriptorByName: Map<string, BuiltinSyntheticGlobalDescriptor>,
  sink: ProvenanceSink,
): void {
  if (item.kind === "module_stmt") {
    collectStmtUses(mod, item.stmt, importedBindings, syntheticDescriptorByName, sink);
    return;
  }
  const decl = item.decl;
  switch (decl.kind) {
    case "function_decl":
      collectStmtUses(mod, decl.body, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "class_decl":
      for (const member of decl.members) {
        if (member.kind === "class_field") {
          const initializer = member.initializer;
          if (initializer !== undefined) collectExprUses(mod, initializer, importedBindings, syntheticDescriptorByName, sink);
        } else {
          collectStmtUses(mod, member.body, importedBindings, syntheticDescriptorByName, sink);
        }
      }
      return;
    case "interface_decl":
    case "type_alias_decl":
    case "import_decl":
      return;
  }
}

function collectStmtUses(
  mod: SourceModule,
  stmt: Stmt,
  importedBindings: Map<string, ImportedBuiltinBinding>,
  syntheticDescriptorByName: Map<string, BuiltinSyntheticGlobalDescriptor>,
  sink: ProvenanceSink,
): void {
  switch (stmt.kind) {
    case "expr_stmt":
      collectExprUses(mod, stmt.expr, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "var_decl":
      const init = stmt.init;
      if (init !== undefined) collectExprUses(mod, init, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "var_destr_decl":
      collectExprUses(mod, stmt.init, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "block_stmt":
      for (const child of stmt.stmts) collectStmtUses(mod, child, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "if_stmt":
      collectExprUses(mod, stmt.cond, importedBindings, syntheticDescriptorByName, sink);
      collectStmtUses(mod, stmt.thenBranch, importedBindings, syntheticDescriptorByName, sink);
      const elseBranch = stmt.elseBranch;
      if (elseBranch !== undefined) collectStmtUses(mod, elseBranch, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "while_stmt":
      collectExprUses(mod, stmt.cond, importedBindings, syntheticDescriptorByName, sink);
      collectStmtUses(mod, stmt.body, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "do_while_stmt":
      collectStmtUses(mod, stmt.body, importedBindings, syntheticDescriptorByName, sink);
      collectExprUses(mod, stmt.cond, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "for_stmt":
      const forInit = stmt.init;
      if (forInit !== undefined) {
        if (forInit.kind === "for_init_decl") {
          collectStmtUses(mod, forInit.decl, importedBindings, syntheticDescriptorByName, sink);
        } else {
          collectExprUses(mod, forInit.expr, importedBindings, syntheticDescriptorByName, sink);
        }
      }
      const cond = stmt.cond;
      if (cond !== undefined) collectExprUses(mod, cond, importedBindings, syntheticDescriptorByName, sink);
      const update = stmt.update;
      if (update !== undefined) collectExprUses(mod, update, importedBindings, syntheticDescriptorByName, sink);
      collectStmtUses(mod, stmt.body, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "for_of_stmt":
      collectExprUses(mod, stmt.source, importedBindings, syntheticDescriptorByName, sink);
      collectStmtUses(mod, stmt.body, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "switch_stmt":
      collectExprUses(mod, stmt.discriminant, importedBindings, syntheticDescriptorByName, sink);
      for (const switchCase of stmt.cases) {
        const test = switchCase.test;
        if (test !== undefined) collectExprUses(mod, test, importedBindings, syntheticDescriptorByName, sink);
        for (const child of switchCase.stmts) collectStmtUses(mod, child, importedBindings, syntheticDescriptorByName, sink);
      }
      return;
    case "try_stmt":
      collectStmtUses(mod, stmt.tryBlock, importedBindings, syntheticDescriptorByName, sink);
      const catchClause = stmt.catchClause;
      if (catchClause !== undefined) collectStmtUses(mod, catchClause.body, importedBindings, syntheticDescriptorByName, sink);
      const finallyBlock = stmt.finallyBlock;
      if (finallyBlock !== undefined) collectStmtUses(mod, finallyBlock, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "return_stmt":
      const value = stmt.value;
      if (value !== undefined) collectExprUses(mod, value, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "throw_stmt":
      collectExprUses(mod, stmt.value, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "break_stmt":
    case "continue_stmt":
    case "empty_stmt":
      return;
  }
}

function collectExprUses(
  mod: SourceModule,
  expr: Expr,
  importedBindings: Map<string, ImportedBuiltinBinding>,
  syntheticDescriptorByName: Map<string, BuiltinSyntheticGlobalDescriptor>,
  sink: ProvenanceSink,
): void {
  switch (expr.kind) {
    case "ident":
      collectImportedValueUse(mod, expr, importedBindings, sink);
      return;
    case "num_lit":
    case "bigint_lit":
    case "str_lit":
    case "bool_lit":
    case "null_lit":
    case "undefined_lit":
    case "this_expr":
    case "import_meta_url":
      return;
    case "template_lit":
      for (const sub of expr.subs) collectExprUses(mod, sub.expr, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "array_lit":
      for (const elem of expr.elems) collectExprUses(mod, elem.expr, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "object_lit":
      for (const prop of expr.props) {
        if (prop.kind === "prop_kv") {
          collectExprUses(mod, prop.value, importedBindings, syntheticDescriptorByName, sink);
        } else if (prop.kind === "prop_spread") {
          collectExprUses(mod, prop.expr, importedBindings, syntheticDescriptorByName, sink);
        }
      }
      return;
    case "paren_expr":
      collectExprUses(mod, expr.inner, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "call_expr":
      collectCallUse(mod, expr, importedBindings, syntheticDescriptorByName, sink);
      for (const arg of expr.args) collectExprUses(mod, arg, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "new_expr":
      collectExprUses(mod, expr.callee, importedBindings, syntheticDescriptorByName, sink);
      for (const arg of expr.args) collectExprUses(mod, arg, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "prop_access": {
      const name = qualifiedName(expr);
      if (name !== undefined && name === "process.argv") {
        const desc = syntheticDescriptorByName.get(name);
        if (desc !== undefined) recordDescriptorEffects(mod, expr.pos, desc, "value", name, sink);
      }
      collectExprUses(mod, expr.receiver, importedBindings, syntheticDescriptorByName, sink);
      return;
    }
    case "elem_access":
      collectExprUses(mod, expr.receiver, importedBindings, syntheticDescriptorByName, sink);
      collectExprUses(mod, expr.index, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "prefix_op":
      collectExprUses(mod, expr.operand, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "postfix_op":
      collectExprUses(mod, expr.operand, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "typeof_expr":
      collectExprUses(mod, expr.operand, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "non_null":
      collectExprUses(mod, expr.operand, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "spread_expr":
      collectExprUses(mod, expr.operand, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "bin_op":
      collectExprUses(mod, expr.lhs, importedBindings, syntheticDescriptorByName, sink);
      collectExprUses(mod, expr.rhs, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "instanceof_expr":
      collectExprUses(mod, expr.lhs, importedBindings, syntheticDescriptorByName, sink);
      collectExprUses(mod, expr.rhs, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "ternary_expr":
      collectExprUses(mod, expr.cond, importedBindings, syntheticDescriptorByName, sink);
      collectExprUses(mod, expr.thenBranch, importedBindings, syntheticDescriptorByName, sink);
      collectExprUses(mod, expr.elseBranch, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "assign_expr":
      collectExprUses(mod, expr.target, importedBindings, syntheticDescriptorByName, sink);
      collectExprUses(mod, expr.value, importedBindings, syntheticDescriptorByName, sink);
      return;
    case "arrow_expr": {
      const body = expr.body;
      switch (body.kind) {
        case "arrow_expr_body":
          collectExprUses(mod, body.expr, importedBindings, syntheticDescriptorByName, sink);
          return;
        case "arrow_block_body":
          for (const stmt of body.stmts) collectStmtUses(mod, stmt, importedBindings, syntheticDescriptorByName, sink);
          return;
      }
      return;
    }
    case "function_expr":
      for (const stmt of expr.body) collectStmtUses(mod, stmt, importedBindings, syntheticDescriptorByName, sink);
      return;
  }
}

function collectCallUse(
  mod: SourceModule,
  expr: CallExpr,
  importedBindings: Map<string, ImportedBuiltinBinding>,
  syntheticDescriptorByName: Map<string, BuiltinSyntheticGlobalDescriptor>,
  sink: ProvenanceSink,
): void {
  const callee = expr.callee;
  if (callee.kind === "ident") {
    const imported = importedBindings.get(callee.name);
    if (imported !== undefined) {
      recordDescriptorEffects(mod, expr.pos, imported.descriptor, "call", `${callee.name}(...)`, sink);
    }
    return;
  }
  const name = qualifiedName(callee);
  if (name === undefined) return;
  if (name === "console.warn") {
    const desc = syntheticDescriptorByName.get("console.error");
    if (desc !== undefined) recordDescriptorEffects(mod, expr.pos, desc, "call", "console.warn(...)", sink);
    return;
  }
  const desc = syntheticDescriptorByName.get(name);
  if (desc !== undefined && name !== "process.argv") {
    recordDescriptorEffects(mod, expr.pos, desc, "call", `${name}(...)`, sink);
  }
}

function collectImportedValueUse(
  mod: SourceModule,
  expr: IdentExpr,
  importedBindings: Map<string, ImportedBuiltinBinding>,
  sink: ProvenanceSink,
): void {
  const imported = importedBindings.get(expr.name);
  if (imported === undefined) return;
  if (imported.descriptor.semanticName !== "process.argv") return;
  recordDescriptorEffects(mod, expr.pos, imported.descriptor, "value", imported.importName, sink);
}

function recordDescriptorEffects(
  mod: SourceModule,
  pos: number,
  desc: BuiltinImportDescriptor | BuiltinSyntheticGlobalDescriptor,
  source: BuiltinEffectSource,
  detail: string,
  sink: ProvenanceSink,
): void {
  const loc = posToLineCol(mod, pos);
  for (const effect of desc.effects) {
    sink.records.push({
      file: mod.filePath,
      line: loc.line,
      col: loc.col,
      effect,
      semanticName: desc.semanticName,
      status: desc.status,
      source,
      detail,
    });
  }
}

function qualifiedName(expr: Expr): string | undefined {
  if (expr.kind === "ident") return expr.name;
  if (expr.kind !== "prop_access") return undefined;
  const receiver = qualifiedName(expr.receiver);
  if (receiver === undefined) return undefined;
  return `${receiver}.${expr.name}`;
}

function importDescriptorKey(specifier: string, importedName: string): string {
  return `${specifier} :: ${importedName}`;
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

// Phase 1.5-6e oracle: ts.SourceFile → Topaz.SourceModule の変換器。
//
// 目的:
// (a) topaz_parser の出力検証用 oracle。examples/*.ts に対して
//     `convertFromTsc(tsc AST)` と `topaz_parser(source)` を JSON diff し、
//     diff = 0 を parser の合格条件にする。
// (b) codegen.ts の入力切替の前段。codegen を ast.ts ベースに書き換えるまでの
//     つなぎとして、loader → tsc parser → convertFromTsc → codegen の経路を
//     成立させる(codegen 書き換え中の安全網)。
//
// 設計上の制約:
// - Topaz サブセットに収まる node のみ受理。未対応 node は throw ConvertError。
//   parser 検証では「tsc 経由で読めるが Topaz で表現できない」エッジを
//   ここで弾いて、topaz_parser 側の reject と一致させる。
// - position は `node.getStart(sf)` / `node.getEnd()` を使う(JSDoc コメントを
//   含まない実際の開始位置)。
// - ast.ts の type は `T | undefined` 形式で `T | null` を使わない。

import * as ts from "typescript";

import type {
  SourceModule,
  ModuleItem,
  Decl,
  FunctionDecl,
  ClassDecl,
  ClassMember,
  ClassFieldMember,
  ClassMethodMember,
  ClassMemberModifier,
  InterfaceDecl,
  InterfaceMember,
  InterfaceFieldMember,
  InterfaceMethodMember,
  TypeAliasDecl,
  ImportDecl,
  ImportSpecifier,
  FunctionParam,
  TypeParam,
  Stmt,
  ExprStmt,
  VarDeclStmt,
  VarDestrDeclStmt,
  VarDestrBinding,
  BlockStmt,
  IfStmt,
  WhileStmt,
  DoWhileStmt,
  ForStmt,
  ForInit,
  ForOfStmt,
  ForOfBinding,
  SwitchStmt,
  SwitchCase,
  TryStmt,
  CatchClause,
  ReturnStmt,
  BreakStmt,
  ContinueStmt,
  ThrowStmt,
  EmptyStmt,
  Expr,
  IdentExpr,
  NumLitExpr,
  BigIntLitExpr,
  StrLitExpr,
  BoolLitExpr,
  NullLitExpr,
  UndefinedLitExpr,
  ThisExpr,
  ImportMetaUrlExpr,
  TemplateLitExpr,
  TemplateSub,
  ArrayLitExpr,
  ArrayElem,
  ObjectLitExpr,
  ObjectMember,
  ParenExpr,
  CallExpr,
  NewExpr,
  PropAccessExpr,
  ElemAccessExpr,
  PrefixOpExpr,
  PostfixOpExpr,
  BinOpExpr,
  InstanceofExpr,
  TypeofExpr,
  TernaryExpr,
  AssignExpr,
  ArrowExpr,
  ArrowParam,
  ArrowBody,
  NonNullExpr,
  SpreadExpr,
  TypeNode,
  TypeRef,
  TypeUnion,
  TypeArrayShorthand,
  TypeLiteralNode,
  TypeLiteralMember,
  TypeLiteralField,
  TypeLiteralMethod,
  TypeFn,
  TypeFnParam,
  TypeStrLit,
  TypeNumLit,
  TypeVoid,
  TypeUnknown,
} from "./ast.js";

export class ConvertError extends Error {
  constructor(sf: ts.SourceFile, node: ts.Node, message: string) {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    super(`${sf.fileName}:${line + 1}:${character + 1}: convertFromTsc: ${message}`);
  }
}

export function convertFromTsc(sf: ts.SourceFile): SourceModule {
  const c = new Converter(sf);
  return c.convertModule();
}

// Phase 1.5-6e-1 seam: standalone type converter exposed for codegen's
// strangler-fig migration. codegen's type machine consumes Topaz `TypeNode`,
// but its callers still hold tsc `ts.TypeNode`; this shim bridges the boundary
// at each call site (see `Emitter.typeAnno`). `sf` is required for span (pos /
// end) computation. The boundary moves inward over 6e-2..6e-4 and vanishes at
// 6e-5 once the entry is `convertFromTsc(sf)` alone.
export function convertType(node: ts.TypeNode, sf: ts.SourceFile): TypeNode {
  return new Converter(sf).convertType(node);
}

// Phase 1.5-6e-2 seam: standalone expression / statement / block converters
// exposed for codegen's strangler-fig migration. The SCC (emit/infer) consumes
// Topaz `Expr` / `Stmt`, but decl-land callers (function / method / ctor bodies,
// field initializers, root top-level statements) still hold tsc nodes; these
// shims bridge the boundary at each call site. The boundary moves inward over
// 6e-3..6e-4 and vanishes at 6e-5.
export function convertExpr(node: ts.Expression, sf: ts.SourceFile): Expr {
  return new Converter(sf).convertExpr(node);
}

export function convertStmt(node: ts.Statement, sf: ts.SourceFile): Stmt {
  return new Converter(sf).convertStmt(node);
}

export function convertBlock(node: ts.Block, sf: ts.SourceFile): BlockStmt {
  return new Converter(sf).convertBlock(node);
}

function isDecimalBigIntText(text: string): boolean {
  const end = text.length - 1;
  if (end <= 0 || text.charCodeAt(end) !== 110) return false;
  for (let i = 0; i < end; i++) {
    const ch = text.charCodeAt(i);
    if (ch < 48 || ch > 57) return false;
  }
  return true;
}

class Converter {
  sf: ts.SourceFile;

  constructor(sf: ts.SourceFile) {
    this.sf = sf;
  }

  span(node: ts.Node): { pos: number; end: number } {
    return { pos: node.getStart(this.sf), end: node.getEnd() };
  }

  err(node: ts.Node, message: string): ConvertError {
    return new ConvertError(this.sf, node, message);
  }

  // ============================================================
  // Module
  // ============================================================

  convertModule(): SourceModule {
    const items: ModuleItem[] = [];
    for (const stmt of this.sf.statements) {
      if (this.isDeclLike(stmt)) {
        const decl = this.convertDecl(stmt);
        items.push({ kind: "module_decl", decl });
      } else {
        const s = this.convertStmt(stmt);
        items.push({ kind: "module_stmt", stmt: s });
      }
    }
    return { filePath: this.sf.fileName, lineStarts: [...this.sf.getLineStarts()], items };
  }

  isDeclLike(stmt: ts.Statement): boolean {
    return (
      ts.isImportDeclaration(stmt) ||
      ts.isFunctionDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt)
    );
  }

  // ============================================================
  // Declarations
  // ============================================================

  convertDecl(stmt: ts.Statement): Decl {
    if (ts.isImportDeclaration(stmt)) return this.convertImport(stmt);
    if (ts.isFunctionDeclaration(stmt)) return this.convertFunctionDecl(stmt);
    if (ts.isClassDeclaration(stmt)) return this.convertClassDecl(stmt);
    if (ts.isInterfaceDeclaration(stmt)) return this.convertInterfaceDecl(stmt);
    if (ts.isTypeAliasDeclaration(stmt)) return this.convertTypeAliasDecl(stmt);
    throw this.err(stmt, `unsupported declaration ${ts.SyntaxKind[stmt.kind]}`);
  }

  convertImport(stmt: ts.ImportDeclaration): ImportDecl {
    const moduleSpec = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpec) && !ts.isNoSubstitutionTemplateLiteral(moduleSpec)) {
      throw this.err(moduleSpec, "import module specifier must be a string literal");
    }
    const specifiers: ImportSpecifier[] = [];
    let defaultName: string | undefined = undefined;
    let defaultNamePos: number = -1;
    let namespaceName: string | undefined = undefined;
    let namespaceNamePos: number = -1;
    let isTypeOnly: boolean = false;
    if (stmt.importClause) {
      const clause = stmt.importClause;
      isTypeOnly = clause.isTypeOnly;
      if (clause.name) {
        defaultName = clause.name.text;
        defaultNamePos = clause.name.getStart(this.sf);
      }
      const named = clause.namedBindings;
      if (named) {
        if (ts.isNamespaceImport(named)) {
          namespaceName = named.name.text;
          namespaceNamePos = named.name.getStart(this.sf);
        } else if (ts.isNamedImports(named)) {
          for (const el of named.elements) {
            const importedName = el.propertyName ? el.propertyName.text : el.name.text;
            specifiers.push({
              importedName,
              localName: el.name.text,
              isTypeOnly: el.isTypeOnly,
              ...this.span(el),
            });
          }
        } else {
          throw this.err(named, "unsupported import form");
        }
      }
    }
    const specSpan = this.span(moduleSpec);
    return {
      kind: "import_decl",
      specifiers,
      modulePath: moduleSpec.text,
      modulePathPos: specSpan.pos,
      modulePathEnd: specSpan.end,
      isTypeOnly,
      defaultName,
      defaultNamePos,
      namespaceName,
      namespaceNamePos,
      ...this.span(stmt),
    };
  }

  convertFunctionDecl(stmt: ts.FunctionDeclaration): FunctionDecl {
    if (!stmt.name) throw this.err(stmt, "function declaration must be named");
    if (!stmt.body) throw this.err(stmt, "function declaration must have a body");
    this.rejectAsyncStar(stmt);
    const isExported = this.hasExportModifier(stmt);
    const typeParams = this.convertTypeParams(stmt.typeParameters);
    const params = this.convertParams(stmt.parameters);
    const returnType = stmt.type ? this.convertType(stmt.type) : undefined;
    const body = this.convertBlock(stmt.body);
    return {
      kind: "function_decl",
      isExported,
      name: stmt.name.text,
      typeParams,
      params,
      returnType,
      body,
      ...this.span(stmt),
    };
  }

  convertClassDecl(stmt: ts.ClassDeclaration): ClassDecl {
    if (!stmt.name) throw this.err(stmt, "class declaration must be named");
    const isExported = this.hasExportModifier(stmt);
    const typeParams = this.convertTypeParams(stmt.typeParameters);
    const implementsList: string[] = [];
    if (stmt.heritageClauses) {
      for (const hc of stmt.heritageClauses) {
        if (hc.token === ts.SyntaxKind.ExtendsKeyword) {
          throw this.err(hc, "`extends` on class is unsupported");
        }
        if (hc.token !== ts.SyntaxKind.ImplementsKeyword) {
          throw this.err(hc, "unsupported heritage clause");
        }
        for (const type of hc.types) {
          if (!ts.isIdentifier(type.expression)) {
            throw this.err(type, "`implements` target must be a bare identifier");
          }
          if (type.typeArguments && type.typeArguments.length > 0) {
            throw this.err(type, "`implements` with type arguments is unsupported");
          }
          implementsList.push(type.expression.text);
        }
      }
    }
    const members: ClassMember[] = [];
    for (const m of stmt.members) {
      members.push(this.convertClassMember(m));
    }
    return {
      kind: "class_decl",
      isExported,
      name: stmt.name.text,
      typeParams,
      implementsList,
      members,
      ...this.span(stmt),
    };
  }

  convertClassMember(m: ts.ClassElement): ClassMember {
    if (ts.isPropertyDeclaration(m)) return this.convertClassField(m);
    if (ts.isMethodDeclaration(m)) return this.convertClassMethod(m, false);
    if (ts.isConstructorDeclaration(m)) return this.convertClassMethod(m, true);
    throw this.err(m, `unsupported class member ${ts.SyntaxKind[m.kind]}`);
  }

  convertClassField(m: ts.PropertyDeclaration): ClassFieldMember {
    if (!ts.isIdentifier(m.name)) throw this.err(m, "class field name must be an identifier");
    if (m.questionToken) throw this.err(m, "optional class field is unsupported");
    if (m.exclamationToken) throw this.err(m, "definite-assignment assertion is unsupported");
    if (!m.type) throw this.err(m, "class field must have a type annotation");
    const modifiers = this.collectClassMemberModifiers(m);
    const initializer = m.initializer ? this.convertExpr(m.initializer) : undefined;
    return {
      kind: "class_field",
      modifiers,
      name: m.name.text,
      type: this.convertType(m.type),
      initializer,
      ...this.span(m),
    };
  }

  convertClassMethod(
    m: ts.MethodDeclaration | ts.ConstructorDeclaration,
    isCtor: boolean,
  ): ClassMethodMember {
    this.rejectAsyncStar(m);
    if (!m.body) throw this.err(m, "class method must have a body");
    const modifiers = this.collectClassMemberModifiers(m);
    let name: string;
    if (isCtor) {
      name = "constructor";
    } else {
      const md = m as ts.MethodDeclaration;
      if (!ts.isIdentifier(md.name)) throw this.err(m, "method name must be an identifier");
      if (md.questionToken) throw this.err(m, "optional method is unsupported");
      name = md.name.text;
    }
    if (m.typeParameters && m.typeParameters.length > 0) {
      throw this.err(m, "generic methods are unsupported");
    }
    const params = this.convertParams(m.parameters);
    const returnType = m.type ? this.convertType(m.type) : undefined;
    const body = this.convertBlock(m.body);
    return {
      kind: "class_method",
      modifiers,
      isCtor,
      name,
      params,
      returnType,
      body,
      ...this.span(m),
    };
  }

  collectClassMemberModifiers(m: ts.HasModifiers): ClassMemberModifier[] {
    const mods: ClassMemberModifier[] = [];
    const modifiers = ts.getModifiers(m);
    if (modifiers) {
      for (const mod of modifiers) {
        switch (mod.kind) {
          case ts.SyntaxKind.PublicKeyword:
            mods.push("public");
            break;
          case ts.SyntaxKind.PrivateKeyword:
            mods.push("private");
            break;
          case ts.SyntaxKind.ProtectedKeyword:
            mods.push("protected");
            break;
          case ts.SyntaxKind.ReadonlyKeyword:
            mods.push("readonly");
            break;
          case ts.SyntaxKind.StaticKeyword:
            mods.push("static");
            break;
          case ts.SyntaxKind.AbstractKeyword:
            mods.push("abstract");
            break;
          case ts.SyntaxKind.OverrideKeyword:
            mods.push("override");
            break;
          case ts.SyntaxKind.ExportKeyword:
          case ts.SyntaxKind.DefaultKeyword:
            throw this.err(mod, `class member cannot have '${ts.SyntaxKind[mod.kind]}' modifier`);
          default:
            throw this.err(mod, `unsupported modifier ${ts.SyntaxKind[mod.kind]}`);
        }
      }
    }
    return mods;
  }

  convertInterfaceDecl(stmt: ts.InterfaceDeclaration): InterfaceDecl {
    if (stmt.heritageClauses && stmt.heritageClauses.length > 0) {
      throw this.err(stmt, "interface heritage clauses are unsupported");
    }
    if (stmt.typeParameters && stmt.typeParameters.length > 0) {
      throw this.err(stmt, "generic interfaces are unsupported");
    }
    const isExported = this.hasExportModifier(stmt);
    const members: InterfaceMember[] = [];
    for (const m of stmt.members) {
      members.push(this.convertInterfaceMember(m));
    }
    return {
      kind: "interface_decl",
      isExported,
      name: stmt.name.text,
      members,
      ...this.span(stmt),
    };
  }

  convertInterfaceMember(m: ts.TypeElement): InterfaceMember {
    if (ts.isPropertySignature(m)) return this.convertInterfaceField(m);
    if (ts.isMethodSignature(m)) return this.convertInterfaceMethod(m);
    if (ts.isIndexSignatureDeclaration(m)) throw this.err(m, "index signature is unsupported");
    if (ts.isCallSignatureDeclaration(m)) throw this.err(m, "call signature is unsupported");
    if (ts.isConstructSignatureDeclaration(m)) {
      throw this.err(m, "construct signature is unsupported");
    }
    if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) {
      throw this.err(m, "getter / setter on interface is unsupported");
    }
    throw this.err(m, `unsupported interface member ${ts.SyntaxKind[m.kind]}`);
  }

  convertInterfaceField(m: ts.PropertySignature): InterfaceFieldMember {
    if (!ts.isIdentifier(m.name)) throw this.err(m, "interface field name must be an identifier");
    if (m.questionToken) throw this.err(m, "optional interface field is unsupported");
    if (!m.type) throw this.err(m, "interface field must have a type annotation");
    let isReadonly = false;
    const modifiers = ts.getModifiers(m);
    if (modifiers) {
      for (const mod of modifiers) {
        if (mod.kind === ts.SyntaxKind.ReadonlyKeyword) {
          isReadonly = true;
        } else {
          throw this.err(mod, `unsupported interface field modifier ${ts.SyntaxKind[mod.kind]}`);
        }
      }
    }
    return {
      kind: "interface_field",
      isReadonly,
      name: m.name.text,
      type: this.convertType(m.type),
      ...this.span(m),
    };
  }

  convertInterfaceMethod(m: ts.MethodSignature): InterfaceMethodMember {
    if (!ts.isIdentifier(m.name)) throw this.err(m, "interface method name must be an identifier");
    if (m.questionToken) throw this.err(m, "optional interface method is unsupported");
    if (m.typeParameters && m.typeParameters.length > 0) {
      throw this.err(m, "generic interface methods are unsupported");
    }
    if (!m.type) throw this.err(m, "interface method must have a return type annotation");
    return {
      kind: "interface_method",
      name: m.name.text,
      params: this.convertParams(m.parameters),
      returnType: this.convertType(m.type),
      ...this.span(m),
    };
  }

  convertTypeAliasDecl(stmt: ts.TypeAliasDeclaration): TypeAliasDecl {
    const isExported = this.hasExportModifier(stmt);
    const typeParams = this.convertTypeParams(stmt.typeParameters);
    return {
      kind: "type_alias_decl",
      isExported,
      name: stmt.name.text,
      typeParams,
      body: this.convertType(stmt.type),
      ...this.span(stmt),
    };
  }

  convertTypeParams(tps: ts.NodeArray<ts.TypeParameterDeclaration> | undefined): TypeParam[] {
    if (!tps || tps.length === 0) return [];
    const out: TypeParam[] = [];
    for (const tp of tps) {
      if (tp.constraint) throw this.err(tp, "type parameter constraint is unsupported");
      if (tp.default) throw this.err(tp, "default type parameter is unsupported");
      out.push({ name: tp.name.text, ...this.span(tp) });
    }
    return out;
  }

  convertParams(ps: ts.NodeArray<ts.ParameterDeclaration>): FunctionParam[] {
    const out: FunctionParam[] = [];
    // Phase 1.5-6 prep-optional-param: accept `param?: T` and enforce the
    // trailing-only rule (a required param cannot follow an optional one), so
    // the oracle agrees with the codegen / topaz_parser side. The `?` is
    // preserved as `isOptional`; the type itself stays raw (codegen lifts to
    // `T | undefined`).
    let sawOptional = false;
    for (const p of ps) {
      if (p.dotDotDotToken) throw this.err(p, "rest parameter is unsupported");
      if (p.initializer) throw this.err(p, "default parameter is unsupported");
      if (!ts.isIdentifier(p.name)) throw this.err(p, "parameter name must be an identifier");
      if (!p.type) throw this.err(p, "parameter must have a type annotation");
      const isOptional = !!p.questionToken;
      if (sawOptional && !isOptional) {
        throw this.err(p, "a required parameter cannot follow an optional parameter");
      }
      if (isOptional) sawOptional = true;
      out.push({
        name: p.name.text,
        type: this.convertType(p.type),
        isOptional,
        ...this.span(p),
      });
    }
    return out;
  }

  hasExportModifier(stmt: ts.HasModifiers): boolean {
    const modifiers = ts.getModifiers(stmt);
    if (!modifiers) return false;
    for (const m of modifiers) {
      if (m.kind === ts.SyntaxKind.DefaultKeyword) {
        throw this.err(m, "`export default` is unsupported");
      }
      if (m.kind === ts.SyntaxKind.ExportKeyword) return true;
    }
    return false;
  }

  rejectAsyncStar(
    fn: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ConstructorDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  ): void {
    const modifiers = ts.canHaveModifiers(fn) ? ts.getModifiers(fn) : undefined;
    if (modifiers) {
      for (const m of modifiers) {
        if (m.kind === ts.SyntaxKind.AsyncKeyword) {
          throw this.err(m, "async functions are unsupported");
        }
      }
    }
    if ("asteriskToken" in fn && (fn as { asteriskToken?: ts.Node }).asteriskToken) {
      throw this.err(fn, "generator functions are unsupported");
    }
  }

  // ============================================================
  // Statements
  // ============================================================

  convertStmt(stmt: ts.Statement): Stmt {
    if (ts.isExpressionStatement(stmt)) return this.convertExprStmt(stmt);
    if (ts.isVariableStatement(stmt)) return this.convertVarStmt(stmt);
    if (ts.isBlock(stmt)) return this.convertBlock(stmt);
    if (ts.isIfStatement(stmt)) return this.convertIfStmt(stmt);
    if (ts.isWhileStatement(stmt)) return this.convertWhileStmt(stmt);
    if (ts.isDoStatement(stmt)) return this.convertDoWhileStmt(stmt);
    if (ts.isForStatement(stmt)) return this.convertForStmt(stmt);
    if (ts.isForOfStatement(stmt)) return this.convertForOfStmt(stmt);
    if (ts.isForInStatement(stmt)) throw this.err(stmt, "for-in is unsupported");
    if (ts.isSwitchStatement(stmt)) return this.convertSwitchStmt(stmt);
    if (ts.isTryStatement(stmt)) return this.convertTryStmt(stmt);
    if (ts.isReturnStatement(stmt)) return this.convertReturnStmt(stmt);
    if (ts.isBreakStatement(stmt)) return this.convertBreakStmt(stmt);
    if (ts.isContinueStatement(stmt)) return this.convertContinueStmt(stmt);
    if (ts.isThrowStatement(stmt)) return this.convertThrowStmt(stmt);
    if (stmt.kind === ts.SyntaxKind.EmptyStatement) {
      const s: EmptyStmt = { kind: "empty_stmt", ...this.span(stmt) };
      return s;
    }
    throw this.err(stmt, `unsupported statement ${ts.SyntaxKind[stmt.kind]}`);
  }

  convertExprStmt(stmt: ts.ExpressionStatement): ExprStmt {
    return {
      kind: "expr_stmt",
      expr: this.convertExpr(stmt.expression),
      ...this.span(stmt),
    };
  }

  convertVarStmt(stmt: ts.VariableStatement): VarDeclStmt | VarDestrDeclStmt {
    return this.convertVarDeclList(stmt.declarationList, this.span(stmt));
  }

  convertVarDeclList(
    list: ts.VariableDeclarationList,
    span: { pos: number; end: number },
  ): VarDeclStmt | VarDestrDeclStmt {
    if (list.declarations.length !== 1) {
      throw this.err(list, "multiple variable declarations in one statement are unsupported");
    }
    const flags = list.flags;
    let declKind: string;
    if (flags & ts.NodeFlags.Const) declKind = "const";
    else if (flags & ts.NodeFlags.Let) declKind = "let";
    else throw this.err(list, "`var` is unsupported (use `let` or `const`)");
    const d = list.declarations[0]!;
    if (d.exclamationToken) throw this.err(d, "definite-assignment assertion is unsupported");
    if (ts.isObjectBindingPattern(d.name)) {
      if (d.type) throw this.err(d, "type annotation on object destructuring pattern is unsupported");
      if (!d.initializer) throw this.err(d, "destructuring binding requires an initializer");
      const bindings: VarDestrBinding[] = [];
      for (const el of d.name.elements) {
        if (el.dotDotDotToken) {
          throw this.err(el, "rest element in object destructuring is unsupported");
        }
        if (el.propertyName) {
          throw this.err(el, "property rename / nested pattern in object destructuring is unsupported");
        }
        if (el.initializer) {
          throw this.err(el, "default value in object destructuring is unsupported");
        }
        if (!ts.isIdentifier(el.name)) {
          throw this.err(el, "property rename / nested pattern in object destructuring is unsupported");
        }
        bindings.push({
          name: el.name.text,
          pos: el.getStart(this.sf),
          end: el.getEnd(),
        });
      }
      return {
        kind: "var_destr_decl",
        declKind,
        bindings,
        init: this.convertExpr(d.initializer),
        ...span,
      };
    }
    if (ts.isArrayBindingPattern(d.name)) {
      throw this.err(d, "array destructuring binding is unsupported");
    }
    if (!ts.isIdentifier(d.name)) {
      throw this.err(d, "destructuring binding in variable declaration is unsupported");
    }
    const type = d.type ? this.convertType(d.type) : undefined;
    const init = d.initializer ? this.convertExpr(d.initializer) : undefined;
    return {
      kind: "var_decl",
      declKind,
      name: d.name.text,
      type,
      init,
      ...span,
    };
  }

  convertBlock(blk: ts.Block): BlockStmt {
    const stmts: Stmt[] = [];
    for (const s of blk.statements) {
      if (this.isDeclLike(s)) {
        throw this.err(s, "declaration inside a block is unsupported");
      }
      stmts.push(this.convertStmt(s));
    }
    return { kind: "block_stmt", stmts, ...this.span(blk) };
  }

  convertIfStmt(stmt: ts.IfStatement): IfStmt {
    return {
      kind: "if_stmt",
      cond: this.convertExpr(stmt.expression),
      thenBranch: this.convertStmt(stmt.thenStatement),
      elseBranch: stmt.elseStatement ? this.convertStmt(stmt.elseStatement) : undefined,
      ...this.span(stmt),
    };
  }

  convertWhileStmt(stmt: ts.WhileStatement): WhileStmt {
    return {
      kind: "while_stmt",
      cond: this.convertExpr(stmt.expression),
      body: this.convertStmt(stmt.statement),
      ...this.span(stmt),
    };
  }

  convertDoWhileStmt(stmt: ts.DoStatement): DoWhileStmt {
    return {
      kind: "do_while_stmt",
      body: this.convertStmt(stmt.statement),
      cond: this.convertExpr(stmt.expression),
      ...this.span(stmt),
    };
  }

  convertForStmt(stmt: ts.ForStatement): ForStmt {
    let init: ForInit | undefined;
    if (stmt.initializer) {
      const ini = stmt.initializer;
      if (ts.isVariableDeclarationList(ini)) {
        const decl = this.convertVarDeclList(ini, this.span(ini));
        if (decl.kind === "var_destr_decl") {
          throw this.err(ini, "destructuring binding in for-init is unsupported");
        }
        init = { kind: "for_init_decl", decl };
      } else {
        init = { kind: "for_init_expr", expr: this.convertExpr(ini) };
      }
    }
    return {
      kind: "for_stmt",
      init,
      cond: stmt.condition ? this.convertExpr(stmt.condition) : undefined,
      update: stmt.incrementor ? this.convertExpr(stmt.incrementor) : undefined,
      body: this.convertStmt(stmt.statement),
      ...this.span(stmt),
    };
  }

  convertForOfStmt(stmt: ts.ForOfStatement): ForOfStmt {
    if (stmt.awaitModifier) throw this.err(stmt, "`for await` is unsupported");
    const binding = this.convertForOfBinding(stmt.initializer);
    return {
      kind: "for_of_stmt",
      binding,
      source: this.convertExpr(stmt.expression),
      body: this.convertStmt(stmt.statement),
      ...this.span(stmt),
    };
  }

  convertForOfBinding(ini: ts.ForInitializer): ForOfBinding {
    if (!ts.isVariableDeclarationList(ini)) {
      throw this.err(ini, "for-of binding must be a variable declaration");
    }
    if (ini.declarations.length !== 1) {
      throw this.err(ini, "for-of binding must declare exactly one variable");
    }
    const flags = ini.flags;
    let declKind: string;
    if (flags & ts.NodeFlags.Const) declKind = "const";
    else if (flags & ts.NodeFlags.Let) declKind = "let";
    else throw this.err(ini, "for-of binding must be `let` or `const`");
    const d = ini.declarations[0]!;
    if (d.initializer) throw this.err(d, "for-of binding cannot have an initializer");
    if (ts.isIdentifier(d.name)) {
      const type = d.type ? this.convertType(d.type) : undefined;
      return { kind: "for_of_single", declKind, name: d.name.text, type };
    }
    if (ts.isArrayBindingPattern(d.name)) {
      if (d.type) throw this.err(d, "type annotation on pair binding is unsupported");
      const elems = d.name.elements;
      if (elems.length !== 2) {
        throw this.err(d.name, "for-of pair destructuring must have exactly two elements");
      }
      const names: string[] = [];
      for (const el of elems) {
        if (ts.isOmittedExpression(el)) {
          throw this.err(el, "omitted (sparse) elements in destructuring are unsupported");
        }
        if (el.dotDotDotToken) throw this.err(el, "rest pattern is unsupported");
        if (el.initializer) throw this.err(el, "default in destructuring is unsupported");
        if (el.propertyName) throw this.err(el, "property rename in destructuring is unsupported");
        if (!ts.isIdentifier(el.name)) {
          throw this.err(el, "nested destructuring is unsupported");
        }
        names.push(el.name.text);
      }
      return { kind: "for_of_pair", declKind, first: names[0]!, second: names[1]! };
    }
    throw this.err(d.name, "for-of binding must be an identifier or [k, v] destructuring");
  }

  convertSwitchStmt(stmt: ts.SwitchStatement): SwitchStmt {
    const cases: SwitchCase[] = [];
    for (const cc of stmt.caseBlock.clauses) {
      if (ts.isCaseClause(cc)) {
        cases.push({
          test: this.convertExpr(cc.expression),
          stmts: cc.statements.map((s) => this.convertStmt(s)),
          ...this.span(cc),
        });
      } else {
        cases.push({
          test: undefined,
          stmts: cc.statements.map((s) => this.convertStmt(s)),
          ...this.span(cc),
        });
      }
    }
    return {
      kind: "switch_stmt",
      discriminant: this.convertExpr(stmt.expression),
      cases,
      ...this.span(stmt),
    };
  }

  convertTryStmt(stmt: ts.TryStatement): TryStmt {
    let catchClause: CatchClause | undefined;
    if (stmt.catchClause) {
      const cc = stmt.catchClause;
      let bindingName: string | undefined;
      let bindingType: TypeNode | undefined;
      if (cc.variableDeclaration) {
        const d = cc.variableDeclaration;
        if (!ts.isIdentifier(d.name)) {
          throw this.err(d, "catch binding must be an identifier");
        }
        bindingName = d.name.text;
        bindingType = d.type ? this.convertType(d.type) : undefined;
      }
      catchClause = {
        bindingName,
        bindingType,
        body: this.convertBlock(cc.block),
        ...this.span(cc),
      };
    }
    return {
      kind: "try_stmt",
      tryBlock: this.convertBlock(stmt.tryBlock),
      catchClause,
      finallyBlock: stmt.finallyBlock ? this.convertBlock(stmt.finallyBlock) : undefined,
      ...this.span(stmt),
    };
  }

  convertReturnStmt(stmt: ts.ReturnStatement): ReturnStmt {
    return {
      kind: "return_stmt",
      value: stmt.expression ? this.convertExpr(stmt.expression) : undefined,
      ...this.span(stmt),
    };
  }

  convertBreakStmt(stmt: ts.BreakStatement): BreakStmt {
    if (stmt.label) throw this.err(stmt, "labeled break is unsupported");
    return { kind: "break_stmt", ...this.span(stmt) };
  }

  convertContinueStmt(stmt: ts.ContinueStatement): ContinueStmt {
    if (stmt.label) throw this.err(stmt, "labeled continue is unsupported");
    return { kind: "continue_stmt", ...this.span(stmt) };
  }

  convertThrowStmt(stmt: ts.ThrowStatement): ThrowStmt {
    return {
      kind: "throw_stmt",
      value: this.convertExpr(stmt.expression),
      ...this.span(stmt),
    };
  }

  // ============================================================
  // Expressions
  // ============================================================

  convertExpr(e: ts.Expression): Expr {
    if (ts.isIdentifier(e)) return this.convertIdent(e);
    if (ts.isNumericLiteral(e)) return this.convertNumLit(e);
    if (ts.isBigIntLiteral(e)) return this.convertBigIntLit(e);
    if (ts.isStringLiteral(e)) return this.convertStrLit(e);
    if (ts.isNoSubstitutionTemplateLiteral(e)) return this.convertNoSubTemplate(e);
    if (e.kind === ts.SyntaxKind.TrueKeyword) {
      const b: BoolLitExpr = { kind: "bool_lit", value: true, ...this.span(e) };
      return b;
    }
    if (e.kind === ts.SyntaxKind.FalseKeyword) {
      const b: BoolLitExpr = { kind: "bool_lit", value: false, ...this.span(e) };
      return b;
    }
    if (e.kind === ts.SyntaxKind.NullKeyword) {
      const n: NullLitExpr = { kind: "null_lit", ...this.span(e) };
      return n;
    }
    if (e.kind === ts.SyntaxKind.ThisKeyword) {
      const t: ThisExpr = { kind: "this_expr", ...this.span(e) };
      return t;
    }
    if (ts.isTemplateExpression(e)) return this.convertTemplate(e);
    if (ts.isArrayLiteralExpression(e)) return this.convertArrayLit(e);
    if (ts.isObjectLiteralExpression(e)) return this.convertObjectLit(e);
    if (ts.isParenthesizedExpression(e)) {
      const p: ParenExpr = {
        kind: "paren_expr",
        inner: this.convertExpr(e.expression),
        ...this.span(e),
      };
      return p;
    }
    if (ts.isCallExpression(e)) return this.convertCall(e);
    if (ts.isNewExpression(e)) return this.convertNew(e);
    // `import.meta.url` は PropertyAccess(expression = MetaProperty `import.meta`)。
    // codegen `checkImportMetaUrl` / `rejectBareMetaProperty` と同一条件で受理 /
    // reject する(`.url` のみ accept、他 `import.meta.<X>` / bare `import.meta` /
    // `new.target` は reject)。convertPropAccess の前で拾う。
    if (ts.isPropertyAccessExpression(e) && ts.isMetaProperty(e.expression)) {
      return this.convertImportMetaUrl(e);
    }
    if (ts.isMetaProperty(e)) {
      this.rejectBareMetaProperty(e);
    }
    if (ts.isPropertyAccessExpression(e)) return this.convertPropAccess(e);
    if (ts.isElementAccessExpression(e)) return this.convertElemAccess(e);
    if (ts.isPrefixUnaryExpression(e)) return this.convertPrefixOp(e);
    if (ts.isPostfixUnaryExpression(e)) return this.convertPostfixOp(e);
    if (ts.isBinaryExpression(e)) return this.convertBinary(e);
    if (ts.isArrowFunction(e)) return this.convertArrow(e);
    if (ts.isNonNullExpression(e)) return this.convertNonNull(e);
    if (ts.isSpreadElement(e)) {
      const s: SpreadExpr = {
        kind: "spread_expr",
        operand: this.convertExpr(e.expression),
        ...this.span(e),
      };
      return s;
    }
    if (ts.isTypeOfExpression(e)) {
      const t: TypeofExpr = {
        kind: "typeof_expr",
        operand: this.convertExpr(e.expression),
        ...this.span(e),
      };
      return t;
    }
    if (ts.isConditionalExpression(e)) {
      const t: TernaryExpr = {
        kind: "ternary_expr",
        cond: this.convertExpr(e.condition),
        thenBranch: this.convertExpr(e.whenTrue),
        elseBranch: this.convertExpr(e.whenFalse),
        ...this.span(e),
      };
      return t;
    }
    throw this.err(e, `unsupported expression ${ts.SyntaxKind[e.kind]}`);
  }

  convertImportMetaUrl(e: ts.PropertyAccessExpression): ImportMetaUrlExpr {
    const meta = e.expression as ts.MetaProperty;
    if (meta.keywordToken !== ts.SyntaxKind.ImportKeyword) {
      throw this.err(
        e,
        "unsupported meta property (only `import.meta.url` is accepted)",
      );
    }
    if (meta.name.text !== "meta") {
      throw this.err(
        e,
        `unsupported \`import.${meta.name.text}\` (only \`import.meta.url\` is accepted)`,
      );
    }
    if (e.name.text !== "url") {
      throw this.err(
        e,
        `unsupported \`import.meta.${e.name.text}\` (only \`import.meta.url\` is accepted)`,
      );
    }
    return { kind: "import_meta_url", ...this.span(e) };
  }

  rejectBareMetaProperty(e: ts.MetaProperty): never {
    if (e.keywordToken === ts.SyntaxKind.NewKeyword) {
      throw this.err(e, "`new.target` is unsupported");
    }
    throw this.err(
      e,
      "bare `import.meta` is unsupported (only `import.meta.url` is accepted)",
    );
  }

  convertIdent(e: ts.Identifier): IdentExpr | UndefinedLitExpr {
    if (e.text === "undefined") {
      return { kind: "undefined_lit", ...this.span(e) };
    }
    return { kind: "ident", name: e.text, ...this.span(e) };
  }

  convertNumLit(e: ts.NumericLiteral): NumLitExpr {
    // `e.text` は tsc が正規化した形 (`1e21` → `1e+21`) なので、ソース上の表記を
    // 保ちたい topaz_parser と diff が出る。原文 (`e.getText(sf)`) を採用して
    // ハーネスの等価性が表記レベルで一致するようにする。`value` は parseFloat
    // ベースで両 parser とも数値として等価。
    const text = e.getText(this.sf);
    return {
      kind: "num_lit",
      text,
      value: Number(e.text),
      ...this.span(e),
    };
  }

  convertBigIntLit(e: ts.BigIntLiteral): BigIntLitExpr {
    const text = e.getText(this.sf);
    if (!isDecimalBigIntText(text)) {
      throw this.err(e, "only decimal bigint literals are supported");
    }
    return {
      kind: "bigint_lit",
      text,
      ...this.span(e),
    };
  }

  convertStrLit(e: ts.StringLiteral): StrLitExpr {
    return { kind: "str_lit", value: e.text, ...this.span(e) };
  }

  convertNoSubTemplate(e: ts.NoSubstitutionTemplateLiteral): TemplateLitExpr {
    return {
      kind: "template_lit",
      head: e.text,
      subs: [],
      ...this.span(e),
    };
  }

  convertTemplate(e: ts.TemplateExpression): TemplateLitExpr {
    const subs: TemplateSub[] = [];
    for (const span of e.templateSpans) {
      subs.push({
        expr: this.convertExpr(span.expression),
        cookedAfter: span.literal.text,
      });
    }
    return {
      kind: "template_lit",
      head: e.head.text,
      subs,
      ...this.span(e),
    };
  }

  convertArrayLit(e: ts.ArrayLiteralExpression): ArrayLitExpr {
    const elems: ArrayElem[] = [];
    for (const el of e.elements) {
      if (ts.isOmittedExpression(el)) {
        throw this.err(el, "holes in array literals are unsupported");
      }
      if (ts.isSpreadElement(el)) {
        elems.push({ kind: "spread", expr: this.convertExpr(el.expression) });
      } else {
        elems.push({ kind: "elem", expr: this.convertExpr(el) });
      }
    }
    return { kind: "array_lit", elems, ...this.span(e) };
  }

  convertObjectLit(e: ts.ObjectLiteralExpression): ObjectLitExpr {
    const props: ObjectMember[] = [];
    for (const p of e.properties) {
      if (ts.isPropertyAssignment(p)) {
        if (!ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name)) {
          throw this.err(p, "object literal property name must be an identifier or string literal");
        }
        const name = ts.isIdentifier(p.name) ? p.name.text : p.name.text;
        props.push({
          kind: "prop_kv",
          name,
          value: this.convertExpr(p.initializer),
          ...this.span(p),
        });
      } else if (p.kind === ts.SyntaxKind.ShorthandPropertyAssignment) {
        const sp = p as ts.ShorthandPropertyAssignment;
        props.push({
          kind: "prop_shorthand",
          name: sp.name.text,
          ...this.span(p),
        });
      } else if (p.kind === ts.SyntaxKind.SpreadAssignment) {
        const sa = p as ts.SpreadAssignment;
        props.push({
          kind: "prop_spread",
          expr: this.convertExpr(sa.expression),
          ...this.span(p),
        });
      } else {
        // Phase 1.5-6e-2: align with codegen's object-literal emit wording so
        // the method-shorthand fail-case's expected substring still matches
        // when the reject surfaces from convert (method shorthand / getter /
        // setter reach here; spread is converted to `prop_spread` and rejected
        // later in codegen with the same wording).
        throw this.err(
          p,
          "object literal only supports `name: value` and `name` shorthand properties (no method shorthand, getter / setter, spread)",
        );
      }
    }
    return { kind: "object_lit", props, ...this.span(e) };
  }

  convertCall(e: ts.CallExpression): CallExpr {
    const typeArgs = e.typeArguments ? e.typeArguments.map((t) => this.convertType(t)) : [];
    const args = e.arguments.map((a) => this.convertExpr(a));
    const optional = !!e.questionDotToken;
    return {
      kind: "call_expr",
      callee: this.convertExpr(e.expression),
      typeArgs,
      args,
      optional,
      ...this.span(e),
    };
  }

  convertNew(e: ts.NewExpression): NewExpr {
    const typeArgs = e.typeArguments ? e.typeArguments.map((t) => this.convertType(t)) : [];
    const args = e.arguments ? e.arguments.map((a) => this.convertExpr(a)) : [];
    return {
      kind: "new_expr",
      callee: this.convertExpr(e.expression),
      typeArgs,
      args,
      ...this.span(e),
    };
  }

  convertPropAccess(e: ts.PropertyAccessExpression): PropAccessExpr {
    if (!ts.isIdentifier(e.name)) {
      throw this.err(e.name, "property access name must be an identifier");
    }
    return {
      kind: "prop_access",
      receiver: this.convertExpr(e.expression),
      name: e.name.text,
      optional: !!e.questionDotToken,
      ...this.span(e),
    };
  }

  convertElemAccess(e: ts.ElementAccessExpression): ElemAccessExpr {
    return {
      kind: "elem_access",
      receiver: this.convertExpr(e.expression),
      index: this.convertExpr(e.argumentExpression),
      optional: !!e.questionDotToken,
      ...this.span(e),
    };
  }

  convertPrefixOp(e: ts.PrefixUnaryExpression): PrefixOpExpr {
    const op = this.prefixOpText(e.operator, e);
    return {
      kind: "prefix_op",
      op,
      operand: this.convertExpr(e.operand),
      ...this.span(e),
    };
  }

  prefixOpText(kind: ts.PrefixUnaryOperator, anchor: ts.Node): string {
    switch (kind) {
      case ts.SyntaxKind.PlusToken: return "+";
      case ts.SyntaxKind.MinusToken: return "-";
      case ts.SyntaxKind.ExclamationToken: return "!";
      case ts.SyntaxKind.PlusPlusToken: return "++";
      case ts.SyntaxKind.MinusMinusToken: return "--";
      case ts.SyntaxKind.TildeToken: return "~";
      default:
        throw this.err(anchor, `unsupported prefix operator ${ts.SyntaxKind[kind]}`);
    }
  }

  convertPostfixOp(e: ts.PostfixUnaryExpression): PostfixOpExpr {
    let op: string;
    if (e.operator === ts.SyntaxKind.PlusPlusToken) op = "++";
    else if (e.operator === ts.SyntaxKind.MinusMinusToken) op = "--";
    else throw this.err(e, `unsupported postfix operator ${ts.SyntaxKind[e.operator]}`);
    return {
      kind: "postfix_op",
      op,
      operand: this.convertExpr(e.operand),
      ...this.span(e),
    };
  }

  convertBinary(e: ts.BinaryExpression): Expr {
    const opKind = e.operatorToken.kind;
    if (opKind === ts.SyntaxKind.InstanceOfKeyword) {
      const ie: InstanceofExpr = {
        kind: "instanceof_expr",
        lhs: this.convertExpr(e.left),
        rhs: this.convertExpr(e.right),
        ...this.span(e),
      };
      return ie;
    }
    const opText = this.binaryOpText(opKind, e);
    if (this.isAssignmentOp(opKind)) {
      const a: AssignExpr = {
        kind: "assign_expr",
        op: opText,
        target: this.convertExpr(e.left),
        value: this.convertExpr(e.right),
        ...this.span(e),
      };
      return a;
    }
    const b: BinOpExpr = {
      kind: "bin_op",
      op: opText,
      lhs: this.convertExpr(e.left),
      rhs: this.convertExpr(e.right),
      ...this.span(e),
    };
    return b;
  }

  isAssignmentOp(kind: ts.SyntaxKind): boolean {
    switch (kind) {
      case ts.SyntaxKind.EqualsToken:
      case ts.SyntaxKind.PlusEqualsToken:
      case ts.SyntaxKind.MinusEqualsToken:
      case ts.SyntaxKind.AsteriskEqualsToken:
      case ts.SyntaxKind.SlashEqualsToken:
      case ts.SyntaxKind.PercentEqualsToken:
        return true;
      default:
        return false;
    }
  }

  binaryOpText(kind: ts.SyntaxKind, anchor: ts.Node): string {
    switch (kind) {
      case ts.SyntaxKind.PlusToken: return "+";
      case ts.SyntaxKind.MinusToken: return "-";
      case ts.SyntaxKind.AsteriskToken: return "*";
      case ts.SyntaxKind.SlashToken: return "/";
      case ts.SyntaxKind.PercentToken: return "%";
      case ts.SyntaxKind.EqualsEqualsToken: return "==";
      case ts.SyntaxKind.ExclamationEqualsToken: return "!=";
      case ts.SyntaxKind.EqualsEqualsEqualsToken: return "===";
      case ts.SyntaxKind.ExclamationEqualsEqualsToken: return "!==";
      case ts.SyntaxKind.LessThanToken: return "<";
      case ts.SyntaxKind.LessThanEqualsToken: return "<=";
      case ts.SyntaxKind.GreaterThanToken: return ">";
      case ts.SyntaxKind.GreaterThanEqualsToken: return ">=";
      case ts.SyntaxKind.AmpersandAmpersandToken: return "&&";
      case ts.SyntaxKind.BarBarToken: return "||";
      case ts.SyntaxKind.QuestionQuestionToken: return "??";
      case ts.SyntaxKind.EqualsToken: return "=";
      case ts.SyntaxKind.PlusEqualsToken: return "+=";
      case ts.SyntaxKind.MinusEqualsToken: return "-=";
      case ts.SyntaxKind.AsteriskEqualsToken: return "*=";
      case ts.SyntaxKind.SlashEqualsToken: return "/=";
      case ts.SyntaxKind.PercentEqualsToken: return "%=";
      case ts.SyntaxKind.CommaToken: return ",";
      default:
        throw this.err(anchor, `unsupported binary operator ${ts.SyntaxKind[kind]}`);
    }
  }

  convertArrow(e: ts.ArrowFunction): ArrowExpr {
    this.rejectAsyncStar(e);
    if (e.typeParameters && e.typeParameters.length > 0) {
      throw this.err(e, "generic arrow function is unsupported");
    }
    const params: ArrowParam[] = [];
    for (const p of e.parameters) {
      if (p.dotDotDotToken) throw this.err(p, "rest parameter in arrow is unsupported");
      if (p.initializer) throw this.err(p, "default parameter in arrow is unsupported");
      if (p.questionToken) throw this.err(p, "optional parameter in arrow is unsupported");
      if (!ts.isIdentifier(p.name)) throw this.err(p, "arrow parameter must be an identifier");
      params.push({
        name: p.name.text,
        type: p.type ? this.convertType(p.type) : undefined,
        ...this.span(p),
      });
    }
    const returnType = e.type ? this.convertType(e.type) : undefined;
    let body: ArrowBody;
    if (ts.isBlock(e.body)) {
      body = { kind: "arrow_block_body", stmts: e.body.statements.map((s) => this.convertStmt(s)) };
    } else {
      body = { kind: "arrow_expr_body", expr: this.convertExpr(e.body) };
    }
    return {
      kind: "arrow_expr",
      params,
      returnType,
      body,
      ...this.span(e),
    };
  }

  convertNonNull(e: ts.NonNullExpression): NonNullExpr {
    return {
      kind: "non_null",
      operand: this.convertExpr(e.expression),
      ...this.span(e),
    };
  }

  // ============================================================
  // Types
  // ============================================================

  convertType(t: ts.TypeNode): TypeNode {
    switch (t.kind) {
      case ts.SyntaxKind.NumberKeyword:
        return { kind: "type_ref", name: "number", typeArgs: [], ...this.span(t) };
      case ts.SyntaxKind.BigIntKeyword:
        return { kind: "type_ref", name: "bigint", typeArgs: [], ...this.span(t) };
      case ts.SyntaxKind.StringKeyword:
        return { kind: "type_ref", name: "string", typeArgs: [], ...this.span(t) };
      case ts.SyntaxKind.BooleanKeyword:
        return { kind: "type_ref", name: "boolean", typeArgs: [], ...this.span(t) };
      case ts.SyntaxKind.VoidKeyword: {
        const v: TypeVoid = { kind: "type_void", ...this.span(t) };
        return v;
      }
      case ts.SyntaxKind.UnknownKeyword: {
        const u: TypeUnknown = { kind: "type_unknown", ...this.span(t) };
        return u;
      }
      case ts.SyntaxKind.UndefinedKeyword:
        return { kind: "type_ref", name: "undefined", typeArgs: [], ...this.span(t) };
      case ts.SyntaxKind.NeverKeyword:
        return { kind: "type_ref", name: "never", typeArgs: [], ...this.span(t) };
    }
    if (ts.isTypeReferenceNode(t)) {
      if (!ts.isIdentifier(t.typeName)) {
        throw this.err(t.typeName, "qualified type reference is unsupported");
      }
      const args = t.typeArguments ? t.typeArguments.map((a) => this.convertType(a)) : [];
      const r: TypeRef = {
        kind: "type_ref",
        name: t.typeName.text,
        typeArgs: args,
        ...this.span(t),
      };
      return r;
    }
    if (ts.isUnionTypeNode(t)) {
      const u: TypeUnion = {
        kind: "type_union",
        variants: t.types.map((x) => this.convertType(x)),
        ...this.span(t),
      };
      return u;
    }
    if (ts.isArrayTypeNode(t)) {
      const a: TypeArrayShorthand = {
        kind: "type_array",
        elem: this.convertType(t.elementType),
        ...this.span(t),
      };
      return a;
    }
    if (ts.isTypeLiteralNode(t)) {
      const members: TypeLiteralMember[] = [];
      for (const m of t.members) {
        members.push(this.convertTypeLiteralMember(m));
      }
      const l: TypeLiteralNode = {
        kind: "type_literal",
        members,
        ...this.span(t),
      };
      return l;
    }
    if (ts.isFunctionTypeNode(t)) {
      const params: TypeFnParam[] = [];
      for (const p of t.parameters) {
        if (p.dotDotDotToken) throw this.err(p, "rest parameter in fn type is unsupported");
        if (p.initializer) throw this.err(p, "default parameter in fn type is unsupported");
        if (p.questionToken) throw this.err(p, "optional parameter in fn type is unsupported");
        if (!ts.isIdentifier(p.name)) {
          throw this.err(p, "fn-type parameter name must be an identifier");
        }
        if (!p.type) throw this.err(p, "fn-type parameter must have a type annotation");
        params.push({ name: p.name.text, type: this.convertType(p.type), ...this.span(p) });
      }
      const f: TypeFn = {
        kind: "type_fn",
        params,
        returnType: this.convertType(t.type),
        ...this.span(t),
      };
      return f;
    }
    if (ts.isLiteralTypeNode(t)) {
      const lit = t.literal;
      if (ts.isStringLiteral(lit)) {
        const s: TypeStrLit = { kind: "type_str_lit", value: lit.text, ...this.span(t) };
        return s;
      }
      if (ts.isNumericLiteral(lit)) {
        const n: TypeNumLit = { kind: "type_num_lit", value: Number(lit.text), ...this.span(t) };
        return n;
      }
      if (lit.kind === ts.SyntaxKind.NullKeyword) {
        return { kind: "type_ref", name: "null", typeArgs: [], ...this.span(t) };
      }
      throw this.err(lit, `unsupported literal type ${ts.SyntaxKind[lit.kind]}`);
    }
    if (ts.isParenthesizedTypeNode(t)) {
      return this.convertType(t.type);
    }
    throw this.err(t, `unsupported type node ${ts.SyntaxKind[t.kind]}`);
  }

  convertTypeLiteralMember(m: ts.TypeElement): TypeLiteralMember {
    if (ts.isPropertySignature(m)) {
      if (!ts.isIdentifier(m.name)) {
        throw this.err(m, "type literal field name must be an identifier");
      }
      if (!m.type) throw this.err(m, "type literal field must have a type annotation");
      let isReadonly = false;
      const modifiers = ts.getModifiers(m);
      if (modifiers) {
        for (const mod of modifiers) {
          if (mod.kind === ts.SyntaxKind.ReadonlyKeyword) isReadonly = true;
          else throw this.err(mod, `unsupported type literal field modifier ${ts.SyntaxKind[mod.kind]}`);
        }
      }
      const f: TypeLiteralField = {
        kind: "type_lit_field",
        name: m.name.text,
        type: this.convertType(m.type),
        isReadonly,
        isOptional: !!m.questionToken,
        ...this.span(m),
      };
      return f;
    }
    if (ts.isMethodSignature(m)) {
      if (!ts.isIdentifier(m.name)) {
        throw this.err(m, "type literal method name must be an identifier");
      }
      if (!m.type) throw this.err(m, "type literal method must have a return type annotation");
      const params: TypeFnParam[] = [];
      for (const p of m.parameters) {
        if (p.dotDotDotToken) throw this.err(p, "rest parameter in type literal method is unsupported");
        if (!ts.isIdentifier(p.name)) {
          throw this.err(p, "type literal method param name must be an identifier");
        }
        if (!p.type) throw this.err(p, "type literal method param must have a type annotation");
        params.push({ name: p.name.text, type: this.convertType(p.type), ...this.span(p) });
      }
      const md: TypeLiteralMethod = {
        kind: "type_lit_method",
        name: m.name.text,
        params,
        returnType: this.convertType(m.type),
        isOptional: !!m.questionToken,
        ...this.span(m),
      };
      return md;
    }
    throw this.err(m, `unsupported type literal member ${ts.SyntaxKind[m.kind]}`);
  }
}

// Topaz parser — Array<Token> -> SourceModule.
//
// Written within the Topaz subset so the same source compiles under stage1
// (Node + tsc) and stage2 (self-hosted Topaz). Recursive descent for
// statements / declarations; precedence climbing for expressions.
//
// Module-level statement allowance follows the loader rule: only root
// modules carry top-level executable statements. The parser itself does
// not enforce that — it surfaces declarations and statements as
// `ModuleItem` and lets the caller decide.

import {
  BigIntToken,
  IdentToken,
  KeywordToken,
  PunctToken,
  Token,
  tokenize,
  computeLineStarts,
} from "./lexer.js";
import {
  Decl,
  Expr,
  Stmt,
  TypeNode,
  TypeFnParam,
  ArrayElem,
  ArrowBody,
  ArrowParam,
  BlockStmt,
  CatchClause,
  ClassMember,
  ClassMemberModifier,
  FunctionParam,
  ForInit,
  ForOfBinding,
  ImportSpecifier,
  InterfaceMember,
  ModuleItem,
  ObjectMember,
  SourceModule,
  TypeLiteralMember,
  TypeLiteralFieldNameKind,
  SwitchCase,
  TemplateSub,
  TypeParam,
  VarDeclStmt,
  VarDestrDeclStmt,
  VarDestrBinding,
} from "./ast.js";
import { readFileSync } from "node:fs";

export class ParseError {
  file: string;
  pos: number;
  message: string;
  constructor(file: string, pos: number, message: string) {
    this.file = file;
    this.pos = pos;
    this.message = message;
  }
}

export class Parser {
  file: string;
  tokens: Array<Token>;
  pos: number = 0;
  lineStarts: Array<number>;

  constructor(tokens: Array<Token>, file: string, lineStarts: Array<number>) {
    this.tokens = tokens;
    this.file = file;
    this.lineStarts = lineStarts;
  }

  peek(offset: number): Token {
    const i: number = this.pos + offset;
    if (i >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1];
    }
    return this.tokens[i];
  }

  current(): Token {
    return this.peek(0);
  }

  advance(): Token {
    const t: Token = this.peek(0);
    if (t.kind !== "eof") this.pos += 1;
    return t;
  }

  error(t: Token, msg: string): ParseError {
    return new ParseError(this.file, t.pos, msg);
  }

  // Skip newlines (treated as soft separators). Newlines are token-level
  // not statement-terminating — semicolons / closing braces do the real
  // termination work.
  skipNewlines(): void {
    while (this.current().kind === "newline") {
      this.pos += 1;
    }
  }

  isPunct(t: Token, op: string): boolean {
    return t.kind === "punct" && t.op === op;
  }

  isKeyword(t: Token, word: string): boolean {
    return t.kind === "keyword" && t.word === word;
  }

  matchPunct(op: string): boolean {
    this.skipNewlines();
    const t: Token = this.current();
    if (this.isPunct(t, op)) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  matchKeyword(word: string): boolean {
    this.skipNewlines();
    const t: Token = this.current();
    if (this.isKeyword(t, word)) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  expectPunct(op: string): PunctToken {
    this.skipNewlines();
    const t: Token = this.current();
    if (t.kind !== "punct" || t.op !== op) {
      throw this.error(t, `expected '${op}'`);
    }
    this.pos += 1;
    return t;
  }

  expectKeyword(word: string): KeywordToken {
    this.skipNewlines();
    const t: Token = this.current();
    if (t.kind !== "keyword" || t.word !== word) {
      throw this.error(t, `expected keyword '${word}'`);
    }
    this.pos += 1;
    return t;
  }

  expectIdent(): IdentToken {
    this.skipNewlines();
    const t: Token = this.current();
    if (t.kind !== "ident") {
      throw this.error(t, "expected identifier");
    }
    this.pos += 1;
    return t;
  }

  // Member-name slot: ident or any keyword. JS/TS allows reserved words as
  // property / member names; we surface them as a string + position pair.
  expectMemberName(): { text: string; pos: number; end: number } {
    this.skipNewlines();
    const t: Token = this.current();
    if (t.kind === "ident") {
      this.pos += 1;
      return { text: t.text, pos: t.pos, end: t.end };
    }
    if (t.kind === "keyword") {
      this.pos += 1;
      return { text: t.word, pos: t.pos, end: t.end };
    }
    throw this.error(t, "expected member name");
  }

  expectTypeLiteralFieldName(): { text: string; nameKind: TypeLiteralFieldNameKind; pos: number; end: number } {
    this.skipNewlines();
    const t: Token = this.current();
    if (t.kind === "punct" && t.op === "[") {
      const start: Token = t;
      this.pos += 1;
      this.skipNewlines();
      const name: Token = this.current();
      if (name.kind === "ident") {
        this.pos += 1;
        this.skipNewlines();
        const end: Token = this.expectPunct("]");
        return { text: name.text, nameKind: "computed_identifier", pos: start.pos, end: end.end };
      }
      while (this.current().kind !== "eof") {
        const cur: Token = this.current();
        this.pos += 1;
        if (cur.kind === "punct" && cur.op === "]") {
          return { text: "<computed>", nameKind: "computed_unsupported", pos: start.pos, end: cur.end };
        }
      }
      throw this.error(start, "unterminated computed type literal field name");
    }
    const plain: { text: string; pos: number; end: number } = this.expectMemberName();
    return { text: plain.text, nameKind: "identifier", pos: plain.pos, end: plain.end };
  }

  // ============================================================
  // Module
  // ============================================================

  parseModule(): SourceModule {
    const items: Array<ModuleItem> = [];
    while (this.current().kind !== "eof") {
      this.skipNewlines();
      if (this.current().kind === "eof") break;
      const item: ModuleItem = this.parseModuleItem();
      items.push(item);
    }
    return {
      filePath: this.file,
      isInternalModule: false,
      stableModuleId: "",
      lineStarts: this.lineStarts,
      items: items,
    };
  }

  parseModuleItem(): ModuleItem {
    const t: Token = this.current();
    if (this.isKeyword(t, "import")) {
      const decl: Decl = this.parseImportDecl();
      return { kind: "module_decl", decl: decl };
    }
    let isExported: boolean = false;
    if (this.isKeyword(t, "export")) {
      this.pos += 1;
      isExported = true;
    }
    let isAsync: boolean = false;
    let head: Token = this.current();
    if (this.isKeyword(head, "async")) {
      this.pos += 1;
      isAsync = true;
      head = this.current();
    }
    if (this.isKeyword(head, "function")) {
      const d: Decl = this.parseFunctionDecl(isExported, isAsync);
      return { kind: "module_decl", decl: d };
    }
    if (this.isKeyword(head, "class")) {
      const d: Decl = this.parseClassDecl(isExported);
      return { kind: "module_decl", decl: d };
    }
    if (this.isKeyword(head, "interface")) {
      const d: Decl = this.parseInterfaceDecl(isExported);
      return { kind: "module_decl", decl: d };
    }
    if (this.isKeyword(head, "type")) {
      const d: Decl = this.parseTypeAliasDecl(isExported);
      return { kind: "module_decl", decl: d };
    }
    if (isExported) {
      throw this.error(head, "expected function / class / interface / type after 'export'");
    }
    const stmt: Stmt = this.parseStmt();
    return { kind: "module_stmt", stmt: stmt };
  }

  parseImportDecl(): Decl {
    const start: Token = this.expectKeyword("import");
    const specifiers: Array<ImportSpecifier> = [];
    let isTypeOnly: boolean = false;
    let defaultName: string | undefined = undefined;
    let defaultNamePos: number = -1;
    let namespaceName: string | undefined = undefined;
    let namespaceNamePos: number = -1;
    const afterImport: Token = this.current();
    if (afterImport.kind === "string") {
      const sidePath = afterImport;
      this.pos += 1;
      this.matchPunct(";");
      return {
        kind: "import_decl",
        specifiers: specifiers,
        modulePath: sidePath.value,
        modulePathPos: sidePath.pos,
        modulePathEnd: sidePath.end,
        isTypeOnly: isTypeOnly,
        defaultName: defaultName,
        defaultNamePos: defaultNamePos,
        namespaceName: namespaceName,
        namespaceNamePos: namespaceNamePos,
        pos: start.pos,
        end: sidePath.end,
      };
    }
    if (this.matchKeyword("type")) {
      isTypeOnly = true;
    }
    if (this.matchPunct("{")) {
      while (!this.matchPunct("}")) {
        this.skipNewlines();
        let specIsTypeOnly: boolean = false;
        let specStart: number = this.current().pos;
        if (this.matchKeyword("type")) {
          specIsTypeOnly = true;
        }
        const imported: Token = this.expectIdent();
        let localName: string = imported.text;
        let specEnd: number = imported.end;
        if (this.matchKeyword("as")) {
          const local: Token = this.expectIdent();
          localName = local.text;
          specEnd = local.end;
        }
        specifiers.push({
          importedName: imported.text,
          localName: localName,
          isTypeOnly: specIsTypeOnly,
          pos: specStart,
          end: specEnd,
        });
        if (!this.matchPunct(",")) {
          this.expectPunct("}");
          break;
        }
      }
    } else if (this.matchPunct("*")) {
      this.expectKeyword("as");
      const ns: Token = this.expectIdent();
      namespaceName = ns.text;
      namespaceNamePos = ns.pos;
    } else {
      const def: Token = this.expectIdent();
      defaultName = def.text;
      defaultNamePos = def.pos;
      if (this.matchPunct(",")) {
        if (this.matchPunct("*")) {
          this.expectKeyword("as");
          const ns: Token = this.expectIdent();
          namespaceName = ns.text;
          namespaceNamePos = ns.pos;
        } else {
          this.expectPunct("{");
          while (!this.matchPunct("}")) {
            this.skipNewlines();
            let specIsTypeOnly: boolean = false;
            let specStart: number = this.current().pos;
            if (this.matchKeyword("type")) {
              specIsTypeOnly = true;
            }
            const imported: Token = this.expectIdent();
            let localName: string = imported.text;
            let specEnd: number = imported.end;
            if (this.matchKeyword("as")) {
              const local: Token = this.expectIdent();
              localName = local.text;
              specEnd = local.end;
            }
            specifiers.push({
              importedName: imported.text,
              localName: localName,
              isTypeOnly: specIsTypeOnly,
              pos: specStart,
              end: specEnd,
            });
            if (!this.matchPunct(",")) {
              this.expectPunct("}");
              break;
            }
          }
        }
      }
    }
    this.expectKeyword("from");
    const path: Token = this.current();
    if (path.kind !== "string") {
      throw this.error(path, "expected module path string");
    }
    this.pos += 1;
    this.matchPunct(";");
    return {
      kind: "import_decl",
      specifiers: specifiers,
      modulePath: path.value,
      modulePathPos: path.pos,
      modulePathEnd: path.end,
      isTypeOnly: isTypeOnly,
      defaultName: defaultName,
      defaultNamePos: defaultNamePos,
      namespaceName: namespaceName,
      namespaceNamePos: namespaceNamePos,
      pos: start.pos,
      end: path.end,
    };
  }

  parseFunctionDecl(isExported: boolean, isAsync: boolean): Decl {
    const start: Token = this.expectKeyword("function");
    const name: Token = this.expectIdent();
    const typeParams: Array<TypeParam> = this.parseTypeParamsOpt();
    this.expectPunct("(");
    const params: Array<FunctionParam> = this.parseFunctionParams();
    let returnType: TypeNode | undefined = undefined;
    if (this.matchPunct(":")) {
      returnType = this.parseType();
    }
    const body: BlockStmt = this.parseBlock();
    return {
      kind: "function_decl",
      isExported: isExported,
      isAsync: isAsync,
      name: name.text,
      typeParams: typeParams,
      params: params,
      returnType: returnType,
      body: body,
      pos: start.pos,
      end: body.end,
    };
  }

  parseTypeParamsOpt(): Array<TypeParam> {
    const out: Array<TypeParam> = [];
    if (!this.matchPunct("<")) return out;
    while (!this.matchPunct(">")) {
      this.skipNewlines();
      const id: Token = this.expectIdent();
      let constraint: TypeNode | undefined = undefined;
      let end: number = id.end;
      if (this.matchKeyword("extends")) {
        const parsedConstraint: TypeNode = this.parseType();
        constraint = parsedConstraint;
        end = parsedConstraint.end;
      }
      if (this.isPunct(this.current(), "=")) {
        throw this.error(this.current(), "default type parameter is unsupported");
      }
      out.push({ name: id.text, constraint: constraint, pos: id.pos, end: end });
      if (!this.matchPunct(",")) {
        this.expectPunct(">");
        break;
      }
    }
    return out;
  }

  parseFunctionParams(): Array<FunctionParam> {
    const out: Array<FunctionParam> = [];
    // Phase 1.5-6 prep-optional-param: accept `param?: T`. Trailing-only is
    // enforced here so the parser side matches the oracle / codegen rejection.
    let sawOptional: boolean = false;
    while (!this.matchPunct(")")) {
      this.skipNewlines();
      const name: Token = this.expectIdent();
      const isOptional: boolean = this.matchPunct("?");
      this.expectPunct(":");
      const ty: TypeNode = this.parseType();
      if (sawOptional && !isOptional) {
        throw this.error(name, "a required parameter cannot follow an optional parameter");
      }
      if (isOptional) sawOptional = true;
      out.push({ name: name.text, type: ty, isOptional, pos: name.pos, end: ty.end });
      if (!this.matchPunct(",")) {
        this.expectPunct(")");
        break;
      }
    }
    return out;
  }

  parseClassDecl(isExported: boolean): Decl {
    const start: Token = this.expectKeyword("class");
    const name: Token = this.expectIdent();
    const typeParams: Array<TypeParam> = this.parseTypeParamsOpt();
    const implementsList: Array<string> = [];
    if (this.matchKeyword("implements")) {
      while (true) {
        const id: Token = this.expectIdent();
        implementsList.push(id.text);
        if (!this.matchPunct(",")) break;
      }
    }
    this.expectPunct("{");
    const members: Array<ClassMember> = [];
    while (!this.matchPunct("}")) {
      this.skipNewlines();
      if (this.matchPunct(";")) continue;
      const m: ClassMember = this.parseClassMember();
      members.push(m);
    }
    const endTok: Token = this.peek(-1);
    return {
      kind: "class_decl",
      isExported: isExported,
      name: name.text,
      typeParams: typeParams,
      implementsList: implementsList,
      members: members,
      pos: start.pos,
      end: endTok.end,
    };
  }

  parseClassMember(): ClassMember {
    const modStart: Token = this.current();
    const modifiers: Array<ClassMemberModifier> = [];
    while (true) {
      const t: Token = this.current();
      if (t.kind !== "keyword") break;
      if (
        t.word === "public" ||
        t.word === "private" ||
        t.word === "protected" ||
        t.word === "readonly" ||
        t.word === "static" ||
        t.word === "abstract" ||
        t.word === "override"
      ) {
        modifiers.push(t.word);
        this.pos += 1;
        continue;
      }
      break;
    }

    let isAsync: boolean = false;
    if (this.matchKeyword("async")) {
      isAsync = true;
    }

    const head: Token = this.current();
    let name: string = "";
    let isCtor: boolean = false;

    if (head.kind === "ident") {
      name = head.text;
      if (name === "constructor") isCtor = true;
      this.pos += 1;
    } else if (head.kind === "keyword" && head.word === "constructor") {
      name = "constructor";
      isCtor = true;
      this.pos += 1;
    } else {
      throw this.error(head, "expected class member name");
    }
    if (isAsync && isCtor) {
      throw this.error(head, "async constructors are unsupported");
    }

    const after: Token = this.current();
    if (this.isPunct(after, "(") || this.isPunct(after, "<")) {
      const typeParams: Array<TypeParam> = this.parseTypeParamsOpt();
      this.expectPunct("(");
      const params: Array<FunctionParam> = this.parseFunctionParams();
      let returnType: TypeNode | undefined = undefined;
      if (this.matchPunct(":")) {
        returnType = this.parseType();
      }
      const body: BlockStmt = this.parseBlock();
      if (typeParams.length > 0) {
        throw this.error(modStart, "generic method is unsupported");
      }
      return {
        kind: "class_method",
        modifiers: modifiers,
        isCtor: isCtor,
        isAsync: isAsync,
        name: name,
        params: params,
        returnType: returnType,
        body: body,
        pos: modStart.pos,
        end: body.end,
      };
    }
    if (isAsync) {
      throw this.error(head, "async class fields are unsupported");
    }

    // field
    this.expectPunct(":");
    const ty: TypeNode = this.parseType();
    let init: Expr | undefined = undefined;
    if (this.matchPunct("=")) {
      init = this.parseAssign();
    }
    this.matchPunct(";");
    return {
      kind: "class_field",
      modifiers: modifiers,
      name: name,
      type: ty,
      initializer: init,
      pos: modStart.pos,
      end: ty.end,
    };
  }

  parseInterfaceDecl(isExported: boolean): Decl {
    const start: Token = this.expectKeyword("interface");
    const name: Token = this.expectIdent();
    this.expectPunct("{");
    const members: Array<InterfaceMember> = [];
    while (!this.matchPunct("}")) {
      this.skipNewlines();
      if (this.matchPunct(";")) continue;
      const m: InterfaceMember = this.parseInterfaceMember();
      members.push(m);
    }
    const endTok: Token = this.peek(-1);
    return {
      kind: "interface_decl",
      isExported: isExported,
      name: name.text,
      members: members,
      pos: start.pos,
      end: endTok.end,
    };
  }

  parseInterfaceMember(): InterfaceMember {
    let isReadonly: boolean = false;
    if (this.matchKeyword("readonly")) isReadonly = true;
    const nameTok: { text: string; pos: number; end: number } = this.expectMemberName();
    const after: Token = this.current();
    if (this.isPunct(after, "(")) {
      this.pos += 1;
      const params: Array<FunctionParam> = this.parseFunctionParams();
      this.expectPunct(":");
      const ret: TypeNode = this.parseType();
      this.matchPunct(";");
      return {
        kind: "interface_method",
        name: nameTok.text,
        params: params,
        returnType: ret,
        pos: nameTok.pos,
        end: ret.end,
      };
    }
    this.expectPunct(":");
    const ty: TypeNode = this.parseType();
    this.matchPunct(";");
    return {
      kind: "interface_field",
      isReadonly: isReadonly,
      name: nameTok.text,
      type: ty,
      pos: nameTok.pos,
      end: ty.end,
    };
  }

  parseTypeAliasDecl(isExported: boolean): Decl {
    const start: Token = this.expectKeyword("type");
    const name: Token = this.expectIdent();
    const typeParams: Array<TypeParam> = this.parseTypeParamsOpt();
    this.expectPunct("=");
    const body: TypeNode = this.parseType();
    this.matchPunct(";");
    return {
      kind: "type_alias_decl",
      isExported: isExported,
      name: name.text,
      typeParams: typeParams,
      body: body,
      pos: start.pos,
      end: body.end,
    };
  }

  // ============================================================
  // Statements
  // ============================================================

  parseStmt(): Stmt {
    this.skipNewlines();
    const t: Token = this.current();
    if (t.kind === "punct" && t.op === "{") return this.parseBlock();
    if (t.kind === "keyword") {
      const w: string = t.word;
      if (w === "let" || w === "const" || w === "var") {
        this.pos += 1;
        const decl: Stmt = this.parseVarDeclBody(t.pos, w);
        this.matchPunct(";");
        return decl;
      }
      if (w === "if") return this.parseIfStmt();
      if (w === "while") return this.parseWhileStmt();
      if (w === "do") return this.parseDoWhileStmt();
      if (w === "for") return this.parseForStmt();
      if (w === "switch") return this.parseSwitchStmt();
      if (w === "try") return this.parseTryStmt();
      if (w === "return") return this.parseReturnStmt();
      if (w === "throw") return this.parseThrowStmt();
      if (w === "break") {
        this.pos += 1;
        this.matchPunct(";");
        return { kind: "break_stmt", pos: t.pos, end: t.end };
      }
      if (w === "continue") {
        this.pos += 1;
        this.matchPunct(";");
        return { kind: "continue_stmt", pos: t.pos, end: t.end };
      }
    }
    if (t.kind === "punct" && t.op === ";") {
      this.pos += 1;
      return { kind: "empty_stmt", pos: t.pos, end: t.end };
    }
    const expr: Expr = this.parseExpr();
    this.matchPunct(";");
    return { kind: "expr_stmt", expr: expr, pos: expr.pos, end: expr.end };
  }

  parseBlock(): BlockStmt {
    const start: Token = this.expectPunct("{");
    const stmts: Array<Stmt> = [];
    while (!this.matchPunct("}")) {
      this.skipNewlines();
      if (this.matchPunct("}")) break;
      const s: Stmt = this.parseStmt();
      stmts.push(s);
    }
    const endTok: Token = this.peek(-1);
    return { kind: "block_stmt", stmts: stmts, pos: start.pos, end: endTok.end };
  }

  parseVarDeclBody(startPos: number, declKind: string): VarDeclStmt | VarDestrDeclStmt {
    if (this.matchPunct("{")) {
      const bindings: Array<VarDestrBinding> = [];
      this.skipNewlines();
      if (!this.matchPunct("}")) {
        for (;;) {
          this.skipNewlines();
          const peekT: Token = this.current();
          if (peekT.kind === "punct" && peekT.op === "...") {
            throw new ParseError(
              this.file,
              peekT.pos,
              "rest element in object destructuring is unsupported",
            );
          }
          const nameT: Token = this.expectIdent();
          const afterT: Token = this.current();
          if (afterT.kind === "punct" && afterT.op === ":") {
            throw new ParseError(
              this.file,
              afterT.pos,
              "property rename / nested pattern in object destructuring is unsupported",
            );
          }
          if (afterT.kind === "punct" && afterT.op === "=") {
            throw new ParseError(
              this.file,
              afterT.pos,
              "default value in object destructuring is unsupported",
            );
          }
          bindings.push({ name: nameT.text, pos: nameT.pos, end: nameT.end });
          this.skipNewlines();
          if (this.matchPunct(",")) {
            this.skipNewlines();
            if (this.matchPunct("}")) break;
            continue;
          }
          this.expectPunct("}");
          break;
        }
      }
      if (this.isPunct(this.current(), ":")) {
        throw new ParseError(
          this.file,
          this.current().pos,
          "type annotation on object destructuring pattern is unsupported",
        );
      }
      this.expectPunct("=");
      const init: Expr = this.parseAssign();
      return {
        kind: "var_destr_decl",
        declKind: declKind,
        bindings: bindings,
        init: init,
        pos: startPos,
        end: init.end,
      };
    }
    if (this.matchPunct("[")) {
      throw new ParseError(
        this.file,
        this.peek(-1).pos,
        "array destructuring binding is unsupported",
      );
    }
    const name: Token = this.expectIdent();
    let ty: TypeNode | undefined = undefined;
    if (this.matchPunct(":")) {
      ty = this.parseType();
    }
    let init: Expr | undefined = undefined;
    if (this.matchPunct("=")) {
      init = this.parseAssign();
    }
    const endPos: number = init !== undefined ? init.end : (ty !== undefined ? ty.end : name.end);
    return {
      kind: "var_decl",
      declKind: declKind,
      name: name.text,
      type: ty,
      init: init,
      pos: startPos,
      end: endPos,
    };
  }

  parseIfStmt(): Stmt {
    const start: Token = this.expectKeyword("if");
    this.expectPunct("(");
    const cond: Expr = this.parseExpr();
    this.expectPunct(")");
    const thenBranch: Stmt = this.parseStmt();
    let elseBranch: Stmt | undefined = undefined;
    this.skipNewlines();
    if (this.matchKeyword("else")) {
      elseBranch = this.parseStmt();
    }
    const endPos: number = elseBranch !== undefined ? elseBranch.end : thenBranch.end;
    return {
      kind: "if_stmt",
      cond: cond,
      thenBranch: thenBranch,
      elseBranch: elseBranch,
      pos: start.pos,
      end: endPos,
    };
  }

  parseWhileStmt(): Stmt {
    const start: Token = this.expectKeyword("while");
    this.expectPunct("(");
    const cond: Expr = this.parseExpr();
    this.expectPunct(")");
    const body: Stmt = this.parseStmt();
    return { kind: "while_stmt", cond: cond, body: body, pos: start.pos, end: body.end };
  }

  parseDoWhileStmt(): Stmt {
    const start: Token = this.expectKeyword("do");
    const body: Stmt = this.parseStmt();
    this.expectKeyword("while");
    this.expectPunct("(");
    const cond: Expr = this.parseExpr();
    const endTok: Token = this.expectPunct(")");
    this.matchPunct(";");
    return { kind: "do_while_stmt", body: body, cond: cond, pos: start.pos, end: endTok.end };
  }

  parseForStmt(): Stmt {
    const start: Token = this.expectKeyword("for");
    this.expectPunct("(");
    this.skipNewlines();
    const head: Token = this.current();

    // for-of detection: `for (const|let name of ...)` or `for (const|let [a,b] of ...)`
    if (head.kind === "keyword" && (head.word === "const" || head.word === "let")) {
      const declKind: string = head.word;
      const save: number = this.pos;
      this.pos += 1;
      const next: Token = this.current();
      let binding: ForOfBinding | undefined = undefined;
      if (next.kind === "ident") {
        const nameText: string = next.text;
        this.pos += 1;
        let bindType: TypeNode | undefined = undefined;
        if (this.matchPunct(":")) {
          bindType = this.parseType();
        }
        if (this.matchKeyword("of")) {
          binding = {
            kind: "for_of_single",
            declKind: declKind,
            name: nameText,
            type: bindType,
          };
        }
      } else if (next.kind === "punct" && next.op === "[") {
        this.pos += 1;
        const first: IdentToken = this.expectIdent();
        this.expectPunct(",");
        const second: IdentToken = this.expectIdent();
        this.expectPunct("]");
        if (this.matchKeyword("of")) {
          binding = {
            kind: "for_of_pair",
            declKind: declKind,
            first: first.text,
            second: second.text,
          };
        }
      }
      if (binding !== undefined) {
        const source: Expr = this.parseExpr();
        this.expectPunct(")");
        const body: Stmt = this.parseStmt();
        return {
          kind: "for_of_stmt",
          binding: binding,
          source: source,
          body: body,
          pos: start.pos,
          end: body.end,
        };
      }
      this.pos = save;
    }

    // C-style for
    let init: ForInit | undefined = undefined;
    const initT: Token = this.current();
    if (!(initT.kind === "punct" && initT.op === ";")) {
      if (initT.kind === "keyword" && (initT.word === "let" || initT.word === "const")) {
        const declKind: string = initT.word;
        this.pos += 1;
        const vd: VarDeclStmt | VarDestrDeclStmt = this.parseVarDeclBody(initT.pos, declKind);
        if (vd.kind === "var_destr_decl") {
          throw new ParseError(
            this.file,
            vd.pos,
            "destructuring binding in for-init is unsupported",
          );
        }
        init = { kind: "for_init_decl", decl: vd };
      } else {
        const e: Expr = this.parseExpr();
        init = { kind: "for_init_expr", expr: e };
      }
    }
    this.expectPunct(";");
    let cond: Expr | undefined = undefined;
    const condT: Token = this.current();
    if (!(condT.kind === "punct" && condT.op === ";")) {
      cond = this.parseExpr();
    }
    this.expectPunct(";");
    let update: Expr | undefined = undefined;
    const upT: Token = this.current();
    if (!(upT.kind === "punct" && upT.op === ")")) {
      update = this.parseExpr();
    }
    this.expectPunct(")");
    const body: Stmt = this.parseStmt();
    return {
      kind: "for_stmt",
      init: init,
      cond: cond,
      update: update,
      body: body,
      pos: start.pos,
      end: body.end,
    };
  }

  parseSwitchStmt(): Stmt {
    const start: Token = this.expectKeyword("switch");
    this.expectPunct("(");
    const disc: Expr = this.parseExpr();
    this.expectPunct(")");
    this.expectPunct("{");
    const cases: Array<SwitchCase> = [];
    while (!this.matchPunct("}")) {
      this.skipNewlines();
      const head: Token = this.current();
      let test: Expr | undefined = undefined;
      let caseStart: number = head.pos;
      if (this.matchKeyword("case")) {
        test = this.parseExpr();
      } else if (this.matchKeyword("default")) {
        test = undefined;
      } else {
        throw this.error(head, "expected 'case' or 'default'");
      }
      this.expectPunct(":");
      const stmts: Array<Stmt> = [];
      while (true) {
        this.skipNewlines();
        const t: Token = this.current();
        if (
          this.isKeyword(t, "case") ||
          this.isKeyword(t, "default") ||
          this.isPunct(t, "}")
        ) {
          break;
        }
        stmts.push(this.parseStmt());
      }
      const endTok: Token = this.peek(-1);
      cases.push({ test: test, stmts: stmts, pos: caseStart, end: endTok.end });
    }
    const endTok: Token = this.peek(-1);
    return {
      kind: "switch_stmt",
      discriminant: disc,
      cases: cases,
      pos: start.pos,
      end: endTok.end,
    };
  }

  parseTryStmt(): Stmt {
    const start: Token = this.expectKeyword("try");
    const tryBlock: BlockStmt = this.parseBlock();
    let catchClause: CatchClause | undefined = undefined;
    let finallyBlock: BlockStmt | undefined = undefined;
    this.skipNewlines();
    if (this.matchKeyword("catch")) {
      let bindingName: string | undefined = undefined;
      let bindingType: TypeNode | undefined = undefined;
      let catchStart: number = this.peek(-1).pos;
      if (this.matchPunct("(")) {
        const nameTok: Token = this.expectIdent();
        bindingName = nameTok.text;
        if (this.matchPunct(":")) {
          bindingType = this.parseType();
        }
        this.expectPunct(")");
      }
      const body: BlockStmt = this.parseBlock();
      catchClause = {
        bindingName: bindingName,
        bindingType: bindingType,
        body: body,
        pos: catchStart,
        end: body.end,
      };
    }
    this.skipNewlines();
    if (this.matchKeyword("finally")) {
      finallyBlock = this.parseBlock();
    }
    let endPos: number = tryBlock.end;
    if (finallyBlock !== undefined) endPos = finallyBlock.end;
    else if (catchClause !== undefined) endPos = catchClause.end;
    return {
      kind: "try_stmt",
      tryBlock: tryBlock,
      catchClause: catchClause,
      finallyBlock: finallyBlock,
      pos: start.pos,
      end: endPos,
    };
  }

  parseReturnStmt(): Stmt {
    const start: Token = this.expectKeyword("return");
    let value: Expr | undefined = undefined;
    this.skipNewlines();
    const t: Token = this.current();
    if (!this.isPunct(t, ";") && !this.isPunct(t, "}") && t.kind !== "eof") {
      value = this.parseExpr();
    }
    this.matchPunct(";");
    const endPos: number = value !== undefined ? value.end : start.end;
    return { kind: "return_stmt", value: value, pos: start.pos, end: endPos };
  }

  parseThrowStmt(): Stmt {
    const start: Token = this.expectKeyword("throw");
    const value: Expr = this.parseExpr();
    this.matchPunct(";");
    return { kind: "throw_stmt", value: value, pos: start.pos, end: value.end };
  }

  // ============================================================
  // Expressions (precedence climbing)
  // ============================================================

  parseExpr(): Expr {
    return this.parseAssign();
  }

  parseAssign(): Expr {
    const lhs: Expr = this.parseTernary();
    this.skipNewlines();
    const t: Token = this.current();
    if (t.kind === "punct") {
      const op: string = t.op;
      if (
        op === "=" ||
        op === "+=" ||
        op === "-=" ||
        op === "*=" ||
        op === "/=" ||
        op === "%="
      ) {
        this.pos += 1;
        const rhs: Expr = this.parseAssign();
        return {
          kind: "assign_expr",
          op: op,
          target: lhs,
          value: rhs,
          pos: lhs.pos,
          end: rhs.end,
        };
      }
    }
    return lhs;
  }

  parseTernary(): Expr {
    const cond: Expr = this.parseNullishCoalesce();
    this.skipNewlines();
    const t: Token = this.current();
    if (this.isPunct(t, "?")) {
      this.pos += 1;
      const thenBranch: Expr = this.parseAssign();
      this.expectPunct(":");
      const elseBranch: Expr = this.parseAssign();
      return {
        kind: "ternary_expr",
        cond: cond,
        thenBranch: thenBranch,
        elseBranch: elseBranch,
        pos: cond.pos,
        end: elseBranch.end,
      };
    }
    return cond;
  }

  parseNullishCoalesce(): Expr {
    let lhs: Expr = this.parseLogicalOr();
    while (true) {
      this.skipNewlines();
      const t: Token = this.current();
      if (this.isPunct(t, "??")) {
        this.pos += 1;
        const rhs: Expr = this.parseLogicalOr();
        lhs = {
          kind: "bin_op",
          op: "??",
          lhs: lhs,
          rhs: rhs,
          pos: lhs.pos,
          end: rhs.end,
        };
        continue;
      }
      break;
    }
    return lhs;
  }

  parseLogicalOr(): Expr {
    let lhs: Expr = this.parseLogicalAnd();
    while (true) {
      this.skipNewlines();
      const t: Token = this.current();
      if (this.isPunct(t, "||")) {
        this.pos += 1;
        const rhs: Expr = this.parseLogicalAnd();
        lhs = { kind: "bin_op", op: "||", lhs: lhs, rhs: rhs, pos: lhs.pos, end: rhs.end };
        continue;
      }
      break;
    }
    return lhs;
  }

  parseLogicalAnd(): Expr {
    let lhs: Expr = this.parseEquality();
    while (true) {
      this.skipNewlines();
      const t: Token = this.current();
      if (this.isPunct(t, "&&")) {
        this.pos += 1;
        const rhs: Expr = this.parseEquality();
        lhs = { kind: "bin_op", op: "&&", lhs: lhs, rhs: rhs, pos: lhs.pos, end: rhs.end };
        continue;
      }
      break;
    }
    return lhs;
  }

  parseEquality(): Expr {
    let lhs: Expr = this.parseRelational();
    while (true) {
      this.skipNewlines();
      const t: Token = this.current();
      if (t.kind !== "punct") break;
      const op: string = t.op;
      if (op === "===" || op === "!==" || op === "==" || op === "!=") {
        this.pos += 1;
        const rhs: Expr = this.parseRelational();
        lhs = { kind: "bin_op", op: op, lhs: lhs, rhs: rhs, pos: lhs.pos, end: rhs.end };
        continue;
      }
      break;
    }
    return lhs;
  }

  parseRelational(): Expr {
    let lhs: Expr = this.parseAdditive();
    while (true) {
      this.skipNewlines();
      const t: Token = this.current();
      if (t.kind === "punct") {
        const op: string = t.op;
        if (op === "<" || op === ">" || op === "<=" || op === ">=") {
          this.pos += 1;
          const rhs: Expr = this.parseAdditive();
          lhs = { kind: "bin_op", op: op, lhs: lhs, rhs: rhs, pos: lhs.pos, end: rhs.end };
          continue;
        }
      }
      if (this.isKeyword(t, "instanceof")) {
        this.pos += 1;
        const rhs: Expr = this.parseAdditive();
        lhs = { kind: "instanceof_expr", lhs: lhs, rhs: rhs, pos: lhs.pos, end: rhs.end };
        continue;
      }
      break;
    }
    return lhs;
  }

  parseAdditive(): Expr {
    let lhs: Expr = this.parseMultiplicative();
    while (true) {
      this.skipNewlines();
      const t: Token = this.current();
      if (t.kind !== "punct") break;
      const op: string = t.op;
      if (op === "+" || op === "-") {
        this.pos += 1;
        const rhs: Expr = this.parseMultiplicative();
        lhs = { kind: "bin_op", op: op, lhs: lhs, rhs: rhs, pos: lhs.pos, end: rhs.end };
        continue;
      }
      break;
    }
    return lhs;
  }

  parseMultiplicative(): Expr {
    let lhs: Expr = this.parseUnary();
    while (true) {
      this.skipNewlines();
      const t: Token = this.current();
      if (t.kind !== "punct") break;
      const op: string = t.op;
      if (op === "*" || op === "/" || op === "%") {
        this.pos += 1;
        const rhs: Expr = this.parseUnary();
        lhs = { kind: "bin_op", op: op, lhs: lhs, rhs: rhs, pos: lhs.pos, end: rhs.end };
        continue;
      }
      break;
    }
    return lhs;
  }

  parseUnary(): Expr {
    this.skipNewlines();
    const t: Token = this.current();
    if (t.kind === "punct") {
      const op: string = t.op;
      if (op === "!" || op === "-" || op === "+" || op === "++" || op === "--") {
        this.pos += 1;
        const operand: Expr = this.parseUnary();
        return { kind: "prefix_op", op: op, operand: operand, pos: t.pos, end: operand.end };
      }
    }
    if (this.isKeyword(t, "typeof")) {
      this.pos += 1;
      const operand: Expr = this.parseUnary();
      return { kind: "typeof_expr", operand: operand, pos: t.pos, end: operand.end };
    }
    if (this.isKeyword(t, "await")) {
      this.pos += 1;
      const operand: Expr = this.parseUnary();
      return { kind: "await_expr", operand: operand, pos: t.pos, end: operand.end };
    }
    return this.parsePostfix();
  }

  parsePostfix(): Expr {
    let lhs: Expr = this.parsePrimary();
    while (true) {
      this.skipNewlines();
      const t: Token = this.current();
      if (this.isPunct(t, ".")) {
        this.pos += 1;
        this.skipNewlines();
        const name: { text: string; pos: number; end: number } = this.expectMemberName();
        lhs = {
          kind: "prop_access",
          receiver: lhs,
          name: name.text,
          optional: false,
          pos: lhs.pos,
          end: name.end,
        };
        continue;
      }
      if (this.isPunct(t, "?.")) {
        this.pos += 1;
        this.skipNewlines();
        const next: Token = this.current();
        if (this.isPunct(next, "[")) {
          this.pos += 1;
          const idx: Expr = this.parseExpr();
          const endTok: Token = this.expectPunct("]");
          lhs = {
            kind: "elem_access",
            receiver: lhs,
            index: idx,
            optional: true,
            pos: lhs.pos,
            end: endTok.end,
          };
          continue;
        }
        if (this.isPunct(next, "(")) {
          // `f?.()` optional call — parser accepts; codegen rejects.
          this.pos += 1;
          const args: Array<Expr> = this.parseCallArgs();
          const endTok: Token = this.peek(-1);
          lhs = {
            kind: "call_expr",
            callee: lhs,
            typeArgs: [],
            args: args,
            optional: true,
            pos: lhs.pos,
            end: endTok.end,
          };
          continue;
        }
        const name: { text: string; pos: number; end: number } = this.expectMemberName();
        const afterName: Token = this.current();
        if (this.isPunct(afterName, "(")) {
          this.pos += 1;
          const args: Array<Expr> = this.parseCallArgs();
          const endTok: Token = this.peek(-1);
          lhs = {
            kind: "call_expr",
            callee: {
              kind: "prop_access",
              receiver: lhs,
              name: name.text,
              optional: true,
              pos: lhs.pos,
              end: name.end,
            },
            typeArgs: [],
            args: args,
            optional: false,
            pos: lhs.pos,
            end: endTok.end,
          };
          continue;
        }
        lhs = {
          kind: "prop_access",
          receiver: lhs,
          name: name.text,
          optional: true,
          pos: lhs.pos,
          end: name.end,
        };
        continue;
      }
      if (this.isPunct(t, "[")) {
        this.pos += 1;
        const idx: Expr = this.parseExpr();
        const endTok: Token = this.expectPunct("]");
        lhs = {
          kind: "elem_access",
          receiver: lhs,
          index: idx,
          optional: false,
          pos: lhs.pos,
          end: endTok.end,
        };
        continue;
      }
      if (this.isPunct(t, "(")) {
        this.pos += 1;
        const args: Array<Expr> = this.parseCallArgs();
        const endTok: Token = this.peek(-1);
        lhs = {
          kind: "call_expr",
          callee: lhs,
          typeArgs: [],
          args: args,
          optional: false,
          pos: lhs.pos,
          end: endTok.end,
        };
        continue;
      }
      if (this.isPunct(t, "!")) {
        this.pos += 1;
        lhs = { kind: "non_null", operand: lhs, pos: lhs.pos, end: t.end };
        continue;
      }
      if (this.isKeyword(t, "as")) {
        this.pos += 1;
        const ty: TypeNode = this.parseType();
        lhs = { kind: "type_assert", expr: lhs, type: ty, pos: lhs.pos, end: ty.end };
        continue;
      }
      if (t.kind === "punct" && (t.op === "++" || t.op === "--")) {
        const op: string = t.op;
        this.pos += 1;
        lhs = { kind: "postfix_op", op: op, operand: lhs, pos: lhs.pos, end: t.end };
        continue;
      }
      if (t.kind === "punct" && t.op === "<") {
        const save: number = this.pos;
        const probe: Array<TypeNode> | undefined = this.tryParseTypeArgsBeforeCall();
        if (probe !== undefined) {
          this.expectPunct("(");
          const args: Array<Expr> = this.parseCallArgs();
          const endTok: Token = this.peek(-1);
          lhs = {
            kind: "call_expr",
            callee: lhs,
            typeArgs: probe,
            args: args,
            optional: false,
            pos: lhs.pos,
            end: endTok.end,
          };
          continue;
        }
        this.pos = save;
        break;
      }
      break;
    }
    return lhs;
  }

  tryParseTypeArgsBeforeCall(): Array<TypeNode> | undefined {
    const save: number = this.pos;
    try {
      const args: Array<TypeNode> = this.parseTypeArgs();
      const t: Token = this.current();
      if (t.kind === "punct" && t.op === "(") return args;
      this.pos = save;
      return undefined;
    } catch (e) {
      this.pos = save;
      return undefined;
    }
  }

  parseCallArgs(): Array<Expr> {
    const out: Array<Expr> = [];
    while (!this.matchPunct(")")) {
      this.skipNewlines();
      const arg: Expr = this.parseAssign();
      out.push(arg);
      if (!this.matchPunct(",")) {
        this.expectPunct(")");
        break;
      }
    }
    return out;
  }

  parsePrimary(): Expr {
    this.skipNewlines();
    const t: Token = this.current();
    if (t.kind === "ident") {
      this.pos += 1;
      return { kind: "ident", name: t.text, pos: t.pos, end: t.end };
    }
    if (t.kind === "number") {
      this.pos += 1;
      const v: number = parseNumberLiteral(t.text);
      return { kind: "num_lit", text: t.text, value: v, pos: t.pos, end: t.end };
    }
    if (t.kind === "bigint") {
      this.pos += 1;
      const bt: BigIntToken = t;
      return { kind: "bigint_lit", text: bt.text, pos: bt.pos, end: bt.end };
    }
    if (t.kind === "string") {
      this.pos += 1;
      return { kind: "str_lit", value: t.value, pos: t.pos, end: t.end };
    }
    if (t.kind === "template_full") {
      this.pos += 1;
      return {
        kind: "template_lit",
        head: t.value,
        subs: [],
        pos: t.pos,
        end: t.end,
      };
    }
    if (t.kind === "template_head") {
      return this.parseTemplateLit();
    }
    if (t.kind === "keyword") {
      if (t.word === "true" || t.word === "false") {
        this.pos += 1;
        return { kind: "bool_lit", value: t.word === "true", pos: t.pos, end: t.end };
      }
      if (t.word === "null") {
        this.pos += 1;
        return { kind: "null_lit", pos: t.pos, end: t.end };
      }
      if (t.word === "undefined") {
        this.pos += 1;
        return { kind: "undefined_lit", pos: t.pos, end: t.end };
      }
      if (t.word === "this") {
        this.pos += 1;
        return { kind: "this_expr", pos: t.pos, end: t.end };
      }
      if (t.word === "new") {
        return this.parseNewExpr();
      }
      if (t.word === "import") {
        return this.parseImportMetaUrl();
      }
      if (t.word === "async") {
        const save: number = this.pos;
        this.pos += 1;
        if (this.isKeyword(this.current(), "function")) {
          return this.parseFunctionExpr(true, t.pos);
        }
        if (this.isPunct(this.current(), "(") && this.looksLikeArrow()) {
          return this.parseArrow(true, t.pos);
        }
        this.pos = save;
        throw this.error(t, "async expressions are unsupported (only async arrow functions are supported)");
      }
      if (t.word === "function") {
        return this.parseFunctionExpr(false, t.pos);
      }
    }
    if (this.isPunct(t, "(")) {
      // arrow function detection lookahead — handle simple `() => ...`
      // and `(x: T, y: U) => ...` shapes. Bare paren-expr falls through.
      if (this.looksLikeArrow()) {
        return this.parseArrow(false, t.pos);
      }
      this.pos += 1;
      const inner: Expr = this.parseExpr();
      const endTok: Token = this.expectPunct(")");
      return { kind: "paren_expr", inner: inner, pos: t.pos, end: endTok.end };
    }
    if (this.isPunct(t, "[")) {
      return this.parseArrayLit();
    }
    if (this.isPunct(t, "{")) {
      return this.parseObjectLit();
    }
    if (this.isPunct(t, "...")) {
      this.pos += 1;
      const operand: Expr = this.parseAssign();
      return { kind: "spread_expr", operand: operand, pos: t.pos, end: operand.end };
    }
    throw this.error(t, "expected expression");
  }

  // `import.meta.url` のみ受理(codegen `checkImportMetaUrl` /
  // `rejectBareMetaProperty` と同一の受理 / reject 条件)。式位置のみ。
  // import 宣言(statement 位置)は parseModuleItem が先に拾う。
  parseImportMetaUrl(): Expr {
    const start: KeywordToken = this.expectKeyword("import");
    this.expectPunct(".");
    const meta: { text: string; pos: number; end: number } = this.expectMemberName();
    if (meta.text !== "meta") {
      throw this.error(
        this.current(),
        `unsupported \`import.${meta.text}\` (only \`import.meta.url\` is accepted)`,
      );
    }
    if (!this.isPunct(this.current(), ".")) {
      throw this.error(
        this.current(),
        "bare `import.meta` is unsupported (only `import.meta.url` is accepted)",
      );
    }
    this.expectPunct(".");
    const prop: { text: string; pos: number; end: number } = this.expectMemberName();
    if (prop.text !== "url") {
      throw this.error(
        this.current(),
        `unsupported \`import.meta.${prop.text}\` (only \`import.meta.url\` is accepted)`,
      );
    }
    return { kind: "import_meta_url", pos: start.pos, end: prop.end };
  }

  parseTemplateLit(): Expr {
    const head: Token = this.current();
    if (head.kind !== "template_head") {
      throw this.error(head, "expected template_head");
    }
    this.pos += 1;
    const subs: Array<TemplateSub> = [];
    let endPos: number = head.end;
    while (true) {
      const expr: Expr = this.parseExpr();
      this.skipNewlines();
      const next: Token = this.current();
      if (next.kind === "template_middle") {
        this.pos += 1;
        subs.push({ expr: expr, cookedAfter: next.value });
        continue;
      }
      if (next.kind === "template_tail") {
        this.pos += 1;
        subs.push({ expr: expr, cookedAfter: next.value });
        endPos = next.end;
        break;
      }
      throw this.error(next, "expected template_middle or template_tail");
    }
    return {
      kind: "template_lit",
      head: head.value,
      subs: subs,
      pos: head.pos,
      end: endPos,
    };
  }

  parseArrayLit(): Expr {
    const start: Token = this.expectPunct("[");
    const elems: Array<ArrayElem> = [];
    while (!this.matchPunct("]")) {
      this.skipNewlines();
      const t: Token = this.current();
      if (this.isPunct(t, "...")) {
        this.pos += 1;
        const e: Expr = this.parseAssign();
        elems.push({ kind: "spread", expr: e });
      } else {
        const e: Expr = this.parseAssign();
        elems.push({ kind: "elem", expr: e });
      }
      if (!this.matchPunct(",")) {
        this.expectPunct("]");
        break;
      }
    }
    const endTok: Token = this.peek(-1);
    return { kind: "array_lit", elems: elems, pos: start.pos, end: endTok.end };
  }

  parseObjectLit(): Expr {
    const start: PunctToken = this.expectPunct("{");
    const props: Array<ObjectMember> = [];
    while (!this.matchPunct("}")) {
      this.skipNewlines();
      const head: Token = this.current();
      if (head.kind === "punct" && head.op === "...") {
        this.pos += 1;
        const e: Expr = this.parseAssign();
        props.push({ kind: "prop_spread", expr: e, pos: head.pos, end: e.end });
        if (!this.matchPunct(",")) {
          this.expectPunct("}");
          break;
        }
        continue;
      }
      const nameTok: Token = head;
      const nameStart: number = nameTok.pos;
      let name: string = "";
      let nameEnd: number = nameTok.end;
      if (nameTok.kind === "ident") {
        name = nameTok.text;
        this.pos += 1;
      } else if (nameTok.kind === "string") {
        name = nameTok.value;
        this.pos += 1;
      } else if (nameTok.kind === "keyword") {
        name = nameTok.word;
        this.pos += 1;
      } else {
        throw this.error(nameTok, "expected property name");
      }
      const after: Token = this.current();
      if (after.kind === "punct" && after.op === ":") {
        this.pos += 1;
        const value: Expr = this.parseAssign();
        props.push({ kind: "prop_kv", name: name, value: value, pos: nameStart, end: value.end });
      } else if (after.kind === "punct" && after.op === "(") {
        throw this.error(
          after,
          "object literal only supports `name: value` and `name` shorthand properties (no method shorthand, getter / setter, spread)",
        );
      } else {
        // shorthand: `{ a, b }` — `a` desugars to `a: a`.
        props.push({ kind: "prop_shorthand", name: name, pos: nameStart, end: nameEnd });
      }
      if (!this.matchPunct(",")) {
        this.expectPunct("}");
        break;
      }
    }
    const endTok: Token = this.peek(-1);
    return { kind: "object_lit", props: props, pos: start.pos, end: endTok.end };
  }

  parseNewExpr(): Expr {
    const start: Token = this.expectKeyword("new");
    const calleeName: Token = this.expectIdent();
    let callee: Expr = { kind: "ident", name: calleeName.text, pos: calleeName.pos, end: calleeName.end };
    while (this.matchPunct(".")) {
      const part: { text: string; pos: number; end: number } = this.expectMemberName();
      callee = {
        kind: "prop_access",
        receiver: callee,
        name: part.text,
        optional: false,
        pos: callee.pos,
        end: part.end,
      };
    }
    let typeArgs: Array<TypeNode> = [];
    if (this.isPunct(this.current(), "<")) {
      typeArgs = this.parseTypeArgs();
    }
    this.expectPunct("(");
    const args: Array<Expr> = this.parseCallArgs();
    const endTok: Token = this.peek(-1);
    return {
      kind: "new_expr",
      callee: callee,
      typeArgs: typeArgs,
      args: args,
      pos: start.pos,
      end: endTok.end,
    };
  }

  parseTypeArgs(): Array<TypeNode> {
    this.expectPunct("<");
    const out: Array<TypeNode> = [];
    while (!this.matchPunct(">")) {
      this.skipNewlines();
      const t: TypeNode = this.parseType();
      out.push(t);
      if (!this.matchPunct(",")) {
        this.expectPunct(">");
        break;
      }
    }
    return out;
  }

  looksLikeArrow(): boolean {
    // Scan ahead from `(` to find `)` and check what follows. If `=>` or
    // `: Type =>`, treat as arrow. This is a deliberate cheap heuristic
    // for the Topaz subset (no destructuring, no defaults).
    let depth: number = 0;
    let i: number = this.pos;
    while (i < this.tokens.length) {
      const t: Token = this.tokens[i];
      if (t.kind === "punct") {
        if (t.op === "(") depth += 1;
        else if (t.op === ")") {
          depth -= 1;
          if (depth === 0) {
            // look at what comes after closing )
            let j: number = i + 1;
            while (j < this.tokens.length && this.tokens[j].kind === "newline") j += 1;
            const after: Token = this.tokens[j];
            if (after.kind === "punct" && after.op === "=>") return true;
            if (after.kind === "punct" && after.op === ":") {
              // skip the type annotation, then check `=>`
              let k: number = j + 1;
              let typeDepth: number = 0;
              while (k < this.tokens.length) {
                const tk: Token = this.tokens[k];
                if (tk.kind === "punct") {
                  if (tk.op === "<" || tk.op === "(") typeDepth += 1;
                  else if (tk.op === ">" || tk.op === ")") typeDepth -= 1;
                  else if (tk.op === "=>" && typeDepth === 0) return true;
                  else if (tk.op === "{" && typeDepth === 0) return false;
                  else if (tk.op === ";" && typeDepth === 0) return false;
                }
                if (tk.kind === "eof") return false;
                k += 1;
              }
              return false;
            }
            return false;
          }
        }
      }
      if (t.kind === "eof") return false;
      i += 1;
    }
    return false;
  }

  parseArrow(isAsync: boolean, startPos: number): Expr {
    const start: Token = this.expectPunct("(");
    const params: Array<ArrowParam> = [];
    while (!this.matchPunct(")")) {
      this.skipNewlines();
      const name: Token = this.expectIdent();
      let pty: TypeNode | undefined = undefined;
      if (this.matchPunct(":")) {
        pty = this.parseType();
      }
      const lastEnd: number = pty !== undefined ? pty.end : name.end;
      params.push({ name: name.text, type: pty, pos: name.pos, end: lastEnd });
      if (!this.matchPunct(",")) {
        this.expectPunct(")");
        break;
      }
    }
    let returnType: TypeNode | undefined = undefined;
    if (this.matchPunct(":")) {
      returnType = this.parseType();
    }
    this.expectPunct("=>");
    const body: ArrowBody = this.parseArrowBody();
    const endPos: number = body.kind === "arrow_expr_body" ? body.expr.end : (() => {
      const ss: Array<Stmt> = body.stmts;
      if (ss.length === 0) return start.end;
      return ss[ss.length - 1].end;
    })();
    return {
      kind: "arrow_expr",
      isAsync: isAsync,
      params: params,
      returnType: returnType,
      body: body,
      pos: startPos,
      end: endPos,
    };
  }

  parseArrowBody(): ArrowBody {
    this.skipNewlines();
    const t: Token = this.current();
    if (this.isPunct(t, "{")) {
      const block: BlockStmt = this.parseBlock();
      return { kind: "arrow_block_body", stmts: block.stmts };
    }
    const e: Expr = this.parseAssign();
    return { kind: "arrow_expr_body", expr: e };
  }

  parseFunctionExpr(isAsync: boolean, startPos: number): Expr {
    this.expectKeyword("function");
    if (this.matchPunct("*")) {
      throw this.error(this.peek(-1), "generator function expressions are unsupported");
    }
    let name: string | undefined = undefined;
    const t: Token = this.current();
    if (t.kind === "ident") {
      this.pos += 1;
      name = t.text;
    }
    if (this.isPunct(this.current(), "<")) {
      throw this.error(this.current(), "generic function expression is unsupported");
    }
    this.expectPunct("(");
    const params: Array<ArrowParam> = this.parseFunctionExprParams();
    let returnType: TypeNode | undefined = undefined;
    if (this.matchPunct(":")) {
      returnType = this.parseType();
    }
    const body: BlockStmt = this.parseBlock();
    return {
      kind: "function_expr",
      name: name,
      isAsync: isAsync,
      params: params,
      returnType: returnType,
      body: body.stmts,
      pos: startPos,
      end: body.end,
    };
  }

  parseFunctionExprParams(): Array<ArrowParam> {
    const out: Array<ArrowParam> = [];
    while (!this.matchPunct(")")) {
      this.skipNewlines();
      if (this.matchPunct("...")) {
        throw this.error(this.peek(-1), "rest parameter in function expression is unsupported");
      }
      const name: Token = this.expectIdent();
      if (this.matchPunct("?")) {
        throw this.error(this.peek(-1), "optional parameter in function expression is unsupported");
      }
      let pty: TypeNode | undefined = undefined;
      if (this.matchPunct(":")) {
        pty = this.parseType();
      }
      if (this.matchPunct("=")) {
        throw this.error(this.peek(-1), "default parameter in function expression is unsupported");
      }
      const lastEnd: number = pty !== undefined ? pty.end : name.end;
      out.push({ name: name.text, type: pty, pos: name.pos, end: lastEnd });
      if (!this.matchPunct(",")) {
        this.expectPunct(")");
        break;
      }
    }
    return out;
  }

  // ============================================================
  // Types
  // ============================================================

  parseType(): TypeNode {
    return this.parseUnionType();
  }

  parseUnionType(): TypeNode {
    // Accept a leading `|` as syntactic sugar (`type X = | A | B;`).
    this.skipNewlines();
    this.matchPunct("|");
    const first: TypeNode = this.parseIntersectionType();
    const variants: Array<TypeNode> = [first];
    while (true) {
      this.skipNewlines();
      const t: Token = this.current();
      if (this.isPunct(t, "|")) {
        this.pos += 1;
        const next: TypeNode = this.parseIntersectionType();
        variants.push(next);
        continue;
      }
      break;
    }
    if (variants.length === 1) return first;
    const last: TypeNode = variants[variants.length - 1];
    return {
      kind: "type_union",
      variants: variants,
      pos: first.pos,
      end: last.end,
    };
  }

  parseIntersectionType(): TypeNode {
    const first: TypeNode = this.parsePrimaryType();
    const variants: Array<TypeNode> = [first];
    while (true) {
      this.skipNewlines();
      const t: Token = this.current();
      if (this.isPunct(t, "&")) {
        this.pos += 1;
        const next: TypeNode = this.parsePrimaryType();
        variants.push(next);
        continue;
      }
      break;
    }
    if (variants.length === 1) return first;
    const last: TypeNode = variants[variants.length - 1];
    return {
      kind: "type_intersection",
      variants: variants,
      pos: first.pos,
      end: last.end,
    };
  }

  parsePrimaryType(): TypeNode {
    this.skipNewlines();
    const t: Token = this.current();
    if (t.kind === "string") {
      this.pos += 1;
      return { kind: "type_str_lit", value: t.value, pos: t.pos, end: t.end };
    }
    if (t.kind === "number") {
      this.pos += 1;
      return { kind: "type_num_lit", value: parseNumberLiteral(t.text), pos: t.pos, end: t.end };
    }
    if (this.isKeyword(t, "void")) {
      this.pos += 1;
      return { kind: "type_void", pos: t.pos, end: t.end };
    }
    if (this.isKeyword(t, "unknown")) {
      this.pos += 1;
      return { kind: "type_unknown", pos: t.pos, end: t.end };
    }
    if (this.isKeyword(t, "undefined")) {
      this.pos += 1;
      return { kind: "type_ref", name: "undefined", typeArgs: [], pos: t.pos, end: t.end };
    }
    if (this.isKeyword(t, "typeof")) {
      this.pos += 1;
      this.skipNewlines();
      const name: Token = this.current();
      if (name.kind !== "ident") {
        throw this.error(name, "unsupported type query: expected typeof Identifier");
      }
      this.pos += 1;
      if (this.isPunct(this.current(), ".")) {
        throw this.error(this.current(), "qualified type queries are unsupported (expected typeof Identifier)");
      }
      return { kind: "type_query", name: name.text, pos: t.pos, end: name.end };
    }
    if (this.isPunct(t, "(")) {
      // fn type `(x: T, y: U) => R`
      return this.parseFnTypeOrParen();
    }
    if (this.isPunct(t, "{")) {
      return this.parseTypeLiteral();
    }
    if (t.kind === "ident") {
      this.pos += 1;
      let typeArgs: Array<TypeNode> = [];
      if (this.isPunct(this.current(), "<")) {
        typeArgs = this.parseTypeArgs();
      }
      const endPos: number = typeArgs.length > 0 ? typeArgs[typeArgs.length - 1].end + 1 : t.end;
      let node: TypeNode = { kind: "type_ref", name: t.text, typeArgs: typeArgs, pos: t.pos, end: endPos };
      while (true) {
        const next: Token = this.current();
        if (this.isPunct(next, "[")) {
          const peekNext: Token = this.peek(1);
          if (this.isPunct(peekNext, "]")) {
            this.pos += 2;
            node = { kind: "type_array", elem: node, pos: node.pos, end: peekNext.end };
            continue;
          }
        }
        break;
      }
      return node;
    }
    throw this.error(t, "expected type");
  }

  parseFnTypeOrParen(): TypeNode {
    const start: Token = this.expectPunct("(");
    const params: Array<TypeFnParam> = [];
    while (!this.matchPunct(")")) {
      this.skipNewlines();
      const name: Token = this.expectIdent();
      this.expectPunct(":");
      const ty: TypeNode = this.parseType();
      params.push({ name: name.text, type: ty, pos: name.pos, end: ty.end });
      if (!this.matchPunct(",")) {
        this.expectPunct(")");
        break;
      }
    }
    this.expectPunct("=>");
    const ret: TypeNode = this.parseType();
    return {
      kind: "type_fn",
      params: params,
      returnType: ret,
      pos: start.pos,
      end: ret.end,
    };
  }

  parseTypeLiteral(): TypeNode {
    const start: Token = this.expectPunct("{");
    const members: Array<TypeLiteralMember> = [];
    while (!this.matchPunct("}")) {
      this.skipNewlines();
      let isReadonly: boolean = false;
      if (this.matchKeyword("readonly")) isReadonly = true;
      const nameTok: { text: string; nameKind: TypeLiteralFieldNameKind; pos: number; end: number } =
        this.expectTypeLiteralFieldName();
      let isOptional: boolean = false;
      if (this.matchPunct("?")) isOptional = true;
      const after: Token = this.current();
      if (after.kind === "punct" && after.op === "(") {
        if (nameTok.nameKind !== "identifier") {
          throw this.error(after, "computed type literal methods are unsupported");
        }
        this.pos += 1;
        const params: Array<TypeFnParam> = [];
        while (!this.matchPunct(")")) {
          this.skipNewlines();
          const pn: IdentToken = this.expectIdent();
          this.expectPunct(":");
          const pt: TypeNode = this.parseType();
          params.push({ name: pn.text, type: pt, pos: pn.pos, end: pt.end });
          if (!this.matchPunct(",")) {
            this.expectPunct(")");
            break;
          }
        }
        this.expectPunct(":");
        const ret: TypeNode = this.parseType();
        members.push({
          kind: "type_lit_method",
          name: nameTok.text,
          params: params,
          returnType: ret,
          isOptional: isOptional,
          pos: nameTok.pos,
          end: ret.end,
        });
      } else {
        this.expectPunct(":");
        const ty: TypeNode = this.parseType();
        members.push({
          kind: "type_lit_field",
          name: nameTok.text,
          nameKind: nameTok.nameKind,
          type: ty,
          isReadonly: isReadonly,
          isOptional: isOptional,
          pos: nameTok.pos,
          end: ty.end,
        });
      }
      if (!this.matchPunct(",") && !this.matchPunct(";")) {
        this.expectPunct("}");
        break;
      }
    }
    const endTok: Token = this.peek(-1);
    return { kind: "type_literal", members: members, pos: start.pos, end: endTok.end };
  }
}

function parseNumberLiteral(text: string): number {
  if (text.length >= 2 && text.charCodeAt(0) === 48) {
    const c1: number = text.charCodeAt(1);
    if (c1 === 120 || c1 === 88) {
      return parseInt(text.slice(2), 16);
    }
    if (c1 === 98 || c1 === 66) {
      return parseInt(text.slice(2), 2);
    }
  }
  return parseFloat(text);
}

export function parseSource(filePath: string, source: string): SourceModule {
  const tokens: Array<Token> = tokenize(source, filePath);
  const parser: Parser = new Parser(tokens, filePath, computeLineStarts(source));
  return parser.parseModule();
}

export function parseFile(filePath: string): SourceModule {
  const source: string = readFileSync(filePath, "utf8");
  return parseSource(filePath, source);
}

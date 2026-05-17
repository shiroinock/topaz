import * as ts from "typescript";

type TopazType =
  | "topaz_number"
  | "topaz_boolean"
  | "topaz_string"
  | "topaz_array_number"
  | "topaz_array_boolean"
  | "topaz_array_string";

const ARRAY_ELEM: Partial<Record<TopazType, TopazType>> = {
  topaz_array_number: "topaz_number",
  topaz_array_boolean: "topaz_boolean",
  topaz_array_string: "topaz_string",
};

const ARRAY_OF: Partial<Record<TopazType, TopazType>> = {
  topaz_number: "topaz_array_number",
  topaz_boolean: "topaz_array_boolean",
  topaz_string: "topaz_array_string",
};

function arrayElem(t: TopazType): TopazType | undefined {
  return ARRAY_ELEM[t];
}

function arrayOf(elem: TopazType): TopazType | undefined {
  return ARRAY_OF[elem];
}

function isArrayType(t: TopazType): boolean {
  return arrayElem(t) !== undefined;
}

// e.g. "topaz_array_number" -> "number"
function arrayShortName(t: TopazType): string {
  return t.slice("topaz_array_".length);
}

// C type used in declarations and signatures (arrays are pointers).
function cTypeName(t: TopazType): string {
  return isArrayType(t) ? `${t} *` : t;
}

type Binding = { type: TopazType; isConst: boolean };

class CodegenError extends Error {
  constructor(node: ts.Node, message: string) {
    const sf = node.getSourceFile();
    if (sf) {
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      super(`${sf.fileName}:${line + 1}:${character + 1}: ${message}`);
    } else {
      super(message);
    }
  }
}

function unsupported(node: ts.Node, what: string): never {
  throw new CodegenError(node, `unsupported ${what} (${ts.SyntaxKind[node.kind]})`);
}

class Scope {
  private stack: Map<string, Binding>[] = [new Map()];

  push(): void {
    this.stack.push(new Map());
  }

  pop(): void {
    this.stack.pop();
  }

  declare(name: string, type: TopazType, isConst: boolean, node: ts.Node): void {
    const top = this.stack[this.stack.length - 1]!;
    if (top.has(name)) {
      throw new CodegenError(node, `redeclaration of '${name}'`);
    }
    top.set(name, { type, isConst });
  }

  lookup(name: string): Binding | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const b = this.stack[i]!.get(name);
      if (b) return b;
    }
    return undefined;
  }
}

class Emitter {
  private scope = new Scope();
  private functionReturns = new Map<string, TopazType>();
  private switchCounter = 0;
  private tmpCounter = 0;

  emit(sf: ts.SourceFile): string {
    const functions: ts.FunctionDeclaration[] = [];
    const topLevel: ts.Statement[] = [];
    for (const stmt of sf.statements) {
      if (ts.isFunctionDeclaration(stmt)) functions.push(stmt);
      else topLevel.push(stmt);
    }

    for (const fn of functions) {
      if (!fn.name) throw new CodegenError(fn, "function must be named");
      const ret = this.typeFromAnnotation(fn.type, fn);
      if (this.functionReturns.has(fn.name.text)) {
        throw new CodegenError(fn, `redeclaration of function '${fn.name.text}'`);
      }
      this.functionReturns.set(fn.name.text, ret);
    }

    const out: string[] = [];
    out.push('#include "runtime.h"');
    out.push("");

    for (const fn of functions) {
      out.push(`${this.formatSignature(fn)};`);
    }
    if (functions.length > 0) out.push("");

    for (const fn of functions) {
      out.push(this.emitFunctionDefinition(fn));
      out.push("");
    }

    out.push("int main(void) {");
    this.scope.push();
    for (const stmt of topLevel) {
      out.push(this.emitStatement(stmt, 1));
    }
    this.scope.pop();
    out.push("  return 0;");
    out.push("}");

    return out.join("\n") + "\n";
  }

  private typeFromAnnotation(node: ts.TypeNode | undefined, anchor: ts.Node): TopazType {
    if (!node) throw new CodegenError(anchor, "type annotation required");
    if (node.kind === ts.SyntaxKind.NumberKeyword) return "topaz_number";
    if (node.kind === ts.SyntaxKind.BooleanKeyword) return "topaz_boolean";
    if (node.kind === ts.SyntaxKind.StringKeyword) return "topaz_string";
    if (ts.isArrayTypeNode(node)) {
      const elem = this.typeFromAnnotation(node.elementType, node);
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(node, `no Array monomorph for element type ${elem}`);
      }
      return arr;
    }
    if (
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      node.typeName.text === "Array"
    ) {
      if (!node.typeArguments || node.typeArguments.length !== 1) {
        throw new CodegenError(node, "Array<T> requires exactly one type argument");
      }
      const elem = this.typeFromAnnotation(node.typeArguments[0]!, node);
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(node, `no Array monomorph for element type ${elem}`);
      }
      return arr;
    }
    unsupported(node, "type");
  }

  private formatSignature(fn: ts.FunctionDeclaration): string {
    const ret = this.typeFromAnnotation(fn.type, fn);
    const params = fn.parameters
      .map((p) => {
        if (!ts.isIdentifier(p.name)) {
          throw new CodegenError(p, "parameter must be a simple identifier");
        }
        if (p.questionToken || p.initializer || p.dotDotDotToken) {
          throw new CodegenError(p, "optional/default/rest parameters are unsupported");
        }
        const t = this.typeFromAnnotation(p.type, p);
        return `${cTypeName(t)} ${p.name.text}`;
      })
      .join(", ");
    return `static ${cTypeName(ret)} ${fn.name!.text}(${params || "void"})`;
  }

  private emitFunctionDefinition(fn: ts.FunctionDeclaration): string {
    if (!fn.body) throw new CodegenError(fn, "function must have a body");
    this.scope.push();
    for (const p of fn.parameters) {
      const name = (p.name as ts.Identifier).text;
      const t = this.typeFromAnnotation(p.type, p);
      this.scope.declare(name, t, /* isConst */ false, p);
    }
    const body = this.emitBlock(fn.body, 0);
    this.scope.pop();
    return `${this.formatSignature(fn)} ${body}`;
  }

  private emitBlock(block: ts.Block, indent: number): string {
    const pad = "  ".repeat(indent);
    const lines = block.statements.map((s) => this.emitStatement(s, indent + 1));
    return `${pad}{\n${lines.join("\n")}\n${pad}}`;
  }

  private emitStatement(stmt: ts.Statement, indent: number): string {
    const pad = "  ".repeat(indent);

    if (ts.isReturnStatement(stmt)) {
      return stmt.expression
        ? `${pad}return ${this.emitExpression(stmt.expression)};`
        : `${pad}return;`;
    }

    if (ts.isExpressionStatement(stmt)) {
      return `${pad}${this.emitExpression(stmt.expression)};`;
    }

    if (ts.isVariableStatement(stmt)) {
      return this.emitVarDecls(stmt.declarationList, indent);
    }

    if (ts.isIfStatement(stmt)) {
      this.expectType(stmt.expression, "topaz_boolean");
      const cond = this.emitExpression(stmt.expression);
      const thenStr = this.emitStatementAsBlock(stmt.thenStatement, indent);
      let out = `${pad}if (${cond}) ${thenStr.trimStart()}`;
      if (stmt.elseStatement) {
        const elseStr = this.emitStatementAsBlock(stmt.elseStatement, indent);
        out += ` else ${elseStr.trimStart()}`;
      }
      return out;
    }

    if (ts.isWhileStatement(stmt)) {
      this.expectType(stmt.expression, "topaz_boolean");
      const cond = this.emitExpression(stmt.expression);
      const body = this.emitStatementAsBlock(stmt.statement, indent);
      return `${pad}while (${cond}) ${body.trimStart()}`;
    }

    if (ts.isDoStatement(stmt)) {
      this.expectType(stmt.expression, "topaz_boolean");
      const cond = this.emitExpression(stmt.expression);
      const body = this.emitStatementAsBlock(stmt.statement, indent);
      return `${pad}do ${body.trimStart()} while (${cond});`;
    }

    if (ts.isForStatement(stmt)) {
      return this.emitForStatement(stmt, indent);
    }

    if (ts.isSwitchStatement(stmt)) {
      return this.emitSwitchStatement(stmt, indent);
    }

    if (ts.isBreakStatement(stmt)) {
      if (stmt.label) unsupported(stmt, "labeled break");
      return `${pad}break;`;
    }

    if (ts.isContinueStatement(stmt)) {
      if (stmt.label) unsupported(stmt, "labeled continue");
      this.checkContinueAllowed(stmt);
      return `${pad}continue;`;
    }

    if (ts.isBlock(stmt)) {
      this.scope.push();
      const out = this.emitBlock(stmt, indent);
      this.scope.pop();
      return out;
    }

    unsupported(stmt, "statement");
  }

  private emitStatementAsBlock(stmt: ts.Statement, indent: number): string {
    const pad = "  ".repeat(indent);
    if (ts.isBlock(stmt)) {
      this.scope.push();
      const out = this.emitBlock(stmt, indent);
      this.scope.pop();
      return out;
    }
    this.scope.push();
    const inner = this.emitStatement(stmt, indent + 1);
    this.scope.pop();
    return `${pad}{\n${inner}\n${pad}}`;
  }

  private emitVarDecls(list: ts.VariableDeclarationList, indent: number): string {
    const pad = "  ".repeat(indent);
    const isConst = (list.flags & ts.NodeFlags.Const) !== 0;
    const isLet = (list.flags & ts.NodeFlags.Let) !== 0;
    if (!isConst && !isLet) {
      throw new CodegenError(list, "var is unsupported; use let or const");
    }
    const lines: string[] = [];
    for (const d of list.declarations) {
      const { type, cName, initStr } = this.declareVar(d, isConst);
      lines.push(`${pad}${cTypeName(type)} ${cName}${initStr};`);
    }
    return lines.join("\n");
  }

  private declareVar(
    decl: ts.VariableDeclaration,
    isConst: boolean,
  ): { type: TopazType; cName: string; initStr: string } {
    if (!ts.isIdentifier(decl.name)) {
      throw new CodegenError(decl, "variable name must be a simple identifier");
    }
    if (!decl.initializer) {
      throw new CodegenError(decl, "variable declaration must have an initializer");
    }
    const name = decl.name.text;
    let type: TopazType;
    if (decl.type) {
      type = this.typeFromAnnotation(decl.type, decl);
      // Empty `[]` literals can only be typed from context, so thread the
      // declared type into the literal instead of running inferType on it.
      if (
        !(
          ts.isArrayLiteralExpression(decl.initializer) &&
          decl.initializer.elements.length === 0
        )
      ) {
        this.expectType(decl.initializer, type);
      } else if (!isArrayType(type)) {
        throw new CodegenError(decl.initializer, `type mismatch: expected ${type}, got an empty array literal`);
      }
    } else {
      type = this.inferType(decl.initializer);
    }
    this.scope.declare(name, type, isConst, decl);
    const initExpr = ts.isArrayLiteralExpression(decl.initializer)
      ? this.emitArrayLiteral(decl.initializer, type)
      : this.emitExpression(decl.initializer);
    const initStr = ` = ${initExpr}`;
    return { type, cName: name, initStr };
  }

  private emitForStatement(stmt: ts.ForStatement, indent: number): string {
    const pad = "  ".repeat(indent);
    this.scope.push();
    try {
      let initStr = "";
      if (stmt.initializer) {
        if (ts.isVariableDeclarationList(stmt.initializer)) {
          const init = stmt.initializer;
          if (init.declarations.length !== 1) {
            throw new CodegenError(init, "for-init with multiple declarations is unsupported");
          }
          const isConst = (init.flags & ts.NodeFlags.Const) !== 0;
          const isLet = (init.flags & ts.NodeFlags.Let) !== 0;
          if (!isConst && !isLet) {
            throw new CodegenError(init, "var is unsupported; use let or const");
          }
          const { type, cName, initStr: vInit } = this.declareVar(init.declarations[0]!, isConst);
          initStr = `${cTypeName(type)} ${cName}${vInit}`;
        } else {
          initStr = this.emitExpression(stmt.initializer as ts.Expression);
        }
      }
      if (!stmt.condition) {
        throw new CodegenError(stmt, "for-loop requires a condition");
      }
      this.expectType(stmt.condition, "topaz_boolean");
      const condStr = this.emitExpression(stmt.condition);
      const incrStr = stmt.incrementor ? this.emitExpression(stmt.incrementor) : "";

      let bodyStr: string;
      if (ts.isBlock(stmt.statement)) {
        this.scope.push();
        bodyStr = this.emitBlock(stmt.statement, indent);
        this.scope.pop();
      } else {
        this.scope.push();
        const inner = this.emitStatement(stmt.statement, indent + 1);
        this.scope.pop();
        bodyStr = `${pad}{\n${inner}\n${pad}}`;
      }
      return `${pad}for (${initStr}; ${condStr}; ${incrStr}) ${bodyStr.trimStart()}`;
    } finally {
      this.scope.pop();
    }
  }

  private emitSwitchStatement(stmt: ts.SwitchStatement, indent: number): string {
    const pad = "  ".repeat(indent);
    const discType = this.inferType(stmt.expression);
    const clauses = stmt.caseBlock.clauses;

    let defaultClause: ts.DefaultClause | undefined;
    for (let i = 0; i < clauses.length; i++) {
      const c = clauses[i]!;
      if (ts.isDefaultClause(c)) {
        if (i !== clauses.length - 1) {
          throw new CodegenError(c, "`default` must be the last clause of `switch`");
        }
        defaultClause = c;
      }
    }

    type Group = { conds: ts.CaseClause[]; body: readonly ts.Statement[] };
    const groups: Group[] = [];
    let pending: ts.CaseClause[] = [];
    for (const c of clauses) {
      if (ts.isCaseClause(c)) {
        this.expectType(c.expression, discType);
        pending.push(c);
        if (c.statements.length > 0) {
          groups.push({ conds: pending, body: c.statements });
          pending = [];
        }
      }
    }
    if (pending.length > 0) {
      groups.push({ conds: pending, body: [] });
    }

    const isTerminator = (s: ts.Statement): boolean =>
      ts.isBreakStatement(s) ||
      ts.isReturnStatement(s) ||
      ts.isThrowStatement(s) ||
      ts.isContinueStatement(s);
    for (const g of groups) {
      if (g.body.length > 0 && !isTerminator(g.body[g.body.length - 1]!)) {
        throw new CodegenError(
          g.body[g.body.length - 1]!,
          "case body must end with `break` or `return` (implicit fall-through is unsupported)",
        );
      }
    }

    const id = this.switchCounter++;
    const tmp = `__topaz_sw_${id}`;
    const discExpr = this.emitExpression(stmt.expression);

    const out: string[] = [];
    out.push(`${pad}{`);
    out.push(`${pad}  ${cTypeName(discType)} ${tmp} = ${discExpr};`);
    out.push(`${pad}  do {`);

    this.scope.push();
    try {
      const cmp = (rhs: string): string =>
        discType === "topaz_string"
          ? `topaz_string_eq(${tmp}, ${rhs})`
          : `${tmp} == ${rhs}`;
      let first = true;
      for (const g of groups) {
        const conds = g.conds.map((c) => cmp(this.emitExpression(c.expression))).join(" || ");
        const head = first ? "if" : "else if";
        if (g.body.length === 0) {
          out.push(`${pad}    ${head} (${conds}) { break; }`);
        } else {
          out.push(`${pad}    ${head} (${conds}) {`);
          for (const s of g.body) {
            out.push(this.emitStatement(s, indent + 3));
          }
          out.push(`${pad}    }`);
        }
        first = false;
      }
      if (defaultClause) {
        const head = first ? "if (1)" : "else";
        if (defaultClause.statements.length === 0) {
          out.push(`${pad}    ${head} { break; }`);
        } else {
          out.push(`${pad}    ${head} {`);
          for (const s of defaultClause.statements) {
            out.push(this.emitStatement(s, indent + 3));
          }
          out.push(`${pad}    }`);
        }
      }
    } finally {
      this.scope.pop();
    }

    out.push(`${pad}  } while (0);`);
    out.push(`${pad}}`);
    return out.join("\n");
  }

  private checkContinueAllowed(stmt: ts.ContinueStatement): void {
    let p: ts.Node | undefined = stmt.parent;
    while (p) {
      if (
        ts.isWhileStatement(p) ||
        ts.isDoStatement(p) ||
        ts.isForStatement(p) ||
        ts.isForInStatement(p) ||
        ts.isForOfStatement(p)
      ) {
        return;
      }
      if (ts.isSwitchStatement(p)) {
        throw new CodegenError(
          stmt,
          "`continue` inside `switch` is unsupported (switch lowers to do/while(0))",
        );
      }
      if (ts.isFunctionLike(p) || ts.isSourceFile(p)) {
        throw new CodegenError(stmt, "`continue` outside of a loop");
      }
      p = p.parent;
    }
  }

  private emitExpression(expr: ts.Expression): string {
    if (ts.isNumericLiteral(expr)) {
      const t = expr.text;
      return /[.eE]/.test(t) ? t : `${t}.0`;
    }
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return "true";
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return "false";
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return this.emitStringLiteral(expr);
    }
    if (ts.isIdentifier(expr)) {
      if (!this.scope.lookup(expr.text)) {
        throw new CodegenError(expr, `unknown identifier '${expr.text}'`);
      }
      return expr.text;
    }
    if (ts.isParenthesizedExpression(expr)) {
      return `(${this.emitExpression(expr.expression)})`;
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      if (baseType === "topaz_string" && expr.name.text === "length") {
        return `((topaz_number)(${this.emitExpression(expr.expression)}).len)`;
      }
      if (isArrayType(baseType) && expr.name.text === "length") {
        return `((topaz_number)(${this.emitExpression(expr.expression)})->len)`;
      }
      throw new CodegenError(
        expr,
        `unsupported property access '.${expr.name.text}' on ${baseType}`,
      );
    }
    if (ts.isElementAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      const elem = arrayElem(baseType);
      if (!elem) {
        throw new CodegenError(expr, `index access is only supported on Array (got ${baseType})`);
      }
      this.expectType(expr.argumentExpression, "topaz_number");
      const name = arrayShortName(baseType);
      return `topaz_array_${name}_at(${this.emitExpression(expr.expression)}, ${this.emitExpression(expr.argumentExpression)})`;
    }
    if (ts.isArrayLiteralExpression(expr)) {
      return this.emitArrayLiteral(expr, /* expected */ undefined);
    }
    if (ts.isPrefixUnaryExpression(expr)) {
      this.inferType(expr); // type-check
      const op = this.prefixOp(expr);
      return `(${op}${this.emitExpression(expr.operand)})`;
    }
    if (ts.isPostfixUnaryExpression(expr)) {
      this.inferType(expr);
      const op = this.postfixOp(expr);
      return `(${this.emitExpression(expr.operand)}${op})`;
    }
    if (ts.isBinaryExpression(expr)) {
      this.inferType(expr); // type-check + const-check
      const tok = expr.operatorToken.kind;
      // Element-access assignment lowers to topaz_array_X_set; compound
      // assignment on a[i] is unsupported because we'd evaluate the index twice.
      if (
        ts.isElementAccessExpression(expr.left) &&
        (tok === ts.SyntaxKind.EqualsToken ||
          tok === ts.SyntaxKind.PlusEqualsToken ||
          tok === ts.SyntaxKind.MinusEqualsToken ||
          tok === ts.SyntaxKind.AsteriskEqualsToken ||
          tok === ts.SyntaxKind.SlashEqualsToken ||
          tok === ts.SyntaxKind.PercentEqualsToken)
      ) {
        if (tok !== ts.SyntaxKind.EqualsToken) {
          throw new CodegenError(expr, "compound assignment on array element is unsupported; use a[i] = ...");
        }
        const baseType = this.inferType(expr.left.expression);
        const name = arrayShortName(baseType);
        const base = this.emitExpression(expr.left.expression);
        const idx = this.emitExpression(expr.left.argumentExpression);
        const val = this.emitExpression(expr.right);
        return `topaz_array_${name}_set(${base}, ${idx}, ${val})`;
      }
      // JS `%` is fmod for number; C's `%` rejects double, so always lower.
      if (tok === ts.SyntaxKind.PercentToken) {
        return `topaz_fmod(${this.emitExpression(expr.left)}, ${this.emitExpression(expr.right)})`;
      }
      if (tok === ts.SyntaxKind.PercentEqualsToken) {
        const lhs = this.emitExpression(expr.left);
        return `(${lhs} = topaz_fmod(${lhs}, ${this.emitExpression(expr.right)}))`;
      }
      if (tok === ts.SyntaxKind.PlusToken && this.inferType(expr.left) === "topaz_string") {
        return `topaz_string_concat(${this.emitExpression(expr.left)}, ${this.emitExpression(expr.right)})`;
      }
      if (
        tok === ts.SyntaxKind.PlusEqualsToken &&
        this.inferType(expr.left) === "topaz_string"
      ) {
        const lhs = this.emitExpression(expr.left);
        return `(${lhs} = topaz_string_concat(${lhs}, ${this.emitExpression(expr.right)}))`;
      }
      if (
        (tok === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          tok === ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
        this.inferType(expr.left) === "topaz_string"
      ) {
        const inner = `topaz_string_eq(${this.emitExpression(expr.left)}, ${this.emitExpression(expr.right)})`;
        return tok === ts.SyntaxKind.EqualsEqualsEqualsToken ? inner : `(!${inner})`;
      }
      const op = this.binaryOp(expr.operatorToken);
      return `(${this.emitExpression(expr.left)} ${op} ${this.emitExpression(expr.right)})`;
    }
    if (ts.isCallExpression(expr)) {
      return this.emitCall(expr);
    }
    unsupported(expr, "expression");
  }

  private emitArrayLiteral(
    expr: ts.ArrayLiteralExpression,
    expected: TopazType | undefined,
  ): string {
    for (const e of expr.elements) {
      if (ts.isSpreadElement(e) || e.kind === ts.SyntaxKind.OmittedExpression) {
        throw new CodegenError(e, "spread / holes in array literals are unsupported");
      }
    }
    let arrType: TopazType;
    if (expr.elements.length === 0) {
      if (!expected || !isArrayType(expected)) {
        throw new CodegenError(
          expr,
          "cannot infer element type of empty array literal; add an `Array<T>` annotation",
        );
      }
      arrType = expected;
    } else {
      const elem = this.inferType(expr.elements[0]!);
      for (let i = 1; i < expr.elements.length; i++) {
        this.expectType(expr.elements[i]!, elem);
      }
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(expr, `no Array monomorph for element type ${elem}`);
      }
      arrType = arr;
      if (expected && expected !== arrType) {
        throw new CodegenError(
          expr,
          `type mismatch: expected ${expected}, got ${arrType}`,
        );
      }
    }
    const name = arrayShortName(arrType);
    const id = this.tmpCounter++;
    const tmp = `__topaz_arr_${id}`;
    // GCC/clang statement-expression: build, fill, yield the pointer.
    const parts: string[] = [];
    parts.push(`topaz_array_${name} *${tmp} = topaz_array_${name}_new();`);
    if (expr.elements.length > 0) {
      parts.push(`topaz_array_${name}_reserve(${tmp}, ${expr.elements.length});`);
    }
    for (const e of expr.elements) {
      parts.push(`topaz_array_${name}_push(${tmp}, ${this.emitExpression(e as ts.Expression)});`);
    }
    return `({ ${parts.join(" ")} ${tmp}; })`;
  }

  private emitStringLiteral(expr: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): string {
    const cooked = expr.text;
    let escaped = '"';
    let byteLen = 0;
    for (let i = 0; i < cooked.length; i++) {
      const c = cooked.charCodeAt(i);
      if (c >= 0x80) {
        throw new CodegenError(
          expr,
          "non-ASCII characters in string literals are unsupported (UTF-16 length divergence)",
        );
      }
      if (c === 0x22) escaped += '\\"';
      else if (c === 0x5c) escaped += "\\\\";
      else if (c === 0x0a) escaped += "\\n";
      else if (c === 0x0d) escaped += "\\r";
      else if (c === 0x09) escaped += "\\t";
      else if (c === 0x00) escaped += "\\0";
      else if (c < 0x20 || c === 0x7f) {
        escaped += `\\x${c.toString(16).padStart(2, "0")}`;
      } else {
        escaped += String.fromCharCode(c);
      }
      byteLen++;
    }
    escaped += '"';
    return `((topaz_string){ ${escaped}, ${byteLen} })`;
  }

  private prefixOp(expr: ts.PrefixUnaryExpression): string {
    switch (expr.operator) {
      case ts.SyntaxKind.MinusToken: return "-";
      case ts.SyntaxKind.PlusToken: return "+";
      case ts.SyntaxKind.ExclamationToken: return "!";
      case ts.SyntaxKind.PlusPlusToken: return "++";
      case ts.SyntaxKind.MinusMinusToken: return "--";
      default: unsupported(expr, "prefix unary operator");
    }
  }

  private postfixOp(expr: ts.PostfixUnaryExpression): string {
    switch (expr.operator) {
      case ts.SyntaxKind.PlusPlusToken: return "++";
      case ts.SyntaxKind.MinusMinusToken: return "--";
      default: unsupported(expr, "postfix unary operator");
    }
  }

  private binaryOp(tok: ts.BinaryOperatorToken): string {
    switch (tok.kind) {
      case ts.SyntaxKind.PlusToken: return "+";
      case ts.SyntaxKind.MinusToken: return "-";
      case ts.SyntaxKind.AsteriskToken: return "*";
      case ts.SyntaxKind.SlashToken: return "/";
      case ts.SyntaxKind.PercentToken: return "%";
      case ts.SyntaxKind.LessThanToken: return "<";
      case ts.SyntaxKind.LessThanEqualsToken: return "<=";
      case ts.SyntaxKind.GreaterThanToken: return ">";
      case ts.SyntaxKind.GreaterThanEqualsToken: return ">=";
      case ts.SyntaxKind.EqualsEqualsEqualsToken: return "==";
      case ts.SyntaxKind.ExclamationEqualsEqualsToken: return "!=";
      case ts.SyntaxKind.AmpersandAmpersandToken: return "&&";
      case ts.SyntaxKind.BarBarToken: return "||";
      case ts.SyntaxKind.EqualsToken: return "=";
      case ts.SyntaxKind.PlusEqualsToken: return "+=";
      case ts.SyntaxKind.MinusEqualsToken: return "-=";
      case ts.SyntaxKind.AsteriskEqualsToken: return "*=";
      case ts.SyntaxKind.SlashEqualsToken: return "/=";
      case ts.SyntaxKind.PercentEqualsToken: return "%=";
      case ts.SyntaxKind.EqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsToken:
        throw new CodegenError(tok, "loose equality (== / !=) is unsupported; use === / !==");
      default:
        unsupported(tok, "binary operator");
    }
  }

  private emitCall(expr: ts.CallExpression): string {
    const callee = expr.expression;

    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "console" &&
      callee.name.text === "log"
    ) {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "console.log expects exactly one argument");
      }
      const arg = expr.arguments[0]!;
      const t = this.inferType(arg);
      if (isArrayType(t)) {
        throw new CodegenError(arg, "console.log on Array is unsupported");
      }
      const fn =
        t === "topaz_boolean" ? "topaz_console_log_boolean"
        : t === "topaz_string" ? "topaz_console_log_string"
        : "topaz_console_log_number";
      return `${fn}(${this.emitExpression(arg)})`;
    }

    if (ts.isPropertyAccessExpression(callee)) {
      const baseType = this.inferType(callee.expression);
      if (isArrayType(baseType)) {
        return this.emitArrayMethodCall(expr, callee, baseType);
      }
      throw new CodegenError(callee, `unsupported method '.${callee.name.text}' on ${baseType}`);
    }

    if (ts.isIdentifier(callee)) {
      const ret = this.functionReturns.get(callee.text);
      if (!ret) {
        throw new CodegenError(callee, `unknown function '${callee.text}'`);
      }
      const args = expr.arguments.map((a) => this.emitExpression(a)).join(", ");
      return `${callee.text}(${args})`;
    }

    unsupported(callee, "call target");
  }

  private emitArrayMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const name = arrayShortName(baseType);
    const elem = arrayElem(baseType)!;
    const method = callee.name.text;
    const base = this.emitExpression(callee.expression);
    if (method === "push") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Array.push expects exactly one argument");
      }
      this.expectType(expr.arguments[0]!, elem);
      return `topaz_array_${name}_push(${base}, ${this.emitExpression(expr.arguments[0]!)})`;
    }
    if (method === "pop") {
      if (expr.arguments.length !== 0) {
        throw new CodegenError(expr, "Array.pop expects no arguments");
      }
      return `topaz_array_${name}_pop(${base})`;
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on ${baseType}`);
  }

  private inferType(expr: ts.Expression): TopazType {
    if (ts.isNumericLiteral(expr)) return "topaz_number";
    if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) {
      return "topaz_boolean";
    }
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return "topaz_string";
    }
    if (ts.isParenthesizedExpression(expr)) return this.inferType(expr.expression);
    if (ts.isIdentifier(expr)) {
      const b = this.scope.lookup(expr.text);
      if (!b) throw new CodegenError(expr, `unknown identifier '${expr.text}'`);
      return b.type;
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      if (baseType === "topaz_string" && expr.name.text === "length") {
        return "topaz_number";
      }
      if (isArrayType(baseType) && expr.name.text === "length") {
        return "topaz_number";
      }
      throw new CodegenError(
        expr,
        `unsupported property access '.${expr.name.text}' on ${baseType}`,
      );
    }
    if (ts.isElementAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      const elem = arrayElem(baseType);
      if (!elem) {
        throw new CodegenError(expr, `index access is only supported on Array (got ${baseType})`);
      }
      this.expectType(expr.argumentExpression, "topaz_number");
      return elem;
    }
    if (ts.isArrayLiteralExpression(expr)) {
      if (expr.elements.length === 0) {
        throw new CodegenError(
          expr,
          "cannot infer element type of empty array literal; add an `Array<T>` annotation",
        );
      }
      const first = expr.elements[0]!;
      const elem = this.inferType(first);
      for (let i = 1; i < expr.elements.length; i++) {
        this.expectType(expr.elements[i]!, elem);
      }
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(expr, `no Array monomorph for element type ${elem}`);
      }
      return arr;
    }
    if (ts.isPrefixUnaryExpression(expr)) {
      switch (expr.operator) {
        case ts.SyntaxKind.MinusToken:
        case ts.SyntaxKind.PlusToken:
          this.expectType(expr.operand, "topaz_number");
          return "topaz_number";
        case ts.SyntaxKind.ExclamationToken:
          this.expectType(expr.operand, "topaz_boolean");
          return "topaz_boolean";
        case ts.SyntaxKind.PlusPlusToken:
        case ts.SyntaxKind.MinusMinusToken:
          this.checkAssignTarget(expr.operand, expr);
          this.expectType(expr.operand, "topaz_number");
          return "topaz_number";
        default:
          unsupported(expr, "prefix unary operator");
      }
    }
    if (ts.isPostfixUnaryExpression(expr)) {
      this.checkAssignTarget(expr.operand, expr);
      this.expectType(expr.operand, "topaz_number");
      return "topaz_number";
    }
    if (ts.isBinaryExpression(expr)) {
      const kind = expr.operatorToken.kind;
      switch (kind) {
        case ts.SyntaxKind.PlusToken: {
          const lt = this.inferType(expr.left);
          if (lt === "topaz_string") {
            this.expectType(expr.right, "topaz_string");
            return "topaz_string";
          }
          this.expectType(expr.left, "topaz_number");
          this.expectType(expr.right, "topaz_number");
          return "topaz_number";
        }
        case ts.SyntaxKind.MinusToken:
        case ts.SyntaxKind.AsteriskToken:
        case ts.SyntaxKind.SlashToken:
        case ts.SyntaxKind.PercentToken:
          this.expectType(expr.left, "topaz_number");
          this.expectType(expr.right, "topaz_number");
          return "topaz_number";
        case ts.SyntaxKind.LessThanToken:
        case ts.SyntaxKind.LessThanEqualsToken:
        case ts.SyntaxKind.GreaterThanToken:
        case ts.SyntaxKind.GreaterThanEqualsToken:
          this.expectType(expr.left, "topaz_number");
          this.expectType(expr.right, "topaz_number");
          return "topaz_boolean";
        case ts.SyntaxKind.EqualsEqualsEqualsToken:
        case ts.SyntaxKind.ExclamationEqualsEqualsToken: {
          const lt = this.inferType(expr.left);
          this.expectType(expr.right, lt);
          return "topaz_boolean";
        }
        case ts.SyntaxKind.AmpersandAmpersandToken:
        case ts.SyntaxKind.BarBarToken:
          this.expectType(expr.left, "topaz_boolean");
          this.expectType(expr.right, "topaz_boolean");
          return "topaz_boolean";
        case ts.SyntaxKind.EqualsToken: {
          this.checkAssignTarget(expr.left, expr);
          const lt = this.inferType(expr.left);
          this.expectType(expr.right, lt);
          return lt;
        }
        case ts.SyntaxKind.PlusEqualsToken: {
          this.checkAssignTarget(expr.left, expr);
          const lt = this.inferType(expr.left);
          if (lt === "topaz_string") {
            this.expectType(expr.right, "topaz_string");
            return "topaz_string";
          }
          this.expectType(expr.left, "topaz_number");
          this.expectType(expr.right, "topaz_number");
          return "topaz_number";
        }
        case ts.SyntaxKind.MinusEqualsToken:
        case ts.SyntaxKind.AsteriskEqualsToken:
        case ts.SyntaxKind.SlashEqualsToken:
        case ts.SyntaxKind.PercentEqualsToken:
          this.checkAssignTarget(expr.left, expr);
          this.expectType(expr.left, "topaz_number");
          this.expectType(expr.right, "topaz_number");
          return "topaz_number";
        case ts.SyntaxKind.EqualsEqualsToken:
        case ts.SyntaxKind.ExclamationEqualsToken:
          throw new CodegenError(
            expr.operatorToken,
            "loose equality (== / !=) is unsupported; use === / !==",
          );
        default:
          unsupported(expr.operatorToken, "binary operator");
      }
    }
    if (ts.isCallExpression(expr)) {
      const callee = expr.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "console" &&
        callee.name.text === "log"
      ) {
        throw new CodegenError(expr, "console.log returns void and cannot be used as a value");
      }
      if (ts.isPropertyAccessExpression(callee)) {
        const baseType = this.inferType(callee.expression);
        if (isArrayType(baseType)) {
          const elem = arrayElem(baseType)!;
          if (callee.name.text === "push") {
            throw new CodegenError(expr, "Array.push returns void in this dialect and cannot be used as a value");
          }
          if (callee.name.text === "pop") {
            return elem;
          }
          throw new CodegenError(callee, `unsupported method '.${callee.name.text}' on ${baseType}`);
        }
        throw new CodegenError(callee, `unsupported method '.${callee.name.text}' on ${baseType}`);
      }
      if (ts.isIdentifier(callee)) {
        const ret = this.functionReturns.get(callee.text);
        if (!ret) throw new CodegenError(callee, `unknown function '${callee.text}'`);
        return ret;
      }
      unsupported(callee, "call target");
    }
    unsupported(expr, "expression");
  }

  private checkAssignTarget(target: ts.Expression, anchor: ts.Node): void {
    if (ts.isIdentifier(target)) {
      const b = this.scope.lookup(target.text);
      if (!b) {
        throw new CodegenError(target, `unknown identifier '${target.text}'`);
      }
      if (b.isConst) {
        throw new CodegenError(anchor, `cannot assign to const '${target.text}'`);
      }
      return;
    }
    if (ts.isElementAccessExpression(target)) {
      // `const arr = [...]` rebinds the binding, not the storage — element
      // assignment mutates through the pointer and is always allowed.
      const baseType = this.inferType(target.expression);
      if (!isArrayType(baseType)) {
        throw new CodegenError(target, `index assignment is only supported on Array (got ${baseType})`);
      }
      return;
    }
    throw new CodegenError(anchor, "assignment target must be an identifier or array index");
  }

  private expectType(expr: ts.Expression, expected: TopazType): void {
    const actual = this.inferType(expr);
    if (actual !== expected) {
      throw new CodegenError(expr, `type mismatch: expected ${expected}, got ${actual}`);
    }
  }
}

export function codegen(sf: ts.SourceFile): string {
  return new Emitter().emit(sf);
}

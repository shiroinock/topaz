import * as ts from "typescript";

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
  throw new CodegenError(node, `Phase 0: unsupported ${what} (${ts.SyntaxKind[node.kind]})`);
}

function tsTypeToC(node: ts.TypeNode | undefined, anchor: ts.Node): string {
  if (!node) throw new CodegenError(anchor, "Phase 0: type annotation required");
  if (node.kind === ts.SyntaxKind.NumberKeyword) return "topaz_number";
  unsupported(node, "type");
}

function emitNumericLiteral(lit: ts.NumericLiteral): string {
  const t = lit.text;
  return /[.eE]/.test(t) ? t : `${t}.0`;
}

function mapBinaryOp(token: ts.BinaryOperatorToken): string {
  switch (token.kind) {
    case ts.SyntaxKind.PlusToken: return "+";
    case ts.SyntaxKind.MinusToken: return "-";
    case ts.SyntaxKind.AsteriskToken: return "*";
    case ts.SyntaxKind.SlashToken: return "/";
    case ts.SyntaxKind.LessThanToken: return "<";
    case ts.SyntaxKind.LessThanEqualsToken: return "<=";
    case ts.SyntaxKind.GreaterThanToken: return ">";
    case ts.SyntaxKind.GreaterThanEqualsToken: return ">=";
    case ts.SyntaxKind.EqualsEqualsEqualsToken: return "==";
    case ts.SyntaxKind.ExclamationEqualsEqualsToken: return "!=";
    default: unsupported(token, "binary operator");
  }
}

function emitCallee(callee: ts.Expression): string {
  if (ts.isIdentifier(callee)) return callee.text;
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "console" &&
    callee.name.text === "log"
  ) {
    return "topaz_console_log_number";
  }
  unsupported(callee, "call target");
}

function emitExpression(expr: ts.Expression): string {
  if (ts.isNumericLiteral(expr)) return emitNumericLiteral(expr);
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isParenthesizedExpression(expr)) return `(${emitExpression(expr.expression)})`;
  if (ts.isBinaryExpression(expr)) {
    const op = mapBinaryOp(expr.operatorToken);
    return `(${emitExpression(expr.left)} ${op} ${emitExpression(expr.right)})`;
  }
  if (ts.isCallExpression(expr)) {
    const callee = emitCallee(expr.expression);
    const args = expr.arguments.map(emitExpression).join(", ");
    return `${callee}(${args})`;
  }
  unsupported(expr, "expression");
}

function emitStatement(stmt: ts.Statement, indent: number): string {
  const pad = "  ".repeat(indent);
  if (ts.isReturnStatement(stmt)) {
    return stmt.expression
      ? `${pad}return ${emitExpression(stmt.expression)};`
      : `${pad}return;`;
  }
  if (ts.isExpressionStatement(stmt)) {
    return `${pad}${emitExpression(stmt.expression)};`;
  }
  if (ts.isIfStatement(stmt)) {
    const cond = emitExpression(stmt.expression);
    const thenStr = emitStatementAsBlock(stmt.thenStatement, indent);
    let out = `${pad}if (${cond}) ${thenStr.trimStart()}`;
    if (stmt.elseStatement) {
      const elseStr = emitStatementAsBlock(stmt.elseStatement, indent);
      out += ` else ${elseStr.trimStart()}`;
    }
    return out;
  }
  if (ts.isBlock(stmt)) {
    return emitBlock(stmt, indent);
  }
  unsupported(stmt, "statement");
}

function emitStatementAsBlock(stmt: ts.Statement, indent: number): string {
  if (ts.isBlock(stmt)) return emitBlock(stmt, indent);
  const pad = "  ".repeat(indent);
  const inner = emitStatement(stmt, indent + 1);
  return `${pad}{\n${inner}\n${pad}}`;
}

function emitBlock(block: ts.Block, indent: number): string {
  const pad = "  ".repeat(indent);
  const lines = block.statements.map((s) => emitStatement(s, indent + 1));
  return `${pad}{\n${lines.join("\n")}\n${pad}}`;
}

function emitFunctionSignature(fn: ts.FunctionDeclaration): string {
  if (!fn.name) throw new CodegenError(fn, "Phase 0: function must be named");
  const ret = tsTypeToC(fn.type, fn);
  const params = fn.parameters
    .map((p) => {
      if (!ts.isIdentifier(p.name)) {
        throw new CodegenError(p, "Phase 0: parameter must be a simple identifier");
      }
      const t = tsTypeToC(p.type, p);
      return `${t} ${p.name.text}`;
    })
    .join(", ");
  return `static ${ret} ${fn.name.text}(${params || "void"})`;
}

function emitFunctionDefinition(fn: ts.FunctionDeclaration): string {
  if (!fn.body) throw new CodegenError(fn, "Phase 0: function must have a body");
  return `${emitFunctionSignature(fn)} ${emitBlock(fn.body, 0)}`;
}

export function codegen(sf: ts.SourceFile): string {
  const functions: ts.FunctionDeclaration[] = [];
  const topLevel: ts.Statement[] = [];
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt)) functions.push(stmt);
    else topLevel.push(stmt);
  }

  const out: string[] = [];
  out.push('#include "runtime.h"');
  out.push("");

  for (const fn of functions) {
    out.push(`${emitFunctionSignature(fn)};`);
  }
  if (functions.length > 0) out.push("");

  for (const fn of functions) {
    out.push(emitFunctionDefinition(fn));
    out.push("");
  }

  out.push("int main(void) {");
  for (const stmt of topLevel) {
    out.push(emitStatement(stmt, 1));
  }
  out.push("  return 0;");
  out.push("}");

  return out.join("\n") + "\n";
}

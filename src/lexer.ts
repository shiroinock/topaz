// Topaz lexer — byte stream -> Array<Token>.
//
// Written within the Topaz subset so the same source compiles under stage1
// (Node + tsc) and stage2 (self-hosted Topaz). Subset constraints honored:
//   - no destructuring (object/array binding), no enum, no regex literal,
//     no `as` cast, no class `extends`, no generic method.
//   - string method usage limited to `.length` and `.charCodeAt` / `.slice`
//     (stage2 needs these from runtime; planned for 1.5-6f).
//   - throw values are class instances (LexError), caught via instanceof.
//
// This file covers identifier / keyword / number / string / punctuator /
// newline / eof. Template literals are declared in the Token union but
// emission is gated to a stub that errors — implementation lands in a
// follow-up step inside 1.5-6a.

export type IdentToken = { kind: "ident"; text: string; pos: number; end: number };
export type NumberToken = { kind: "number"; text: string; pos: number; end: number };
export type StringToken = { kind: "string"; value: string; pos: number; end: number };
export type TemplateHeadToken = { kind: "template_head"; value: string; pos: number; end: number };
export type TemplateMiddleToken = { kind: "template_middle"; value: string; pos: number; end: number };
export type TemplateTailToken = { kind: "template_tail"; value: string; pos: number; end: number };
export type TemplateFullToken = { kind: "template_full"; value: string; pos: number; end: number };
export type PunctToken = { kind: "punct"; op: string; pos: number; end: number };
export type KeywordToken = { kind: "keyword"; word: string; pos: number; end: number };
export type NewlineToken = { kind: "newline"; pos: number; end: number };
export type EofToken = { kind: "eof"; pos: number; end: number };

export type Token =
  | IdentToken
  | NumberToken
  | StringToken
  | TemplateHeadToken
  | TemplateMiddleToken
  | TemplateTailToken
  | TemplateFullToken
  | PunctToken
  | KeywordToken
  | NewlineToken
  | EofToken;

export class LexError {
  file: string;
  pos: number;
  message: string;
  constructor(file: string, pos: number, message: string) {
    this.file = file;
    this.pos = pos;
    this.message = message;
  }
}

const CHAR_HASH: number = 35;
const CHAR_TAB: number = 9;
const CHAR_LF: number = 10;
const CHAR_CR: number = 13;
const CHAR_SPACE: number = 32;
const CHAR_BANG: number = 33;
const CHAR_DQUOTE: number = 34;
const CHAR_DOLLAR: number = 36;
const CHAR_PERCENT: number = 37;
const CHAR_AMP: number = 38;
const CHAR_SQUOTE: number = 39;
const CHAR_LPAREN: number = 40;
const CHAR_RPAREN: number = 41;
const CHAR_STAR: number = 42;
const CHAR_PLUS: number = 43;
const CHAR_COMMA: number = 44;
const CHAR_MINUS: number = 45;
const CHAR_DOT: number = 46;
const CHAR_SLASH: number = 47;
const CHAR_0: number = 48;
const CHAR_9: number = 57;
const CHAR_COLON: number = 58;
const CHAR_SEMI: number = 59;
const CHAR_LT: number = 60;
const CHAR_EQ: number = 61;
const CHAR_GT: number = 62;
const CHAR_QMARK: number = 63;
const CHAR_A_UP: number = 65;
const CHAR_F_UP: number = 70;
const CHAR_Z_UP: number = 90;
const CHAR_LBRACKET: number = 91;
const CHAR_BACKSLASH: number = 92;
const CHAR_RBRACKET: number = 93;
const CHAR_CARET: number = 94;
const CHAR_UNDERSCORE: number = 95;
const CHAR_BACKTICK: number = 96;
const CHAR_A_LO: number = 97;
const CHAR_B_LO: number = 98;
const CHAR_F_LO: number = 102;
const CHAR_N_LO: number = 110;
const CHAR_R_LO: number = 114;
const CHAR_T_LO: number = 116;
const CHAR_X_LO: number = 120;
const CHAR_Z_LO: number = 122;
const CHAR_LBRACE: number = 123;
const CHAR_PIPE: number = 124;
const CHAR_RBRACE: number = 125;
const CHAR_TILDE: number = 126;

function isDigit(c: number): boolean {
  return c >= CHAR_0 && c <= CHAR_9;
}

function isHexDigit(c: number): boolean {
  if (isDigit(c)) return true;
  if (c >= CHAR_A_UP && c <= CHAR_F_UP) return true;
  if (c >= CHAR_A_LO && c <= CHAR_F_LO) return true;
  return false;
}

function isIdentStart(c: number): boolean {
  if (c >= CHAR_A_UP && c <= CHAR_Z_UP) return true;
  if (c >= CHAR_A_LO && c <= CHAR_Z_LO) return true;
  if (c === CHAR_UNDERSCORE) return true;
  if (c === CHAR_DOLLAR) return true;
  return false;
}

function isIdentCont(c: number): boolean {
  if (isIdentStart(c)) return true;
  if (isDigit(c)) return true;
  return false;
}

function isKeyword(word: string): boolean {
  if (word === "if") return true;
  if (word === "else") return true;
  if (word === "for") return true;
  if (word === "while") return true;
  if (word === "do") return true;
  if (word === "return") return true;
  if (word === "break") return true;
  if (word === "continue") return true;
  if (word === "switch") return true;
  if (word === "case") return true;
  if (word === "default") return true;
  if (word === "class") return true;
  if (word === "interface") return true;
  if (word === "extends") return true;
  if (word === "implements") return true;
  if (word === "function") return true;
  if (word === "new") return true;
  if (word === "this") return true;
  if (word === "true") return true;
  if (word === "false") return true;
  if (word === "null") return true;
  if (word === "undefined") return true;
  if (word === "void") return true;
  if (word === "unknown") return true;
  if (word === "const") return true;
  if (word === "let") return true;
  if (word === "var") return true;
  if (word === "throw") return true;
  if (word === "try") return true;
  if (word === "catch") return true;
  if (word === "finally") return true;
  if (word === "as") return true;
  if (word === "in") return true;
  if (word === "of") return true;
  if (word === "instanceof") return true;
  if (word === "type") return true;
  if (word === "import") return true;
  if (word === "export") return true;
  if (word === "from") return true;
  if (word === "typeof") return true;
  if (word === "readonly") return true;
  if (word === "public") return true;
  if (word === "private") return true;
  if (word === "protected") return true;
  if (word === "static") return true;
  if (word === "abstract") return true;
  if (word === "override") return true;
  return false;
}

export class Lexer {
  source: string;
  file: string;
  pos: number = 0;
  tokens: Array<Token> = [];
  braceDepth: number = 0;
  templateStack: Array<number> = [];

  constructor(source: string, file: string) {
    this.source = source;
    this.file = file;
  }

  peek(offset: number): number {
    const i: number = this.pos + offset;
    if (i >= this.source.length) return -1;
    return this.source.charCodeAt(i);
  }

  error(pos: number, msg: string): LexError {
    return new LexError(this.file, pos, msg);
  }

  tokenize(): Array<Token> {
    if (this.pos === 0 && this.source.length >= 2 && this.peek(0) === CHAR_HASH && this.peek(1) === CHAR_BANG) {
      this.skipLineComment();
    }
    while (this.pos < this.source.length) {
      this.scanOne();
    }
    this.tokens.push({ kind: "eof", pos: this.pos, end: this.pos });
    return this.tokens;
  }

  scanOne(): void {
    const c: number = this.peek(0);

    if (c === CHAR_SPACE || c === CHAR_TAB || c === CHAR_CR) {
      this.pos += 1;
      return;
    }
    if (c === CHAR_LF) {
      const start: number = this.pos;
      this.pos += 1;
      this.tokens.push({ kind: "newline", pos: start, end: this.pos });
      return;
    }
    if (c === CHAR_SLASH && this.peek(1) === CHAR_SLASH) {
      this.skipLineComment();
      return;
    }
    if (c === CHAR_SLASH && this.peek(1) === CHAR_STAR) {
      this.skipBlockComment();
      return;
    }
    if (isIdentStart(c)) {
      this.scanIdentOrKeyword();
      return;
    }
    if (isDigit(c)) {
      this.scanNumber();
      return;
    }
    if (c === CHAR_DOT && isDigit(this.peek(1))) {
      this.scanNumber();
      return;
    }
    if (c === CHAR_DQUOTE || c === CHAR_SQUOTE) {
      this.scanString(c);
      return;
    }
    if (c === CHAR_BACKTICK) {
      this.scanTemplateOpening();
      return;
    }
    this.scanPunct();
  }

  skipLineComment(): void {
    while (this.pos < this.source.length && this.peek(0) !== CHAR_LF) {
      this.pos += 1;
    }
  }

  skipBlockComment(): void {
    const start: number = this.pos;
    this.pos += 2;
    while (this.pos < this.source.length) {
      if (this.peek(0) === CHAR_STAR && this.peek(1) === CHAR_SLASH) {
        this.pos += 2;
        return;
      }
      this.pos += 1;
    }
    throw this.error(start, "unterminated block comment");
  }

  scanIdentOrKeyword(): void {
    const start: number = this.pos;
    this.pos += 1;
    while (this.pos < this.source.length && isIdentCont(this.peek(0))) {
      this.pos += 1;
    }
    const text: string = this.source.slice(start, this.pos);
    if (isKeyword(text)) {
      this.tokens.push({ kind: "keyword", word: text, pos: start, end: this.pos });
    } else {
      this.tokens.push({ kind: "ident", text: text, pos: start, end: this.pos });
    }
  }

  scanNumber(): void {
    const start: number = this.pos;
    if (this.peek(0) === CHAR_0 && (this.peek(1) === CHAR_X_LO || this.peek(1) === (CHAR_X_LO - 32))) {
      this.pos += 2;
      const hexStart: number = this.pos;
      while (this.pos < this.source.length && isHexDigit(this.peek(0))) {
        this.pos += 1;
      }
      if (this.pos === hexStart) {
        throw this.error(start, "invalid hex literal");
      }
      const text: string = this.source.slice(start, this.pos);
      this.tokens.push({ kind: "number", text: text, pos: start, end: this.pos });
      return;
    }
    if (this.peek(0) === CHAR_0 && (this.peek(1) === CHAR_B_LO || this.peek(1) === (CHAR_B_LO - 32))) {
      this.pos += 2;
      const binStart: number = this.pos;
      while (this.pos < this.source.length) {
        const b: number = this.peek(0);
        if (b !== CHAR_0 && b !== (CHAR_0 + 1)) break;
        this.pos += 1;
      }
      if (this.pos === binStart) {
        throw this.error(start, "invalid binary literal");
      }
      const text: string = this.source.slice(start, this.pos);
      this.tokens.push({ kind: "number", text: text, pos: start, end: this.pos });
      return;
    }
    while (this.pos < this.source.length && isDigit(this.peek(0))) {
      this.pos += 1;
    }
    if (this.peek(0) === CHAR_DOT && isDigit(this.peek(1))) {
      this.pos += 1;
      while (this.pos < this.source.length && isDigit(this.peek(0))) {
        this.pos += 1;
      }
    } else if (this.peek(0) === CHAR_DOT && this.pos === start + 0) {
      this.pos += 1;
      while (this.pos < this.source.length && isDigit(this.peek(0))) {
        this.pos += 1;
      }
    }
    const e: number = this.peek(0);
    if (e === (CHAR_A_LO + 4) || e === (CHAR_A_UP + 4)) {
      this.pos += 1;
      const sign: number = this.peek(0);
      if (sign === CHAR_PLUS || sign === CHAR_MINUS) {
        this.pos += 1;
      }
      const expStart: number = this.pos;
      while (this.pos < this.source.length && isDigit(this.peek(0))) {
        this.pos += 1;
      }
      if (this.pos === expStart) {
        throw this.error(start, "invalid number exponent");
      }
    }
    const text: string = this.source.slice(start, this.pos);
    this.tokens.push({ kind: "number", text: text, pos: start, end: this.pos });
  }

  scanString(quote: number): void {
    const start: number = this.pos;
    this.pos += 1;
    let value: string = "";
    while (this.pos < this.source.length) {
      const c: number = this.peek(0);
      if (c === quote) {
        this.pos += 1;
        this.tokens.push({ kind: "string", value: value, pos: start, end: this.pos });
        return;
      }
      if (c === CHAR_LF || c === CHAR_CR) {
        throw this.error(start, "unterminated string literal");
      }
      if (c === CHAR_BACKSLASH) {
        this.pos += 1;
        if (this.pos >= this.source.length) {
          throw this.error(start, "unterminated string escape");
        }
        const esc: number = this.peek(0);
        this.pos += 1;
        if (esc === CHAR_N_LO) {
          value = value + "\n";
        } else if (esc === CHAR_T_LO) {
          value = value + "\t";
        } else if (esc === CHAR_R_LO) {
          value = value + "\r";
        } else if (esc === CHAR_0) {
          value = value + "\0";
        } else if (esc === CHAR_BACKSLASH) {
          value = value + "\\";
        } else if (esc === CHAR_DQUOTE) {
          value = value + "\"";
        } else if (esc === CHAR_SQUOTE) {
          value = value + "'";
        } else if (esc === CHAR_BACKTICK) {
          value = value + "`";
        } else if (esc === CHAR_X_LO) {
          if (this.pos + 2 > this.source.length) {
            throw this.error(start, "invalid \\xNN escape");
          }
          const h1: number = this.peek(0);
          const h2: number = this.peek(1);
          if (!isHexDigit(h1) || !isHexDigit(h2)) {
            throw this.error(start, "invalid \\xNN escape");
          }
          this.pos += 2;
          const hi: number = hexValue(h1);
          const lo: number = hexValue(h2);
          const byte: number = hi * 16 + lo;
          if (byte > 127) {
            throw this.error(start, "non-ASCII byte in string literal");
          }
          value = value + String.fromCharCode(byte);
        } else {
          throw this.error(start, "unknown string escape");
        }
        continue;
      }
      if (c > 127) {
        throw this.error(start, "non-ASCII byte in string literal");
      }
      value = value + String.fromCharCode(c);
      this.pos += 1;
    }
    throw this.error(start, "unterminated string literal");
  }

  scanPunct(): void {
    const start: number = this.pos;
    const c0: number = this.peek(0);
    const c1: number = this.peek(1);
    const c2: number = this.peek(2);

    if (c0 === CHAR_EQ && c1 === CHAR_EQ && c2 === CHAR_EQ) {
      this.emitPunct(start, 3, "===");
      return;
    }
    if (c0 === CHAR_BANG && c1 === CHAR_EQ && c2 === CHAR_EQ) {
      this.emitPunct(start, 3, "!==");
      return;
    }
    if (c0 === CHAR_DOT && c1 === CHAR_DOT && c2 === CHAR_DOT) {
      this.emitPunct(start, 3, "...");
      return;
    }
    if (c0 === CHAR_EQ && c1 === CHAR_GT) {
      this.emitPunct(start, 2, "=>");
      return;
    }
    if (c0 === CHAR_EQ && c1 === CHAR_EQ) {
      this.emitPunct(start, 2, "==");
      return;
    }
    if (c0 === CHAR_BANG && c1 === CHAR_EQ) {
      this.emitPunct(start, 2, "!=");
      return;
    }
    if (c0 === CHAR_LT && c1 === CHAR_EQ) {
      this.emitPunct(start, 2, "<=");
      return;
    }
    if (c0 === CHAR_GT && c1 === CHAR_EQ) {
      this.emitPunct(start, 2, ">=");
      return;
    }
    if (c0 === CHAR_AMP && c1 === CHAR_AMP) {
      this.emitPunct(start, 2, "&&");
      return;
    }
    if (c0 === CHAR_PIPE && c1 === CHAR_PIPE) {
      this.emitPunct(start, 2, "||");
      return;
    }
    if (c0 === CHAR_QMARK && c1 === CHAR_QMARK) {
      this.emitPunct(start, 2, "??");
      return;
    }
    if (c0 === CHAR_QMARK && c1 === CHAR_DOT) {
      this.emitPunct(start, 2, "?.");
      return;
    }
    if (c0 === CHAR_PLUS && c1 === CHAR_PLUS) {
      this.emitPunct(start, 2, "++");
      return;
    }
    if (c0 === CHAR_MINUS && c1 === CHAR_MINUS) {
      this.emitPunct(start, 2, "--");
      return;
    }
    if (c0 === CHAR_PLUS && c1 === CHAR_EQ) {
      this.emitPunct(start, 2, "+=");
      return;
    }
    if (c0 === CHAR_MINUS && c1 === CHAR_EQ) {
      this.emitPunct(start, 2, "-=");
      return;
    }
    if (c0 === CHAR_STAR && c1 === CHAR_EQ) {
      this.emitPunct(start, 2, "*=");
      return;
    }
    if (c0 === CHAR_SLASH && c1 === CHAR_EQ) {
      this.emitPunct(start, 2, "/=");
      return;
    }
    if (c0 === CHAR_PERCENT && c1 === CHAR_EQ) {
      this.emitPunct(start, 2, "%=");
      return;
    }

    if (c0 === CHAR_LPAREN) { this.emitPunct(start, 1, "("); return; }
    if (c0 === CHAR_RPAREN) { this.emitPunct(start, 1, ")"); return; }
    if (c0 === CHAR_LBRACE) {
      this.braceDepth += 1;
      this.emitPunct(start, 1, "{");
      return;
    }
    if (c0 === CHAR_RBRACE) {
      this.braceDepth -= 1;
      if (this.templateStack.length > 0) {
        const top: number = this.templateStack[this.templateStack.length - 1];
        if (top === this.braceDepth) {
          this.templateStack.pop();
          this.pos = start + 1;
          this.scanTemplateContinuation(start);
          return;
        }
      }
      this.emitPunct(start, 1, "}");
      return;
    }
    if (c0 === CHAR_LBRACKET) { this.emitPunct(start, 1, "["); return; }
    if (c0 === CHAR_RBRACKET) { this.emitPunct(start, 1, "]"); return; }
    if (c0 === CHAR_COMMA) { this.emitPunct(start, 1, ","); return; }
    if (c0 === CHAR_SEMI) { this.emitPunct(start, 1, ";"); return; }
    if (c0 === CHAR_COLON) { this.emitPunct(start, 1, ":"); return; }
    if (c0 === CHAR_DOT) { this.emitPunct(start, 1, "."); return; }
    if (c0 === CHAR_QMARK) { this.emitPunct(start, 1, "?"); return; }
    if (c0 === CHAR_PLUS) { this.emitPunct(start, 1, "+"); return; }
    if (c0 === CHAR_MINUS) { this.emitPunct(start, 1, "-"); return; }
    if (c0 === CHAR_STAR) { this.emitPunct(start, 1, "*"); return; }
    if (c0 === CHAR_SLASH) { this.emitPunct(start, 1, "/"); return; }
    if (c0 === CHAR_PERCENT) { this.emitPunct(start, 1, "%"); return; }
    if (c0 === CHAR_EQ) { this.emitPunct(start, 1, "="); return; }
    if (c0 === CHAR_LT) { this.emitPunct(start, 1, "<"); return; }
    if (c0 === CHAR_GT) { this.emitPunct(start, 1, ">"); return; }
    if (c0 === CHAR_BANG) { this.emitPunct(start, 1, "!"); return; }
    if (c0 === CHAR_AMP) { this.emitPunct(start, 1, "&"); return; }
    if (c0 === CHAR_PIPE) { this.emitPunct(start, 1, "|"); return; }
    if (c0 === CHAR_CARET) { this.emitPunct(start, 1, "^"); return; }
    if (c0 === CHAR_TILDE) { this.emitPunct(start, 1, "~"); return; }

    throw this.error(this.pos, "unexpected character");
  }

  emitPunct(start: number, len: number, op: string): void {
    this.pos = start + len;
    this.tokens.push({ kind: "punct", op: op, pos: start, end: this.pos });
  }

  scanTemplateOpening(): void {
    const start: number = this.pos;
    this.pos += 1;
    this.scanTemplateBody(start, true);
  }

  scanTemplateContinuation(start: number): void {
    this.scanTemplateBody(start, false);
  }

  scanTemplateBody(start: number, isFirst: boolean): void {
    let value: string = "";
    while (this.pos < this.source.length) {
      const c: number = this.peek(0);
      if (c === CHAR_BACKTICK) {
        this.pos += 1;
        if (isFirst) {
          this.tokens.push({ kind: "template_full", value: value, pos: start, end: this.pos });
        } else {
          this.tokens.push({ kind: "template_tail", value: value, pos: start, end: this.pos });
        }
        return;
      }
      if (c === CHAR_DOLLAR && this.peek(1) === CHAR_LBRACE) {
        this.pos += 2;
        if (isFirst) {
          this.tokens.push({ kind: "template_head", value: value, pos: start, end: this.pos });
        } else {
          this.tokens.push({ kind: "template_middle", value: value, pos: start, end: this.pos });
        }
        this.templateStack.push(this.braceDepth);
        this.braceDepth += 1;
        return;
      }
      if (c === CHAR_BACKSLASH) {
        this.pos += 1;
        if (this.pos >= this.source.length) {
          throw this.error(start, "unterminated template escape");
        }
        const esc: number = this.peek(0);
        this.pos += 1;
        if (esc === CHAR_N_LO) {
          value = value + "\n";
        } else if (esc === CHAR_T_LO) {
          value = value + "\t";
        } else if (esc === CHAR_R_LO) {
          value = value + "\r";
        } else if (esc === CHAR_0) {
          value = value + "\0";
        } else if (esc === CHAR_BACKSLASH) {
          value = value + "\\";
        } else if (esc === CHAR_BACKTICK) {
          value = value + "`";
        } else if (esc === CHAR_DOLLAR) {
          value = value + "$";
        } else if (esc === CHAR_DQUOTE) {
          value = value + "\"";
        } else if (esc === CHAR_SQUOTE) {
          value = value + "'";
        } else if (esc === CHAR_X_LO) {
          if (this.pos + 2 > this.source.length) {
            throw this.error(start, "invalid \\xNN escape");
          }
          const h1: number = this.peek(0);
          const h2: number = this.peek(1);
          if (!isHexDigit(h1) || !isHexDigit(h2)) {
            throw this.error(start, "invalid \\xNN escape");
          }
          this.pos += 2;
          const hi: number = hexValue(h1);
          const lo: number = hexValue(h2);
          const byte: number = hi * 16 + lo;
          if (byte > 127) {
            throw this.error(start, "non-ASCII byte in template literal");
          }
          value = value + String.fromCharCode(byte);
        } else {
          throw this.error(start, "unknown template escape");
        }
        continue;
      }
      if (c > 127) {
        throw this.error(start, "non-ASCII byte in template literal");
      }
      value = value + String.fromCharCode(c);
      this.pos += 1;
    }
    throw this.error(start, "unterminated template literal");
  }
}

function hexValue(c: number): number {
  if (c >= CHAR_0 && c <= CHAR_9) return c - CHAR_0;
  if (c >= CHAR_A_LO && c <= CHAR_F_LO) return c - CHAR_A_LO + 10;
  return c - CHAR_A_UP + 10;
}

export function tokenize(source: string, file: string): Array<Token> {
  const lex: Lexer = new Lexer(source, file);
  return lex.tokenize();
}

// Phase 1.5-6e-4: byte offsets of each line start (0-based), mirroring
// ts.SourceFile.getLineStarts(): index 0 is always 0, and every byte after a
// LF (0x0a) begins a new line. The topaz parser stamps the result onto the
// SourceModule so codegen's posToLineCol can render diagnostics self-hosted.
export function computeLineStarts(source: string): Array<number> {
  const starts: Array<number> = [0];
  let i: number = 0;
  while (i < source.length) {
    if (source.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
    i = i + 1;
  }
  return starts;
}

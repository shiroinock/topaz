// Phase 1.5-6 prep: initializer narrowing. `const x: U = init` where U is a
// discriminated union and the initializer's static type is a concrete variant
// keeps the narrowed variant for subsequent reads (tsc narrows the declared
// type at the assignment point via control-flow analysis). This unblocks the
// self-hosted parser's `const name: Token = this.expectIdent()` pattern, where
// the helper returns a concrete variant but the binding is annotated with the
// union. Reads of variant-specific fields (`.text` below) work without an
// intervening `switch (x.kind)`.

type IdentTok = { kind: "ident"; text: string; pos: number };
type NumTok = { kind: "number"; value: number; pos: number };
type Token = IdentTok | NumTok;

function makeIdent(text: string, pos: number): IdentTok {
  return { kind: "ident", text: text, pos: pos };
}

function makeNum(value: number, pos: number): NumTok {
  return { kind: "number", value: value, pos: pos };
}

// const annotated with the union, initialized from a concrete-variant helper:
// the variant-specific field `.text` is readable with no narrowing.
const id: Token = makeIdent("foo", 3);
console.log(`${id.text}@${id.pos}`);

const n: Token = makeNum(42, 7);
console.log(`${n.value}@${n.pos}`);

// The binding still carries the union's declared type, so it coerces back into
// a union-expecting position with no cast on the user's part.
function describe(t: Token): string {
  switch (t.kind) {
    case "ident":
      return `ident ${t.text}`;
    case "number":
      return `num ${t.value}`;
  }
  return "?";
}
console.log(describe(id));
console.log(describe(n));

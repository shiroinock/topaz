// Phase 1.5-6 prep: initializer narrowing is restricted to `const`. A `let`
// binding can be reassigned to a different variant, and there is no
// narrowing-invalidation hook on plain assignment yet, so the conservative
// rule keeps `let x: U = variant` at the union's declared type — reading a
// variant-specific field still requires `switch (x.kind)`.

type IdentTok = { kind: "ident"; text: string; pos: number };
type NumTok = { kind: "number"; value: number; pos: number };
type Token = IdentTok | NumTok;

function makeIdent(text: string, pos: number): IdentTok {
  return { kind: "ident", text: text, pos: pos };
}

let id: Token = makeIdent("foo", 3);
// `.text` is variant-specific; with no narrowing this is rejected.
console.log(id.text);

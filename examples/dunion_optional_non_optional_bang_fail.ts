// Phase 1.5-6 prep #15: `!` (non-null assertion) on plain dunion (not
// `dunion | undefined`) is reject — operand is already non-undefined so the
// assertion is a no-op, which the prep #15 / #3 (!/??) policy forbids.
class Ident {
  kind: "ident";
  text: string;
  constructor(t: string) {
    this.kind = "ident";
    this.text = t;
  }
}

class NumLit {
  kind: "num";
  n: number;
  constructor(n: number) {
    this.kind = "num";
    this.n = n;
  }
}

type Tok = Ident | NumLit;

const cur: Tok = new Ident("x");
const forced: Tok = cur!;
console.log(forced.kind);

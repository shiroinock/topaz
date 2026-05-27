// Phase 1.5-6 prep #15: `??` on plain dunion (not `dunion | undefined`) is
// reject — LHS is already non-undefined so fallback never fires, same no-op
// policy as `!`.
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
const fallback: Tok = new NumLit(0);
const got: Tok = cur ?? fallback;
console.log(got.kind);

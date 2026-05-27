// Phase 1.5-6 prep #15: dunion | undefined を narrow 無しで member 参照すると
// `Tok | undefined` 型のまま `.kind` 読み出しは reject(switch / if narrowing
// が要件)。
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

const cur: Tok | undefined = new Ident("x");
console.log(cur.kind);

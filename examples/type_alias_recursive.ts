// Phase 1.5-6 prep #14: recursive / mutually-recursive type alias。
// AST 系の自己参照 / 相互参照 patterns を解禁する一方で、非循環 alias の
// structural dedupe (Pair / Pair2 → 同 C struct) は維持する。
// SCC 計算 + 再帰 alias 内部の TypeLiteralNode 事前 anon class 割当 +
// 2-phase field-fill (discriminator → full) で循環を割る。

// (1) self-recursive via TypeLiteral (linked list)。
type ListNode = {
  v: number;
  next: ListNode | undefined;
};

const tail: ListNode = { v: 3, next: undefined };
const mid: ListNode = { v: 2, next: tail };
const head: ListNode = { v: 1, next: mid };

function sumList(n: ListNode): number {
  let total: number = 0;
  total = total + n.v;
  const nx: ListNode | undefined = n.next;
  if (nx !== undefined) {
    total = total + sumList(nx);
  }
  return total;
}
console.log(sumList(head));        // 6
console.log(head.v);                // 1
console.log(head.next!.v);          // 2
console.log(head.next!.next!.v);    // 3

// (2) self-recursive dunion (AST 風 Expr)。body は UnionType に
// 2 つの TypeLiteral、どちらも Expr を field 型に持つ。
type Expr =
  | { kind: "lit"; v: number; }
  | { kind: "neg"; inner: Expr; };

function evalExpr(e: Expr): number {
  switch (e.kind) {
    case "lit":
      return e.v;
    case "neg":
      return -evalExpr(e.inner);
  }
  return 0;
}

const e1: Expr = { kind: "lit", v: 42 };
const e2: Expr = { kind: "neg", inner: e1 };
const e3: Expr = { kind: "neg", inner: e2 };
console.log(evalExpr(e1));    // 42
console.log(evalExpr(e2));    // -42
console.log(evalExpr(e3));    // 42

// (3) mutually recursive aliases (src/ast.ts の TypeNode / TypeRef 形)。
// TypeNode の body は UnionType、TypeRef の body は TypeLiteralNode、
// TypeRef は Array<TypeNode> を field に持つので互いに参照する。
type TypeNode =
  | { kind: "scalar"; name: string; }
  | { kind: "ref"; ref: TypeRef; };
type TypeRef = {
  name: string;
  args: Array<TypeNode>;
};

function describe(t: TypeNode): string {
  switch (t.kind) {
    case "scalar":
      return t.name;
    case "ref":
      return t.ref.name;
  }
  return "?";
}

const sNum: TypeNode = { kind: "scalar", name: "number" };
const sStr: TypeNode = { kind: "scalar", name: "string" };
const r: TypeRef = { name: "Map", args: [sNum, sStr] };
const t: TypeNode = { kind: "ref", ref: r };
console.log(describe(sNum));         // number
console.log(describe(t));            // Map
console.log(r.args.length);          // 2
console.log(describe(r.args[0]));    // number
console.log(describe(r.args[1]));    // string

// (4) 非循環 alias の structural dedupe は維持される。Pair / Pair2 は
// 同じ anon class に折り畳まれる (canonical key 共有)。
type Pair = { a: number; b: number; };
type Pair2 = { a: number; b: number; };
function mkPair(a: number, b: number): Pair {
  return { a: a, b: b };
}
const p: Pair = mkPair(10, 20);
const p2: Pair2 = mkPair(30, 40);
console.log(p.a + p.b);    // 30
console.log(p2.a + p2.b);  // 70

// (5) Array element 経由の self-recursive (Tree)。
// body は TypeLiteralNode、field の片方が Array<Tree>。
type Tree = {
  v: number;
  kids: Array<Tree>;
};

function sumTree(t: Tree): number {
  let total: number = t.v;
  for (const k of t.kids) {
    total = total + sumTree(k);
  }
  return total;
}

const leafA: Tree = { v: 1, kids: [] };
const leafB: Tree = { v: 2, kids: [] };
const leafC: Tree = { v: 3, kids: [] };
const branch: Tree = { v: 10, kids: [leafA, leafB, leafC] };
console.log(sumTree(leafA));   // 1
console.log(sumTree(branch));  // 16

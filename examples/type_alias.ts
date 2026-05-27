// Phase 1.5-6 prep: type alias (`type X = T;`)。RHS は既存サポート型のみ
// (scalar / Array / Map / Set / Iterator / fn / union / dunion / class /
// interface / T | undefined)。typeFromAnnotation の TypeReferenceNode
// branch で名前解決時に substitution、生成 C には alias 名は出ない。object
// literal RHS は次サブステップで導入予定。src/codegen.ts の Emitter で
// type alias 13 箇所を使うが、object literal 化との順序を分けて先に plumbing
// だけ着地させる。

// (1) primitive alias。alias を変数注釈・関数 param・return type に使う。
type Count = number;
type Label = string;
type Flag = boolean;

function bump(c: Count): Count {
  return c + 1;
}

const n: Count = 7;
const s: Label = "ok";
const b: Flag = true;
console.log(bump(n));   // 8
console.log(s);          // ok
console.log(b);          // true

// (2) alias chain (alias of alias)。
type Id = Count;
const id: Id = 100;
console.log(id);  // 100

// (3) container alias (Array<T> / Map<K, V> / Set<T>)。
type Bag = Array<Count>;
type Lookup = Map<string, number>;
type Marks = Set<number>;

const bag: Bag = [];
bag.push(1);
bag.push(2);
bag.push(3);
console.log(bag.length);  // 3

const lk: Lookup = new Map<string, number>();
lk.set("x", 10);
lk.set("y", 20);
console.log(lk.size);  // 2

const ms: Marks = new Set<number>();
ms.add(1);
ms.add(2);
ms.add(1);
console.log(ms.size);  // 2

// (4) nested alias 中に alias。
type CountList = Array<Count>;
const cl: CountList = [10, 20, 30];
console.log(cl.length);  // 3
console.log(cl[1]);       // 20

// (5) class alias。alias を field 型 / param 型 / return 型 / variable 注釈に使う。
class Point {
  x: number = 0;
  y: number = 0;
}

type Coord = Point;

function origin(): Coord {
  return new Point();
}

const c: Coord = origin();
console.log(c.x);  // 0
console.log(c.y);  // 0

// (6) interface alias。implements clause は interface 名直参照のまま、alias
// 経路は注釈位置でだけ機能する。
interface Shape {
  area(): number;
}

class Square implements Shape {
  side: number = 0;
  constructor(s: number) {
    this.side = s;
  }
  area(): number {
    return this.side * this.side;
  }
}

type Drawable = Shape;

function totalArea(xs: Array<Drawable>): number {
  let sum: number = 0;
  for (const x of xs) {
    sum = sum + x.area();
  }
  return sum;
}

const sq: Drawable = new Square(3);
const sq2: Drawable = new Square(4);
const shapes: Array<Drawable> = [];
shapes.push(sq);
shapes.push(sq2);
console.log(totalArea(shapes));  // 25

// (7) Array<class via alias>。container monomorph 名は元の class に折り畳まれる
// ので alias でも同じ struct が出る。
type Points = Array<Point>;
const pts: Points = [];
pts.push(new Point());
pts.push(new Point());
console.log(pts.length);  // 2

// (8) fn type alias。
type Mapper = (n: number) => number;

const twice: Mapper = (n) => n * 2;
console.log(twice(21));  // 42

function apply(f: Mapper, x: number): number {
  return f(x);
}
console.log(apply(twice, 5));  // 10

// (9) discriminated union alias。
class Circle {
  kind: "circle" = "circle";
  r: number = 0;
  constructor(r: number) {
    this.r = r;
  }
}
class Rect {
  kind: "rect" = "rect";
  w: number = 0;
  h: number = 0;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
  }
}

type Geom = Circle | Rect;

function describe(g: Geom): number {
  switch (g.kind) {
    case "circle":
      return g.r;
    case "rect":
      return g.w * g.h;
  }
  return -1;
}

const g1: Geom = new Circle(7);
const g2: Geom = new Rect(3, 4);
console.log(describe(g1));  // 7
console.log(describe(g2));  // 12

// (10) `T | undefined` alias。narrowing で取り出す。
type MaybeNumber = number | undefined;

function pick(x: MaybeNumber): number {
  if (x === undefined) return -1;
  return x;
}
console.log(pick(42));         // 42
const u: MaybeNumber = undefined;
console.log(pick(u));          // -1

// (11) forward reference between aliases。declaration 順は B → A だが
// 解決は lazy なので OK。
type WrappedSize = SizeBytes;
type SizeBytes = number;
const ws: WrappedSize = 1024;
console.log(ws);  // 1024

// (12) alias inside generic class type argument。
class Box<T> {
  value: T;
  constructor(v: T) {
    this.value = v;
  }
}
type CountBox = Box<Count>;
const cb: CountBox = new Box<number>(99);
console.log(cb.value);  // 99

// (13) Iterator<T> alias。
type CountIter = Iterator<Count>;
const itMap = new Map<string, number>();
itMap.set("a", 1);
itMap.set("b", 2);
itMap.set("c", 3);
const it: CountIter = itMap.values();
let total: number = 0;
for (const v of it) {
  total = total + v;
}
console.log(total);  // 6

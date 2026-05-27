// Phase 1.5-6 prep: field initializer (`x: T = init;`)。class body 内で field
// 宣言と同時に初期化値を書くと、constructor body の冒頭(`__topaz_class_tag`
// 代入の直後・user statement の前)に declaration 順で `this.x = init;` が注入
// される。全 field が initializer 持ちで explicit ctor が無い class は zero-arg
// constructor が自動生成される。src/codegen.ts の Emitter クラス(field 35+ 個、
// 全 default 初期化、ctor 無し)を通すためのパス。

// (1) scalar literal init + bare 0-arg auto-ctor。
class Defaults {
  count: number = 0;
  active: boolean = true;
  label: string = "default";
}

const d = new Defaults();
console.log(d.count);   // 0
console.log(d.active);  // true
console.log(d.label);   // default

// (2) container init (Array / Map / Set)、reference 共有を確認するため二つ
// インスタンスを作る。
class Bag {
  items: Array<number> = [];
  cache: Map<string, number> = new Map<string, number>();
  seen: Set<number> = new Set<number>();
}

const b1 = new Bag();
const b2 = new Bag();
b1.items.push(7);
b1.items.push(8);
b1.cache.set("a", 1);
b1.cache.set("b", 2);
b1.seen.add(42);
b1.seen.add(99);
console.log(b1.items.length);   // 2
console.log(b1.cache.size);     // 2
console.log(b1.seen.size);      // 2
console.log(b2.items.length);   // 0 (instance ごとに独立)
console.log(b2.cache.size);     // 0
console.log(b2.seen.size);      // 0

// (3) explicit ctor との併用。field init が走った後 ctor body が走る。
class Configurable {
  name: string = "(unset)";
  multiplier: number = 1;
  total: number;
  constructor(seed: number) {
    // 注入順: name / multiplier / total = NaN(後で代入)→ ctor body 開始。
    this.total = this.multiplier * seed;
  }
}

const cfg = new Configurable(10);
console.log(cfg.name);        // (unset)
console.log(cfg.multiplier);  // 1
console.log(cfg.total);       // 10

// (4) explicit ctor が field init を上書き。
class Overridable {
  greeting: string = "hello";
  constructor(g: string) {
    this.greeting = g;
  }
}

const o = new Overridable("hi!");
console.log(o.greeting);      // hi!

// (5) mixed: 一部 field は initializer、一部は ctor body で代入。
class Mixed {
  base: number = 100;
  name: string;
  constructor(n: string) {
    this.name = n;
  }
  show(): number {
    return this.base;
  }
}

const m = new Mixed("alpha");
console.log(m.base);          // 100
console.log(m.name);          // alpha
console.log(m.show());        // 100

// (6) declaration 順より後の field を init 内で参照すると calloc 初期値
//     (number=0 / boolean=false / string=empty)が見える — JS field init
//     semantics と同一の divergence なし挙動。
class ForwardRef {
  derived: number = 0;
  base: number = 5;
}

const fr = new ForwardRef();
console.log(fr.derived);      // 0 (base がまだ未初期化なので参照しても 0)
console.log(fr.base);         // 5

// (7) class field with reference type init(class instance を持つ field)。
class Inner {
  v: number;
  constructor(x: number) {
    this.v = x;
  }
}

class Outer {
  inner: Inner = new Inner(7);
}

const out = new Outer();
console.log(out.inner.v);     // 7

// (8) interface field init with class→iface coercion at the init site。
interface Shape {
  area(): number;
}

class Square implements Shape {
  side: number;
  constructor(s: number) {
    this.side = s;
  }
  area(): number {
    return this.side * this.side;
  }
}

class Container {
  shape: Shape = new Square(4);
}

const c = new Container();
console.log(c.shape.area());  // 16

// (9) Array<class> field init。
class Pool {
  items: Array<Inner> = [];
}

const p = new Pool();
p.items.push(new Inner(11));
p.items.push(new Inner(22));
console.log(p.items.length);  // 2
console.log(p.items[0].v);    // 11
console.log(p.items[1].v);    // 22

// (10) 同 field を ctor body で上書き(redeclaration ではなく再代入)。
class TwoStage {
  x: number = 1;
  constructor() {
    this.x = this.x + 100;  // field init 後の値 1 を読んで +100
  }
}

const ts = new TwoStage();
console.log(ts.x);            // 101

// (11) constructor 引数を field init では参照できないが、ctor body で代入可。
//      ここでは field init は固定値、ctor body が引数で上書きする組み合わせ。
class WithArgInit {
  prefix: string = "DEFAULT:";
  message: string = "";
  constructor(msg: string) {
    this.message = this.prefix + msg;
  }
}

const wa = new WithArgInit("ok");
console.log(wa.message);      // DEFAULT:ok

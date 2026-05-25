// Phase 1.5-6 prep: access modifier (public / private / protected / readonly)
// は no-op として受理。C 出力に可視性概念は無く、readonly も runtime 強制
// しない。src/codegen.ts での self-hosting で `private` が 137 箇所使われて
// いるので、これが通らないと src/ がそもそも食えない。

class Counter {
  private value: number;
  public step: number;
  constructor(start: number, step: number) {
    this.value = start;
    this.step = step;
  }
  public tick(): number {
    this.value = this.value + this.step;
    return this.value;
  }
  private reset(to: number): number {
    this.value = to;
    return this.value;
  }
  public forceReset(to: number): number {
    return this.reset(to);
  }
}

class Pair {
  readonly first: number;
  readonly second: number;
  constructor(a: number, b: number) {
    this.first = a;
    this.second = b;
  }
  sum(): number {
    return this.first + this.second;
  }
}

class Mixed {
  protected base: number;
  public readonly label: string;
  private count: number;
  constructor(b: number, l: string) {
    this.base = b;
    this.label = l;
    this.count = 0;
  }
  bump(): number {
    this.count = this.count + 1;
    return this.base + this.count;
  }
}

interface Box {
  readonly tag: string;
  size: number;
}

class SmallBox implements Box {
  tag: string;
  size: number;
  constructor(t: string, s: number) {
    this.tag = t;
    this.size = s;
  }
}

const c = new Counter(10, 3);
console.log(c.tick());            // 13
console.log(c.tick());            // 16
console.log(c.step);              // 3
console.log(c.forceReset(100));   // 100
console.log(c.tick());            // 103

const p = new Pair(7, 8);
console.log(p.first);             // 7
console.log(p.second);            // 8
console.log(p.sum());             // 15

const m = new Mixed(100, "alpha");
console.log(m.label);             // alpha
console.log(m.bump());            // 101
console.log(m.bump());            // 102

const b: Box = new SmallBox("toy", 42);
console.log(b.tag);               // toy
console.log(b.size);              // 42

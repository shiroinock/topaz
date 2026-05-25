// Phase 1.5-6 prep: void return type acceptance. Function / method return
// type `void` accepts bare `return;` and "fall off end" semantics. Call site
// is only valid in expression-statement position.

function shout(s: string): void {
  console.log(s);
  console.log(s);
}

function maybeShout(s: string, on: boolean): void {
  if (!on) return;
  console.log(s);
}

class Counter {
  count: number;
  constructor() {
    this.count = 0;
  }
  bump(): void {
    this.count = this.count + 1;
  }
  bumpBy(n: number): void {
    this.count = this.count + n;
  }
  reset(): void {
    if (this.count === 0) return;
    this.count = 0;
  }
}

interface Logger {
  log(msg: string): void;
}

class StdoutLogger implements Logger {
  prefix: string;
  constructor(p: string) {
    this.prefix = p;
  }
  log(msg: string): void {
    console.log(this.prefix + msg);
  }
}

function broadcast(l: Logger, m: string): void {
  l.log(m);
}

shout("hello");          // hello / hello
maybeShout("on", true);  // on
maybeShout("off", false);// (silent)

const c = new Counter();
c.bump();
c.bump();
c.bumpBy(5);
console.log(c.count);    // 7
c.reset();
console.log(c.count);    // 0
c.reset();               // bare return path
console.log(c.count);    // 0

const l: Logger = new StdoutLogger("[log] ");
broadcast(l, "via iface"); // [log] via iface

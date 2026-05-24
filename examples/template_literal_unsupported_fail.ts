// Phase 1.5-3.5: substitutions other than number / boolean / string have no
// defined toString policy yet. Embedding a class instance must be rejected at
// codegen time with a clear message.

class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

let p: Point = new Point(1, 2);
console.log(`point=${p}`);

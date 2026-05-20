// Phase 1.5-3b: `T | undefined` の宣言・代入・comparison のみ。
// narrowing (`if (x !== undefined) { x.field }`) は 1.5-3d で入る。
class Box {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
}

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

function present(b: Box | undefined): boolean {
  return b !== undefined;
}

let b1: Box | undefined = new Box(42);
let b2: Box | undefined = undefined;
console.log(b1 === undefined);
console.log(b1 !== undefined);
console.log(b2 === undefined);
console.log(present(b1));
console.log(present(b2));

b2 = new Box(7);
console.log(b2 === undefined);

let b3: Box | undefined = b1;
console.log(b3 !== undefined);

b3 = undefined;
console.log(b3 === undefined);

let s1: Shape | undefined = new Square(5);
let s2: Shape | undefined = undefined;
console.log(s1 !== undefined);
console.log(s2 === undefined);

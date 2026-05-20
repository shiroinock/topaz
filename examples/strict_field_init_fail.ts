// Phase 1.5-3a の負例: constructor で field 'y' を代入し忘れている。
// codegen は「field 'Bad.y' is not definitely assigned in the constructor」で落ちる。
class Bad {
  x: number;
  y: number;
  constructor(a: number) {
    this.x = a;
  }
}

const b = new Bad(1);
console.log(b.x);

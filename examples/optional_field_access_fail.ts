// Phase 1.5-3b の負例: `T | undefined` から narrowing なしで field 参照しようとする。
// codegen は「cannot access '.v' on union type ...」で落ちる。
// narrowing (`if (b !== undefined) { b.v }`) は 1.5-3d で対応予定。
class Box {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
}

let b: Box | undefined = new Box(1);
console.log(b.v);

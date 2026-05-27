// Phase 1.5-6 prep #25: contextual な expected 型が無い ternary は両 branch の
// 共通型を要求する。互いに代入不能な 2 つの class branch は合成 union を作らず
// reject(target を注釈して 1 つに寄せろ、という案内)。
class A {
  a: number;
  constructor() {
    this.a = 1;
  }
}
class B {
  b: number;
  constructor() {
    this.b = 2;
  }
}
let cond: boolean = true;
let x = cond ? new A() : new B();
console.log(x.a);

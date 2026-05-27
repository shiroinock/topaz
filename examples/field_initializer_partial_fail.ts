// Phase 1.5-6 prep: field の一部だけ initializer を持ち、explicit ctor が
// 無い場合は auto-ctor が生成されないので未初期化 field を案内するエラーを
// 出す必要がある。

class Half {
  a: number = 0;
  b: number;
}

const h = new Half();
console.log(h.a);

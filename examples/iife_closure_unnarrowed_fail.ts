// Phase 1.5-6 prep: closure 越えの narrowing 伝播は「構築時点で実際に有効な
// narrowing」だけを運ぶ。narrowing の無い dunion を IIFE が capture して field
// 参照したら、従来どおり拒否される(fix が全 dunion capture を素通しにしない
// ことの担保)。

type Body =
  | { kind: "expr"; value: number }
  | { kind: "block"; items: Array<number> };

function bad(body: Body): number {
  // body はここでは narrow されていない full dunion。closure 内で field を
  // 読もうとすると narrow it first で reject されるべき。
  return (() => {
    return body.value;
  })();
}

const e: Body = { kind: "expr", value: 1 };
console.log(bad(e));

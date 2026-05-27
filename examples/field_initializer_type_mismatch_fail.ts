// Phase 1.5-6 prep: field initializer の型は annotation と一致が必須
// (emitWithExpected が string-literal widening / class→iface coercion を入れる
// が、number と string のような全くの不一致は通らない)。

class Bad {
  count: number = "zero";
}

const b = new Bad();
console.log(b.count);

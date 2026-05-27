// generic type alias は 1.5-6 prep の thin sugar 段階では未対応(対応するには
// type alias monomorphize テーブルが必要、object literal RHS とセットで再評価)。
type Pair<T> = Array<T>;

const p: Pair<number> = [];
p.push(1);
console.log(p.length);

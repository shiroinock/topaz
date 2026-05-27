// Method signature `m(): T` は interface 経路、anon class は plain
// PropertySignature のみ受理する(behavior 持ちの structural record は別 step)。
type WithMethod = { a: number; m(): number };
const x: WithMethod = { a: 1, m: () => 2 };
console.log(x.a);

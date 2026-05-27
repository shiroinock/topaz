// type alias は erased — 値位置で参照すると identifier 解決で落ちる。
type Count = number;

const x = Count;
console.log(x);

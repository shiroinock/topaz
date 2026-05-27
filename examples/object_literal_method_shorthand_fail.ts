// Method shorthand `{ f() {} }` は未対応(anon class に method を生やす方向は
// 現方針外、field = value のみ)。property shorthand `{ a }` は解禁したが、
// method shorthand / getter-setter / spread は引き続き reject。
type Box = { run: number };
const x: Box = { run() {} };
console.log(x.run);

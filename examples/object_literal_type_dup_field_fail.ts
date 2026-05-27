// Field 名重複は declaration 時に reject(TS は last-wins だが、Topaz は user
// の typo を取りこぼさず止める)。
type Bad = { a: number; b: string; a: boolean };
const x: Bad = { a: 1, b: "ok", a: true };
console.log(x.b);

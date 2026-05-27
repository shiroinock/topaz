// Inside the function body the optional param has type `T | undefined` and
// must be narrowed before use. Using it as plain `T` (here, passed to a
// function expecting `number`) is a type error.
function take(n: number): number {
  return n;
}
function caller(x?: number): number {
  return take(x);
}
console.log(caller(5));

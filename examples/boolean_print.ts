function isPositive(x: number): boolean {
  return x > 0;
}
function bothTrue(a: boolean, b: boolean): boolean {
  return a && b;
}
console.log(isPositive(3));
console.log(isPositive(-3));
console.log(bothTrue(true, isPositive(5)));
console.log(!isPositive(0));

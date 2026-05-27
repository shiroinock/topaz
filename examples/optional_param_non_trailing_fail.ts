// Optional parameter must be trailing: a required parameter cannot follow an
// optional one. Mirrors TS error "A required parameter cannot follow an
// optional parameter".
function bad(a?: number, b: number): number {
  return (a ?? 0) + b;
}
console.log(bad(1, 2));

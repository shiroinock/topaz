// Phase 1.5-3f: accessing fields/methods of an `unknown`-typed catch binding
// without first narrowing via `instanceof` is rejected at compile time.
class BoomError {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

try {
  throw new BoomError("oops");
} catch (e: unknown) {
  console.log(e.msg);
}

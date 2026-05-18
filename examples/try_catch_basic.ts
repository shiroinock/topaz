class MyErr {
  msg: string;
  code: number;
  constructor(msg: string, code: number) {
    this.msg = msg;
    this.code = code;
  }
}

class OtherErr {
  tag: number;
  constructor(t: number) {
    this.tag = t;
  }
}

function maybeThrow(n: number): number {
  if (n < 0) {
    throw new MyErr("negative", 42);
  }
  return n * 2;
}

// 1. catch a directly-thrown class instance
try {
  throw new MyErr("boom", 1);
} catch (e: MyErr) {
  console.log(e.msg);
  console.log(e.code);
}

// 2. propagate through a function call, catch in caller
try {
  const v = maybeThrow(-3);
  console.log(v);
} catch (e: MyErr) {
  console.log(e.msg);
  console.log(e.code);
}

// 3. happy path inside try
try {
  const v = maybeThrow(5);
  console.log(v);
} catch (e: MyErr) {
  console.log(e.msg);
}

// 4. nested try, inner catch handles
try {
  try {
    throw new OtherErr(7);
  } catch (inner: OtherErr) {
    console.log(inner.tag);
  }
  console.log(100);
} catch (outer: MyErr) {
  console.log(outer.msg);
}

// 5. nested try, outer catches when inner rethrows-ish (different class via
//    a new throw inside the inner catch)
try {
  try {
    throw new OtherErr(9);
  } catch (inner: OtherErr) {
    console.log(inner.tag);
    throw new MyErr("rewrapped", 2);
  }
} catch (outer: MyErr) {
  console.log(outer.msg);
  console.log(outer.code);
}

// 6. catch binding scoping: e doesn't leak past the catch block
const sentinel = 999;
try {
  throw new MyErr("scoped", 0);
} catch (e: MyErr) {
  console.log(e.code);
}
console.log(sentinel);

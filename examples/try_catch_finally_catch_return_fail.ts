class Err {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

function f(): number {
  try {
    throw new Err("boom");
  } catch (e: Err) {
    return 1;
  } finally {
    console.log("cleanup");
  }
  return 0;
}

console.log(f());

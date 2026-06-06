class Err {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

function f(): number {
  try {
    return 1;
  } catch (e: Err) {
    console.log(e.msg);
  } finally {
    console.log("cleanup");
  }
  return 0;
}

console.log(f());

class Err {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

try {
  throw new Err("boom");
} catch (e: Err) {
  console.log(e.msg);
} finally {
  console.log("cleanup");
}

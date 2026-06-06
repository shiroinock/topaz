class Err {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

while (true) {
  try {
    break;
  } catch (e: Err) {
    console.log(e.msg);
  } finally {
    console.log("cleanup");
  }
}

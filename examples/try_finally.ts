class Err {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

let state: string = "start";
try {
  console.log("try-normal");
  state = "normal";
} finally {
  console.log("finally-normal");
  console.log(state);
}

try {
  try {
    console.log("try-throw");
    throw new Err("boom");
  } finally {
    console.log("finally-throw");
  }
} catch (e: Err) {
  console.log(e.msg);
}

try {
  try {
    console.log("try-override");
    throw new Err("original");
  } finally {
    console.log("finally-override");
    throw new Err("cleanup");
  }
} catch (e: Err) {
  console.log(e.msg);
}

class Err {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

function throwLater(label: string): void {
  throw new Err(label);
}

let state: string = "start";
try {
  console.log("try-normal");
  state = "normal";
} catch (e: Err) {
  console.log(e.msg);
} finally {
  console.log("finally-normal");
  console.log(state);
}
console.log("after-normal");

try {
  console.log("try-caught");
  throw new Err("try boom");
} catch (e: Err) {
  console.log("catch-caught");
  console.log(e.msg);
} finally {
  console.log("finally-caught");
}
console.log("after-caught");

try {
  try {
    console.log("try-catch-throw");
    throw new Err("original");
  } catch (e: Err) {
    console.log(e.msg);
    throw new Err("catch throw");
  } finally {
    console.log("finally-catch-throw");
  }
} catch (e: Err) {
  console.log(e.msg);
}

try {
  try {
    console.log("try-callee-throw");
    throw new Err("outer");
  } catch (e: Err) {
    console.log(e.msg);
    throwLater("callee throw");
  } finally {
    console.log("finally-callee-throw");
  }
} catch (e: Err) {
  console.log(e.msg);
}

try {
  try {
    console.log("try-finally-override");
    throw new Err("handled");
  } catch (e: Err) {
    console.log(e.msg);
  } finally {
    console.log("finally-override");
    throw new Err("finally throw");
  }
} catch (e: Err) {
  console.log(e.msg);
}

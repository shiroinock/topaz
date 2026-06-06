class Err {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

function valueReturn(): number {
  try {
    console.log("try-value");
    return 5;
  } finally {
    console.log("finally-value");
  }
}

function voidReturn(): void {
  try {
    console.log("try-void");
    return;
  } finally {
    console.log("finally-void");
  }
}

function throwValue(): number {
  throw new Err("ret-boom");
}

function returnExpressionThrows(): number {
  try {
    return throwValue();
  } finally {
    console.log("finally-ret-throw");
  }
}

console.log(valueReturn());
voidReturn();

try {
  console.log(returnExpressionThrows());
} catch (e: Err) {
  console.log(e.msg);
}

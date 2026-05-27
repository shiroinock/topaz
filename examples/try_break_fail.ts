// Phase 1.5-X: `return` inside a try body is now lowered (pop before return),
// but `break` / `continue` that escape a try body are still rejected — they
// would exit the C block before topaz_try_pop runs and the safe "loop inside
// the try" case isn't distinguished. This must keep failing.
class Err {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

let i: number = 0;
while (i < 10) {
  try {
    if (i === 3) {
      break;
    }
    i = i + 1;
  } catch (e: Err) {
    i = i + 1;
  }
}
console.log(i);

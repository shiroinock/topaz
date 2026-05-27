// Phase 1.5-X: `return` inside a `try` body. The frame must be popped before
// the C `return`, otherwise topaz_try_top keeps pointing at a now-dead jmp_buf
// and a later throw longjmps into garbage. This is the self-hosting blocker
// from the backtracking parser pattern (`try { ...; return x; } catch { ... }`).
class Err {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

// return from the try body on the happy path (no throw): the pop runs before
// the C return.
function pick(n: number): number {
  try {
    if (n > 0) {
      return n * 2;
    }
    return -1;
  } catch (e: Err) {
    return 0;
  }
}

// mix of return-from-try (happy) and return-from-catch (after a throw is
// caught — the frame is already popped by topaz_throw at that point).
function safe(n: number): number {
  try {
    if (n < 0) {
      throw new Err("neg");
    }
    return n;
  } catch (e: Err) {
    return 99;
  }
}

// nested try: the return crosses BOTH the inner and the outer frame, so two
// pops are emitted.
function nested(n: number): number {
  try {
    try {
      return n + 100;
    } catch (inner: Err) {
      return -2;
    }
  } catch (outer: Err) {
    return -3;
  }
}

console.log(pick(5)); // 10  (return from try, no throw)
console.log(pick(-1)); // -1  (return from try, no throw)
console.log(safe(3)); // 3   (return from try)
console.log(safe(-5)); // 99  (throw caught, return from catch)
console.log(nested(7)); // 107 (return crosses two frames)

// Frame-balance check that would CRASH if the pop were skipped: pick(5) returns
// from its try body. If its frame leaked, topaz_try_top would point at pick's
// dead stack frame (pushed after this frame). The throw below would then
// longjmp into that dead frame instead of the catch here.
try {
  const x: number = pick(5);
  console.log(x); // 10
  throw new Err("boom");
} catch (e: Err) {
  console.log(e.msg); // boom
}

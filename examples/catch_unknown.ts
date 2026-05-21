// Phase 1.5-3f: catch binding can be `: unknown` or have no annotation
// (defaults to unknown). The user narrows via `if (e instanceof ClassName)`
// before reading fields/methods. `instanceof` is also legal on a value of
// the same class (tautological, but allowed for symmetry).
class BoomError {
  msg: string;
  constructor(m: string) {
    this.msg = m;
  }
}

class FizzError {
  code: number;
  constructor(c: number) {
    this.code = c;
  }
  describe(): string {
    return "fizz";
  }
}

function trigger(which: number): number {
  if (which === 0) {
    throw new BoomError("kaboom");
  }
  throw new FizzError(42);
}

// Catch as `unknown` and dispatch via instanceof.
try {
  trigger(0);
} catch (e: unknown) {
  if (e instanceof BoomError) {
    console.log(e.msg);
  } else if (e instanceof FizzError) {
    console.log(e.code);
  }
}

try {
  trigger(1);
} catch (e: unknown) {
  if (e instanceof BoomError) {
    console.log(e.msg);
  } else if (e instanceof FizzError) {
    console.log(e.code);
    console.log(e.describe());
  }
}

// No-annotation catch defaults to unknown.
try {
  throw new BoomError("rethrow");
} catch (e) {
  if (e instanceof BoomError) {
    console.log(e.msg);
  }
}

// `instanceof` on an explicitly-typed class also works.
const b: BoomError = new BoomError("typed");
console.log(b instanceof BoomError);

// Nested: outer unknown + inner re-throw with a different class.
try {
  try {
    throw new BoomError("inner");
  } catch (e: unknown) {
    if (e instanceof BoomError) {
      throw new FizzError(99);
    }
  }
} catch (outer) {
  if (outer instanceof FizzError) {
    console.log(outer.code);
  }
}

// Negative instanceof (no narrowing): still a valid boolean.
const x: BoomError = new BoomError("bare");
console.log(x instanceof FizzError);

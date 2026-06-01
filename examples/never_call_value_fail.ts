// Phase 1.5-6i prep: a `never`-annotated call has no value representation.

class Fatal {
  message: string;
  constructor(message: string) {
    this.message = message;
  }
}

function fail(message: string): never {
  throw new Fatal(message);
}

const x: number = fail("boom");
console.log(x);

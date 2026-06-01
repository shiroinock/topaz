// Phase 1.5-6i prep: `never` return annotations lower to the existing
// no-value return representation. Calls are valid as statements only.

class Fatal {
  message: string;
  constructor(message: string) {
    this.message = message;
  }
}

function fail(message: string): never {
  throw new Fatal(message);
}

if (false) {
  fail("unreachable");
}

console.log("alive");

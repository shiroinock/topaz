// Phase 3.15: direct statement calls to top-level `: never` helpers and
// process.exit carry `T | undefined` narrowing into following statements.

class Fatal {
  message: string;
  constructor(message: string) {
    this.message = message;
  }
}

class Box {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}

function fail(message: string): never {
  throw new Fatal(message);
}

function unwrapAfterFail(box: Box | undefined): number {
  if (box === undefined) {
    fail("missing");
  }
  return box.value;
}

function unwrapAfterElseFail(box: Box | undefined): number {
  if (box !== undefined) {
  } else {
    fail("missing");
  }
  return box.value;
}

function unwrapAfterProcessExit(box: Box | undefined): number {
  if (box === undefined) {
    process.exit(3);
  }
  return box.value;
}

console.log(unwrapAfterFail(new Box(7)));
console.log(unwrapAfterElseFail(new Box(11)));
console.log(unwrapAfterProcessExit(new Box(13)));

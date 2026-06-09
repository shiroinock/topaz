// Phase 3.15: normal void calls are not exits for carry narrowing.

class Box {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}

function logMissing(message: string): void {
  console.log(message);
}

function unwrapAfterVoidCall(box: Box | undefined): number {
  if (box === undefined) {
    logMissing("missing");
  }
  return box.value;
}

console.log(unwrapAfterVoidCall(new Box(5)));

class AsyncErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

function takesRejectedVoidPromise(p: Promise<void>): string {
  const q: Promise<void> = p;
  if (p === q) {
    return "void rejection";
  }
  return "missing void rejection";
}

function takesRejectedNumberPromise(p: Promise<number>): string {
  const q: Promise<number> = p;
  if (p === q) {
    return "number rejection";
  }
  return "missing number rejection";
}

function takesRejectedStringPromise(p: Promise<string>): string {
  const q: Promise<string> = p;
  if (p === q) {
    return "string rejection";
  }
  return "missing string rejection";
}

function makeStringRejection(): Promise<string> {
  return Promise.reject(new AsyncErr("string"));
}

const rejectedVoid: Promise<void> = Promise.reject(new AsyncErr("void"));
const rejectedNumber: Promise<number> = Promise.reject(new AsyncErr("number"));
const rejectedString = makeStringRejection();

console.log(takesRejectedVoidPromise(rejectedVoid));
console.log(takesRejectedNumberPromise(rejectedNumber));
console.log(takesRejectedStringPromise(rejectedString));
console.log("reject values");

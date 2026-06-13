function takesResolvedNumberPromise(p: Promise<number>): string {
  const q: Promise<number> = p;
  if (p === q) {
    return "number promise";
  }
  return "missing number promise";
}

function takesResolvedStringPromise(p: Promise<string>): string {
  const q: Promise<string> = p;
  if (p === q) {
    return "string promise";
  }
  return "missing string promise";
}

const annotatedNumber: Promise<number> = Promise.resolve(42);
const annotatedString: Promise<string> = Promise.resolve("ready");
const inferredNumber = Promise.resolve(7);
const inferredString = Promise.resolve("done");

console.log(takesResolvedNumberPromise(annotatedNumber));
console.log(takesResolvedStringPromise(annotatedString));
console.log(takesResolvedNumberPromise(inferredNumber));
console.log(takesResolvedStringPromise(inferredString));
console.log("resolve values");
console.log(42);

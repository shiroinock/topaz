type Flow = "break" | "continue";

function choose(flag: boolean): Flow {
  if (flag) return "break";
  return "continue";
}

function describe(flow: Flow): string {
  if (flow === "break") return "stop";
  if (flow !== "continue") return "unknown";
  return "skip";
}

function echo(flow: Flow): Flow {
  return flow;
}

const a: Flow = choose(true);
let b: Flow = "continue";
console.log(describe(a));
console.log(describe(b));
b = "break";
console.log(describe(echo(b)));

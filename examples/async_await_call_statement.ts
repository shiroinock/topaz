/// <reference lib="es2015.promise" />

function markNumber(label: string, value: number): number {
  console.log(label);
  return value;
}

function markString(label: string, value: string): string {
  console.log(label);
  return value;
}

function recordFour(label: string, a: number, b: number, c: number): void {
  console.log(label);
  console.log(a * 100 + b * 10 + c);
}

function recordFn(label: string, pre: number, value: number): void {
  console.log(label);
  console.log(pre * 10 + value);
}

const fnRecord: (label: string, pre: number, value: number) => void = recordFn;

async function declared(): Promise<void> {
  recordFour("declared call", markNumber("declared pre", 1), await Promise.resolve(2), markNumber("declared post", 3));
  return;
}

const arrow = async (): Promise<void> => {
  fnRecord("arrow call", markNumber("arrow pre", 4), await Promise.resolve(5));
  return;
};

class CallStatementTarget {
  constructor() {}

  run(label: string, pre: number, value: number, post: number): void {
    console.log(label);
    console.log(pre * 100 + value * 10 + post);
  }
}

function selectTarget(label: string, target: CallStatementTarget): CallStatementTarget {
  console.log(label);
  return target;
}

class CallStatementRunner {
  target: CallStatementTarget = new CallStatementTarget();

  async method(): Promise<void> {
    selectTarget("method recv", this.target).run("method call", markNumber("method pre", 7), await Promise.resolve(8), markNumber("method post", 9));
    return;
  }
}

interface CallStatementSink {
  push(label: string, value: number): void;
}

class CallStatementSinkImpl implements CallStatementSink {
  constructor() {}

  push(label: string, value: number): void {
    console.log(label);
    console.log(value);
  }
}

function selectSink(label: string, sink: CallStatementSink): CallStatementSink {
  console.log(label);
  return sink;
}

const expr: (sink: CallStatementSink) => Promise<void> = async function (sink: CallStatementSink): Promise<void> {
  selectSink("expr recv", sink).push("expr call", await Promise.resolve(6));
  return;
};

function selectMap(label: string, map: Map<string, number>): Map<string, number> {
  console.log(label);
  return map;
}

function selectSet(label: string, set: Set<string>): Set<string> {
  console.log(label);
  return set;
}

function selectString(label: string, value: string): string {
  console.log(label);
  return value;
}

const statementMap: Map<string, number> = new Map<string, number>();
const statementSet: Set<string> = new Set<string>();

async function mapKeyStatement(collection: Map<string, number>): Promise<void> {
  selectMap("map key recv", collection).set(await Promise.resolve("two"), markNumber("map key post", 20));
  return;
}

async function mapValueStatement(collection: Map<string, number>): Promise<void> {
  selectMap("map value recv", collection).set(markString("map value pre", "three"), await Promise.resolve(30));
  return;
}

async function setStatement(collection: Set<string>): Promise<void> {
  selectSet("set recv", collection).add(await Promise.resolve("blue"));
  return;
}

async function stringStatement(): Promise<void> {
  selectString("string recv", "abcdef").slice(markNumber("string pre", 1), await Promise.resolve(4));
  return;
}

declared().then((): void => {
  console.log("declared then");
});

arrow().then((): void => {
  console.log("arrow then");
});

new CallStatementRunner().method().then((): void => {
  console.log("method then");
});

expr(new CallStatementSinkImpl()).then((): void => {
  console.log("expr then");
});

mapKeyStatement(statementMap).then((): void => {
  console.log("map key then");
  const got: number | undefined = statementMap.get("two");
  if (got !== undefined) {
    console.log(got);
  }
});

mapValueStatement(statementMap).then((): void => {
  console.log("map value then");
  const got: number | undefined = statementMap.get("three");
  if (got !== undefined) {
    console.log(got);
  }
});

setStatement(statementSet).then((): void => {
  console.log("set then");
  console.log(statementSet.has("blue"));
});

stringStatement().then((): void => {
  console.log("string then");
});

console.log("sync tail");

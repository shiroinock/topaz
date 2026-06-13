/// <reference lib="es2015.promise" />

function selectNumbers(label: string, xs: Array<number>): Array<number> {
  console.log(label);
  return xs;
}

function selectStrings(label: string, xs: Array<string>): Array<string> {
  console.log(label);
  return xs;
}

const numbers: Array<number> = [1, 2, 3, 4];

async function declared(xs: Array<number>): Promise<boolean> {
  const ok: boolean = selectNumbers("declared recv", xs).includes(await Promise.resolve(2));
  console.log("declared after");
  console.log(ok);
  return ok;
}

const arrow = async (xs: Array<number>): Promise<number> => {
  const middle: Array<number> = selectNumbers("arrow recv", xs).slice(1, await Promise.resolve(3));
  console.log("arrow after");
  console.log(middle.length);
  console.log(middle[0]);
  console.log(middle[1]);
  return middle.length;
};

class ArrayAwaitRunner {
  words: Array<string> = ["red", "blue", "green"];

  async joined(): Promise<string> {
    const text: string = selectStrings("method recv", this.words).join(await Promise.resolve("|"));
    console.log("method after");
    console.log(text);
    return text;
  }
}

const expr: (xs: Array<number>) => Promise<Array<number>> = async function (xs: Array<number>): Promise<Array<number>> {
  return selectNumbers("expr recv", xs).slice(await Promise.resolve(2));
};

async function discard(xs: Array<number>): Promise<boolean> {
  selectNumbers("discard recv", xs).includes(await Promise.resolve(4));
  console.log("discard after");
  return true;
}

declared(numbers).then((ok: boolean): void => {
  console.log("declared then");
  console.log(ok);
});

arrow(numbers).then((count: number): void => {
  console.log("arrow then");
  console.log(count);
});

new ArrayAwaitRunner().joined().then((text: string): void => {
  console.log("method then");
  console.log(text);
});

expr(numbers).then((tail: Array<number>): void => {
  console.log("expr then");
  console.log(tail.length);
  console.log(tail[0]);
});

discard(numbers).then((ok: boolean): void => {
  console.log("discard then");
  console.log(ok);
});

console.log("sync tail");

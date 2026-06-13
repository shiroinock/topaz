/// <reference lib="es2015.promise" />

function search(label: string, value: string): Promise<string> {
  console.log(label);
  return Promise.resolve(value);
}

async function answer(): Promise<number> {
  return "abc".indexOf(await search("return search", "b"));
}

answer().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");

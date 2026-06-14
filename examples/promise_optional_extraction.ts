/// <reference lib="es2015.collection" />
/// <reference lib="es2018.promise" />

type NumberPromise = Promise<number>;
type NumberLike = PromiseLike<number>;

const p: NumberPromise = Promise.resolve(10);
const promises = new Map<string, NumberPromise>();
promises.set("hit", p);

const hit = promises.get("hit");
if (hit !== undefined) {
  const narrowed: NumberPromise = hit;
  console.log("promise hit");
}

const missing = promises.get("miss");
if (missing === undefined) {
  console.log("promise miss");
}

const fallback: NumberPromise = promises.get("fallback") ?? p;
console.log("promise coalesce");

const forced: NumberPromise = hit!;
console.log("promise bang");

const likes = new Map<string, NumberLike>();
const missingLike = likes.get("none");
if (missingLike === undefined) {
  console.log("like miss");
}

const maybeLike: NumberLike | undefined = missingLike;
if (maybeLike !== undefined) {
  const narrowedLike: NumberLike = maybeLike;
  console.log("like present");
} else {
  console.log("like still missing");
}

const absentPromise: NumberPromise | undefined = undefined;
if (absentPromise === undefined) {
  console.log("explicit absent");
}

const fallbackPromise: NumberPromise = absentPromise ?? p;
console.log("explicit coalesce");

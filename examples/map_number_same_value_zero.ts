const map = new Map<number, number>();
const nanA: number = 0 / 0;
const nanB: number = parseFloat("nope");
map.set(nanA, 11);
const nanValue: number | undefined = map.get(nanB);
if (nanValue !== undefined) {
  console.log(nanValue);
}
map.set(-0, 22);
const zeroValue: number | undefined = map.get(+0);
if (zeroValue !== undefined) {
  console.log(zeroValue);
}
map.set(42, 33);
const finiteValue: number | undefined = map.get(42);
if (finiteValue !== undefined) {
  console.log(finiteValue);
}
console.log(map.has(nanB));
console.log(map.has(+0));
console.log(map.has(7));

const set = new Set<number>();
set.add(nanA);
set.add(nanB);
set.add(-0);
set.add(+0);
set.add(42);
console.log(set.has(nanB));
console.log(set.has(+0));
console.log(set.has(42));
console.log(set.has(7));
console.log(set.size);

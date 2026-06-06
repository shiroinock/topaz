function numberWork(limit: number): number {
  let acc = 0;
  let i = 0;
  while (i < limit) {
    acc = (acc + (i % 97) * 3) % 1000000007;
    i = i + 1;
  }
  return acc;
}

function stringWork(limit: number): number {
  let text = "topaz-runtime-hot-path";
  let acc = 0;
  let i = 0;
  while (i < limit) {
    if (text.startsWith("topaz")) {
      acc = acc + text.charCodeAt(i % text.length);
    } else {
      acc = acc + text.charCodeAt((i + 3) % text.length);
    }
    text = text.slice(1) + String.fromCharCode(65 + (i % 26));
    i = i + 1;
  }
  return acc;
}

function containerWork(limit: number): number {
  const map = new Map<string, number>();
  const set = new Set<string>();
  let acc = 0;
  let i = 0;
  while (i < limit) {
    const key =
      "k" + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + ((i + 7) % 26));
    map.set(key, i);
    set.add(key);
    const value = map.get(key);
    if (value !== undefined) {
      acc = acc + value;
    }
    if (set.has(key)) {
      acc = acc + 1;
    }
    i = i + 1;
  }
  return acc + map.size + set.size;
}

const total = numberWork(60000) + stringWork(20000) + containerWork(20000);
console.log(total);

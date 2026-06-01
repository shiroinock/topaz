type Pair = { step: number; suffix: string };

let counter: number = 1;
const GREETING: string = "hi";
const PAIR: Pair = { step: 2, suffix: "!" };

export function next(): number {
  counter = counter + PAIR.step;
  return counter;
}

export function greet(): string {
  return GREETING + PAIR.suffix;
}

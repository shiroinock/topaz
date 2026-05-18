import { Shape } from "./module_basic_shapes.js";

export function add(a: number, b: number): number {
  return a + b;
}

export class Counter {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
  step(): number {
    this.value = this.value + 1;
    return this.value;
  }
}

export function describe(s: Shape): number {
  return s.area();
}

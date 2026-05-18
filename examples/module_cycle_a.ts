import { B } from "./module_cycle_b.js";

export class A {
  link: B;
  constructor(b: B) {
    this.link = b;
  }
}

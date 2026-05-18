import { add, Counter, describe } from "./module_basic_util.js";
import { Square, Shape } from "./module_basic_shapes.js";

console.log(add(3, 4));

const c: Counter = new Counter(10);
console.log(c.step());
console.log(c.step());
console.log(c.value);

const sq: Square = new Square(5);
const s: Shape = sq;
console.log(s.area());
console.log(describe(sq));

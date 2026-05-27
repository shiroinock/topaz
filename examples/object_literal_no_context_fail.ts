// Object literal expression requires a contextually typed anonymous-class target.
// Bare `let p = { a: 1, b: 2 }` 経由は context が無いので reject(annotate the
// binding か関数 return type で導く)。
let p = { a: 1, b: 2 };
console.log(p.a);

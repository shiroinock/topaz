// Phase 1.5-6 prep: equality (`===` / `!==`) emits without the redundant outer
// parens the generic binary wrap would add, so `if (a === b)` lowers to
// `if (a == b)` instead of `if ((a == b))` (clang -Wparentheses-equality).
// These cases lock in that dropping the wrap preserves precedence: the operands
// keep their own parens, so nested equality and mixed-precedence forms stay
// correct.
function run(): void {
  const a: number = 3;
  const b: number = 3;
  const c: number = 5;

  if (a === b) console.log("if-eq");
  if (a !== c) console.log("if-ne");

  // equality as operand of && / || (both lower precedence than ==)
  if (a === b && b !== c) console.log("and");
  if (a === c || b === b) console.log("or");

  // equality mixed with a relational op (relational binds tighter)
  if (a === b && a < c) console.log("mixed");

  // equality whose operands are themselves parenthesized equalities:
  // (true) === (false) -> false. The inner parens re-wrap at the paren branch,
  // the outer equality is unwrapped — clang stays quiet because the inner
  // parens carry real grouping.
  if ((a === b) === (b === c)) {
    console.log("both-same");
  } else {
    console.log("differ");
  }

  // while / for / do-while conditions
  let i: number = 0;
  while (i !== 3) {
    i += 1;
  }
  console.log(i);

  let sum: number = 0;
  for (let k: number = 0; k !== 4; k += 1) {
    sum += k;
  }
  console.log(sum);

  let j: number = 0;
  do {
    j += 1;
  } while (j !== 2);
  console.log(j);
}
run();

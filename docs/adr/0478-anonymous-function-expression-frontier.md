# 0478 - anonymous function expression frontier

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.11

## Context

The async/await roadmap reached async function, arrow, and method await frames
in ADRs [0471](./0471-async-function-no-await-lowering.md) through
[0477](./0477-async-method-await-frame-lowering.md). The next async surface was
`async function expression`, but Topaz had no `FunctionExpression` AST node and
historically treated `function (...) { ... }` as outside the arrow-overlapping
function-value surface. Establishing the synchronous function-expression
frontier first avoids backtracking when async function expressions are added.

## Decision

Add a `function_expr` AST node with an optional source name and async flag, but
accept only anonymous synchronous block-bodied function expressions in codegen.
Anonymous function expressions reuse the existing fn fat pointer ABI
`{ .fn, .env }`, closure env allocation, by-value capture semantics, contextual
parameter typing, and explicit/contextual return typing from arrows. Rejected
alternatives: implementing JS named self-binding recursion would introduce a
new local binding model, treating function-expression `this` like arrow lexical
`this` would silently pick the wrong JavaScript semantics, and adding async,
generator, rest/default/optional/destructured params, `arguments`, `new.target`,
or arbitrary/return await would cross this phase boundary.

## Implementation

- `src/ast.ts:152` adds `FunctionExpr` to `Expr`, carrying optional `name`,
  `isAsync`, shared arrow params, optional return annotation, and block body.
- `src/convert_from_tsc.ts:1353` converts `ts.FunctionExpression` while keeping
  named and async shape in the AST and rejecting generic/rest/default/optional
  parameter syntax before codegen.
- `src/topaz_parser.ts:1818` parses `function (...) { ... }` and
  `async function (...) { ... }`, including an optional name for precise
  deferred diagnostics.
- `src/codegen.ts:5047` adapts supported anonymous sync function expressions to
  the existing block-bodied arrow lowering path and rejects named, async, and
  function-expression `this` surfaces before lowering.
- `src/effect_provenance.ts:311` walks function-expression bodies so imported
  effectful calls inside accepted expressions remain visible to report checks.

## Consequences

- **Accepted**: `examples/function_expression.ts` covers assignment to a fn
  type, capture of an outer binding, and contextual function-expression
  callbacks passed as ordinary function arguments.
- **Rejected**: `examples/function_expression_named_deferred_fail.ts` preserves
  the named-expression boundary with `named function expressions are deferred`.
- **Rejected**: `examples/function_expression_async_deferred_fail.ts` preserves
  the async-expression boundary with `async function expressions are deferred`.
- **Regression**: smoke has 438 `run_*` lines after adding the three
  function-expression cases. The positive sample is also checked with
  `pnpm exec tsc --noEmit --skipLibCheck examples/function_expression.ts`.
- **Scope out**: named self-binding recursion, async function expressions,
  generic/generator function expressions, rest/default/optional/destructured
  params, `arguments`, `new.target`, function-expression `this`, arbitrary
  await expressions, and `return await` remain future work.

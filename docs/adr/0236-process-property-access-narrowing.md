# 0236 — process property access narrowing

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

Phase 202 advanced the self-host probe into the value-site `process.argv`
short-circuit in `Emitter.emitExpression`. The process / console semantics were
already fixed by [0026](./0026-process-console-builtins.md): `process` remains a
synthetic namespace, `process.argv` is the only accepted value read, and
`process.exit` / `process.stdout.write` / `process.stderr.write` are call-only.
The implementation still used TypeScript-style chained property reads on
`expr.receiver` before the current Topaz subset had narrowed `expr` and its
receiver variant, producing `src/codegen.ts:6987:7: cannot access '.name' on
discriminated union ...`.

## Decision

Keep the ADR 0026 accepted / rejected process API unchanged, and rewrite only
the value-site `process.<member>` detection in `emitExpression` and `inferType`
to narrow stepwise: first `expr.kind === "prop_access"`, then copy
`const receiver = expr.receiver`, then require `receiver.kind === "ident"` before
reading `receiver.name`. Unsupported `process.<member>` value reads now use a
minimal `{ pos: expr.pos }` diagnostic anchor so the self-host source does not
need to carry a full prop-access expression into `CodegenError`.

却下した案: A=`process` を実 binding として登録する(理由: ADR 0026 の synthetic namespace 方針を崩し、call-site/value-site の限定認識より広い表面を作る)。B=任意 identifier の property access を広げる(理由: 今回の blocker は compiler source cleanup であり、frontend semantics の拡張ではない)。C=`process.pid` 等の新しい value read を受理する(理由: self-host probe の前進に不要で、runtime/API 決定が別途必要)。

## Implementation

- `src/codegen.ts:6984-6997`: `emitExpression(process.argv)` の short-circuit を
  nested narrowing へ変更し、既存通り `topaz_process_argv()` を返す。
- `src/codegen.ts:9545-9558`: `inferType(process.argv)` も同じ nested narrowing
  へ変更し、既存通り `Array<string>` を返す。
- `src/codegen.ts:6991-6994` / `src/codegen.ts:9552-9555`: unsupported
  `process.<member>` value read の診断 anchor を `{ pos: expr.pos }` に縮小。

## Consequences

- **受理**: `process.argv` value read は従来通り `Array<string>` として受理。
- **reject**: `process.pid` / `process.exit` / `process.stdout` / `process.stderr`
  など `process.argv` 以外の value read は従来通り reject。
- **回帰**: 新規サンプルなし。既存 `process_io` /
  `process_member_value_fail` / `process_exit_*` /
  `process_stdout_write_*` / `console_error_arity_fail` を含む 277 ケースを
  `pnpm test` で維持する。
- **self-host**: 旧 blocker `src/codegen.ts:6987:7` は解消。次 blocker は
  `src/codegen.ts:7028:13: type mismatch: expected topaz_class_anon_88, got topaz_class_anon_19`。
- **scope 外 / 将来課題**: process call-site handling、runtime argv storage、
  parser、AST、discriminated-union narrowing policy は変更しない。

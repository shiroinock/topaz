# 0001 — recursive / mutually-recursive type alias の解禁

- **Status**: Accepted
- **Date**: 2026-05-25 頃(prep #14 着地時点)
- **Phase**: 1.5-6 prep-recursive-type-alias

## Context

prep #13(`node:fs.readFileSync`)着地後、self-host 経路の次の blocker は `src/ast.ts:29:19: circular type alias 'TypeNode'`。`src/ast.ts` は `type TypeNode = TypeRef | TypeUnion | ...; type TypeRef = { typeArgs: Array<TypeNode> }` 形の **AST 系の相互参照** を持ち、prep #4(type alias)の `resolving` flag では legitimate な再帰も全部 reject されていた。

**前提**: 真の generative cycle(`type A = A;` / `type A = Array<A>;` / `type A = B; type B = A;`)は引き続き reject、TypeLiteralNode の boundary を伴う recursion のみ解禁する。

## Decision

**option C 採用**: ① SCC で recursive alias を marking、② recursive alias の body 内 TypeLiteralNode のみ事前に anon class 名 + placeholder ClassInfo を allocate、③ 2-phase で field を fill。

**却下した案**:
- **A**(全 alias を `_` placeholder で pre-allocate して 2-pass で fill)— class typedef forward の依存解析が肥大化
- **B**(`resolving` flag を許可し、recursion edge では abstract `recursive_ref` を返して後で patch)— dunion / Array<T> 構築時の型同一性 check が壊れる

## Implementation

- **SCC**: `markRecursiveAliases` で Tarjan を `typeAliases` 上に走らせる(`collectAliasRefs` が body を AST walk して TypeReferenceNode の name を集める)。SCC size > 1 または self-loop edge を持つ size==1 を recursive 判定
- **Pre-allocation**: `preAllocateRecursiveAnons` が recursive alias の body 内 TypeLiteralNode に `anon_N` 採番(structural dedupe を skip)、`preAllocatedAnons.set(node, mangled)` 登録 + placeholder ClassInfo を `classes` / `classMonomorphs` / `classMonomorphWorklist` に登録
- **Field fill**: `fillPreAllocatedAnonFields` の 2 phase — **Sub-pass A** は discriminator(`PropertySignature` の `LiteralTypeNode` + `StringLiteral`)のみ埋める、**Sub-pass B** で `typeFromAnnotation` を呼んで全 field を完全 resolve。`tryMakeDiscriminatedUnion` が sub-pass B 中に各 variant の `kind` literal を確認できる不変条件を sub-pass A が保証
- **typeFromAnnotation 改修**: TypeLiteralNode branch 冒頭で `preAllocatedAnons.get(node)` を確認、ヒットしたら short-circuit。field-fill 中も後段の object literal expected 型解決も同じ anon を返す
- **`resolving` flag は維持**: TypeLiteralNode boundary を含まない pure cycle は引き続き既存経路で reject
- **Pass 順序**: `emit()` 内 pass 1c(registerTypeAlias)完了後、pass 1d(registerGenericClass)/ pass 2 の前

## Consequences

- **受理**: ① 単一 alias self-recursive(`type N = { v; next: N | undefined }`)、② dunion 自己参照(`type Expr = { kind: "lit"; v } | { kind: "neg"; inner: Expr }`)、③ 相互参照(`type TypeNode = ... | { ref: TypeRef }; type TypeRef = { args: Array<TypeNode> }`)、④ Array 経由 self-recursive(`type Tree = { v; kids: Array<Tree> }`)、⑤ 非循環 alias の structural dedupe は維持
- **reject**: ① `type A = A;`、② `type Foo = Array<Foo>;`、③ `type A = B; type B = A;`、④ `type X = number | X;`、⑤ generic alias / class 名衝突 / value 位置参照
- **回帰**: positive `type_alias_recursive.ts`(5 シナリオ / 16 出力)+ fail `type_alias_self_ref_fail.ts`、`type_alias_array_self_ref_fail.ts`。既存 `type_alias_circular_fail.ts` の挙動は維持。152 → 155 ケース全 pass
- **pass criterion**: `node dist/cli.js src/ast.ts --emit-c-only` の旧 blocker(circular type alias 'TypeNode')は解消、新 blocker は `T | undefined` で T が dunion(→ [0002](./0002-dunion-optional.md))

## scope 外 / 将来課題

- `dunion | undefined`(→ [0002](./0002-dunion-optional.md) で解消)
- TypeLiteralNode を持つ別 alias の同形性: 現状は per-alias の固有 anon allocation(nominal)、structural dedupe 経路ではない
- Function type 経由の recursive(`type Cb = (n) => Cb;`)は body が FunctionTypeNode で TypeLiteral を含まないため引き続き reject(fn typedef forward が要る)

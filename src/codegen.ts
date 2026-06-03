import {
  TypeNode,
  TypeLiteralNode,
  SourceModule,
  Decl,
  FunctionDecl,
  ClassDecl,
  InterfaceDecl,
  TypeAliasDecl,
  ClassFieldMember,
  ClassMethodMember,
  FunctionParam,
  Expr,
  Stmt,
  BlockStmt,
  IdentExpr,
  CallExpr,
  ArrowExpr,
  PropAccessExpr,
  ElemAccessExpr,
  BinOpExpr,
  TernaryExpr,
  ArrayLitExpr,
  NewExpr,
  TemplateLitExpr,
  PrefixOpExpr,
  PostfixOpExpr,
  AssignExpr,
  ForOfStmt,
  VarDeclStmt,
  VarDestrDeclStmt,
  SwitchStmt,
  SwitchCase,
  ContinueStmt,
  ThrowStmt,
  TryStmt,
  ForStmt,
} from "./ast.js";

// Phase 1.5-6e-2: ambient SourceFile for the migrated emit/infer SCC. Topaz
// `Expr` / `Stmt` nodes carry a `pos` but not their SourceFile, so `CodegenError`
// resolves `file:line:col` from this module-level value (set at every decl-land
// → SCC boundary, save/restore-style). The Topaz `pos` equals the tsc
// `getStart(sf)` recorded by convert, so positions are byte-identical to the
// pre-migration tsc-anchored errors.
let g_currentModule: SourceModule | undefined = undefined;

// Phase 1.4c-3: TopazType is a structured tagged-union. Until 1.4c-2 we used a
// string-union ("topaz_array_class_Box" etc.) keyed by canonical C identifier,
// which broke on nested containers (`Array<Array<T>>`) and would have made
// generic class monomorph plumbing painful. Helpers below preserve the same
// C identifier surface (typeIdent / cTypeName / arrayShortName / ...) so the
// generated C is byte-identical to the pre-refactor output.
// Phase 1.5-3b: `undefined` と `T | undefined` 形式の union を導入。
// - `undefined`: 単独の sentinel 型。値としては T | undefined 変数の初期化と
//   `===` / `!==` 比較のみで使い、変数の C 表現は持たない(`cTypeName` で reject)。
// - `union`: variants は typeKey ソート + 重複排除済みで canonical。1.5-3b では
//   `T | undefined` で T が reference (array/map/set/class) または interface の
//   形のみ受理する(scalar | undefined は 1.5-3c で Map.get の `V | undefined`
//   と一緒に struct 表現を入れて対応する)。general union (A | B) は 1.5-3e の
//   discriminated union narrowing で対応する。
// Phase 1.5-3.5e: `fn` represents a closure value (function pointer + env
// pointer fat pointer). Param names are stored for diagnostics but ignored by
// `typeEq` / mangling — only positional types matter for type identity.
// Phase 1.5-3.5g-iterator: `iter` represents an Iterator<T> value (state ptr
// + next-fn ptr fat pointer). Only produced by `.values()` / `.keys()` on
// Map / Set; never written as a type annotation. Two iters are equal when
// elem types match — sources (map_values vs set_values) don't affect identity.
type TopazType =
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "string" }
  | { kind: "undefined" }
  | { kind: "unknown" }
  | { kind: "void" }
  | { kind: "string_literal"; value: string }
  | { kind: "array"; elem: TopazType }
  | { kind: "map"; key: TopazType; value: TopazType }
  | { kind: "set"; elem: TopazType }
  | { kind: "class"; name: string }
  | { kind: "iface"; name: string }
  | DunionType
  | { kind: "union"; variants: Array<TopazType> }
  | FnType
  | IterType;

type DunionType = { kind: "dunion"; variants: Array<string>; discriminator: string };
type FnType = { kind: "fn"; params: Array<ParamInfo>; returnType: TopazType };
type IterType = { kind: "iter"; elem: TopazType };

const T_NUMBER: TopazType = { kind: "number" };
const T_BOOLEAN: TopazType = { kind: "boolean" };
const T_STRING: TopazType = { kind: "string" };
const T_UNDEFINED: TopazType = { kind: "undefined" };
const T_UNKNOWN: TopazType = { kind: "unknown" };
// Phase 1.5-6 prep: `void` is only valid as a function / method return type.
// It has no C value representation — cTypeName collapses it to `void` and
// rejects every other position (variable annotation, container element,
// `T | void` union, fn param, etc.). The return-statement path enforces
// the symmetric rule (no `return expr;` from void, no `return;` from non-void).
const T_VOID: TopazType = { kind: "void" };

const TOPAZ_THIS: string = "__topaz_this";

function isScalarType(t: TopazType): boolean {
  return t.kind === "number" || t.kind === "boolean" || t.kind === "string";
}

function isArrayType(t: TopazType): boolean { return t.kind === "array"; }
function isMapType(t: TopazType): boolean { return t.kind === "map"; }
function isSetType(t: TopazType): boolean { return t.kind === "set"; }
function isClassType(t: TopazType): boolean { return t.kind === "class"; }
function isInterfaceType(t: TopazType): boolean { return t.kind === "iface"; }
function isUndefinedType(t: TopazType): boolean { return t.kind === "undefined"; }

function classNameOf(t: TopazType): string | undefined {
  return t.kind === "class" ? t.name : undefined;
}

function classOf(name: string): TopazType {
  return { kind: "class", name };
}

function interfaceNameOf(t: TopazType): string | undefined {
  return t.kind === "iface" ? t.name : undefined;
}

function interfaceOf(name: string): TopazType {
  return { kind: "iface", name };
}

// "reference" here means represented in C as `T *` (pointer). Interfaces are
// fat-pointer structs passed by value, so they're handled separately by
// cTypeName even though their semantics (shared underlying data) are
// reference-like.
// Phase 1.5-3b: `T | undefined` for reference T is also reference (T * with
// NULL meaning undefined). `T | undefined` for interface T is NOT reference
// (still a fat pointer value, with data == NULL meaning undefined).
function isReferenceType(t: TopazType): boolean {
  if (t.kind === "union") {
    const nonUndef = t.variants.filter((v) => v.kind !== "undefined");
    if (nonUndef.length === 1) {
      const inner = nonUndef[0];
      return isReferenceType(inner);
    }
    return false;
  }
  return isArrayType(t) || isMapType(t) || isSetType(t) || isClassType(t);
}

// Phase 1.5-3b: helpers for union/undefined.
function containsUndefined(t: TopazType): boolean {
  if (t.kind === "undefined") return true;
  if (t.kind === "union") {
    for (const v of t.variants) {
      if (isUndefinedType(v)) return true;
    }
  }
  return false;
}

// Strip the `undefined` variant from a union (used by narrowing in 1.5-3d).
// If `t` is just `undefined`, returns undefined (no usable narrowed type).
function withoutUndefined(t: TopazType): TopazType | undefined {
  if (t.kind === "undefined") return undefined;
  if (t.kind !== "union") return t;
  const rest = t.variants.filter((v) => v.kind !== "undefined");
  if (rest.length === 0) return undefined;
  return makeUnion(rest);
}

// Structural overlap check used by `===` / `!==`: do `a` and `b` share at
// least one common variant? `Point | undefined` and `undefined` overlap;
// `Point | undefined` and `Circle` do not.
function typesOverlap(a: TopazType, b: TopazType): boolean {
  if (typeEq(a, b)) return true;
  if (a.kind === "union") {
    for (const v of a.variants) {
      if (typesOverlap(v, b)) return true;
    }
    return false;
  }
  if (b.kind === "union") {
    for (const v of b.variants) {
      if (typesOverlap(a, v)) return true;
    }
    return false;
  }
  return false;
}

function arrayElem(t: TopazType): TopazType | undefined {
  return t.kind === "array" ? t.elem : undefined;
}

function arrayOf(elem: TopazType): TopazType | undefined {
  // Phase 1.5-3.5g-array-fn: fn elems are accepted; Map / Set keep rejecting
  // fn at their mapOf / setOf gates (fn equality / hashing is undefined).
  // Phase 1.5-6 prep #8: dunion elems are accepted (Array / Map<scalar, dunion>
  // / Set<dunion>); recursive dunion/union variants are rejected at
  // tryMakeDiscriminatedUnion so by the time we get a `dunion` here the
  // variants are guaranteed to be concrete classes.
  if (
    !isScalarType(elem) && !isClassType(elem) && !isInterfaceType(elem)
    && elem.kind !== "fn" && elem.kind !== "dunion"
  ) return undefined;
  return { kind: "array", elem };
}

function mapKey(t: TopazType): TopazType | undefined {
  return t.kind === "map" ? t.key : undefined;
}

function mapValue(t: TopazType): TopazType | undefined {
  return t.kind === "map" ? t.value : undefined;
}

function mapOf(k: TopazType, v: TopazType): TopazType | undefined {
  if (!isScalarType(k)) return undefined;
  // Phase 1.5-6 prep #8: dunion value type is accepted (storage shape =
  // iface, absent sentinel = `{0}` with `.data == NULL`). Key stays scalar.
  if (!isScalarType(v) && !isClassType(v) && !isInterfaceType(v) && v.kind !== "dunion") return undefined;
  return { kind: "map", key: k, value: v };
}

function setElem(t: TopazType): TopazType | undefined {
  return t.kind === "set" ? t.elem : undefined;
}

function setOf(elem: TopazType): TopazType | undefined {
  // Phase 1.5-6 prep #8: Set<dunion> uses `.data` pointer as the identity key,
  // matching Set<class> / Set<iface> reference-identity semantics.
  if (!isScalarType(elem) && !isClassType(elem) && !isInterfaceType(elem) && elem.kind !== "dunion") return undefined;
  return { kind: "set", elem };
}

// Structural equality. Replaces the old string `===` comparisons; do not use
// `===` directly on TopazType (objects compare by reference).
function typeEq(a: TopazType, b: TopazType): boolean {
  if (a.kind === "number") return b.kind === "number";
  if (a.kind === "boolean") return b.kind === "boolean";
  if (a.kind === "string") return b.kind === "string";
  if (a.kind === "undefined") return b.kind === "undefined";
  if (a.kind === "unknown") return b.kind === "unknown";
  if (a.kind === "void") return b.kind === "void";
  if (a.kind === "string_literal") {
    if (b.kind !== "string_literal") return false;
    return a.value === b.value;
  }
  if (a.kind === "array") {
    if (b.kind !== "array") return false;
    return typeEq(a.elem, b.elem);
  }
  if (a.kind === "map") {
    if (b.kind !== "map") return false;
    return typeEq(a.key, b.key) && typeEq(a.value, b.value);
  }
  if (a.kind === "set") {
    if (b.kind !== "set") return false;
    return typeEq(a.elem, b.elem);
  }
  if (a.kind === "class") {
    if (b.kind !== "class") return false;
    return a.name === b.name;
  }
  if (a.kind === "iface") {
    if (b.kind !== "iface") return false;
    return a.name === b.name;
  }
  if (a.kind === "dunion") {
    if (b.kind !== "dunion") return false;
    if (a.discriminator !== b.discriminator) return false;
    if (a.variants.length !== b.variants.length) return false;
    for (let i = 0; i < a.variants.length; i++) {
      if (a.variants[i] !== b.variants[i]) return false;
    }
    return true;
  }
  if (a.kind === "union") {
    if (b.kind !== "union") return false;
    if (a.variants.length !== b.variants.length) return false;
    // variants are canonical-sorted by makeUnion, so positional compare.
    for (let i = 0; i < a.variants.length; i++) {
      const av = a.variants[i];
      const bv = b.variants[i];
      if (!typeEq(av, bv)) return false;
    }
    return true;
  }
  if (a.kind === "fn") {
    // Phase 1.5-3.5e: positional param comparison; param names are
    // informational only. Two fn types are equal when arity matches, each
    // param type is equal positionally, and return types are equal.
    if (b.kind !== "fn") return false;
    if (a.params.length !== b.params.length) return false;
    for (let i = 0; i < a.params.length; i++) {
      const ap = a.params[i];
      const bp = b.params[i];
      if (!typeEq(ap.type, bp.type)) return false;
    }
    return typeEq(a.returnType, b.returnType);
  }
  if (a.kind === "iter") {
    if (b.kind !== "iter") return false;
    return typeEq(a.elem, b.elem);
  }
  return false;
}

// Phase 1.5-3b: build a union, flattening nested unions, deduplicating by
// typeKey, and sorting variants for canonical comparison. Single-variant
// "unions" collapse to the inner type. Throws on empty input.
function makeUnion(variants: Array<TopazType>): TopazType {
  const flat: TopazType[] = [];
  for (const v of variants) {
    if (v.kind === "union") {
      for (const sub of v.variants) flat.push(sub);
    } else {
      flat.push(v);
    }
  }
  const dedup = new Map<string, TopazType>();
  for (const v of flat) dedup.set(typeKey(v), v);
  const sorted: Array<TopazType> = [];
  for (const v of dedup.values()) {
    const key = typeKey(v);
    sorted.push(v);
    let i = sorted.length - 1;
    while (i > 0 && typeKeyLess(key, typeKey(sorted[i - 1]))) {
      sorted[i] = sorted[i - 1];
      i = i - 1;
    }
    sorted[i] = v;
  }
  if (sorted.length === 0) throwInternalCodegenError("makeUnion: empty variants");
  if (sorted.length === 1) return sorted[0];
  return { kind: "union", variants: sorted };
}

// Element/value "tag" used to compose C identifiers (the bit after
// `topaz_array_`, `topaz_set_`, the value half of `topaz_map_<K>_<V>`). For
// scalars it's the bare name; for class/iface it carries the `class_`/`iface_`
// prefix so we never collide with scalars or with each other.
// Phase 1.5-3b: undefined / union cannot be a container element (the runtime
// has no monomorph for `Array<T | undefined>` etc.); reject at this layer so
// any caller hits a clear error rather than producing garbage identifiers.
function elemTag(t: TopazType): string {
  if (t.kind === "number") return "number";
  if (t.kind === "boolean") return "boolean";
  if (t.kind === "string") return "string";
  if (t.kind === "class") return `class_${t.name}`;
  if (t.kind === "iface") return `iface_${t.name}`;
  if (t.kind === "dunion") {
    // Phase 1.5-6 prep #8: discriminated class union as a container element.
    // The dunion typedef is `{ topaz_string kind; void *data; }` (emitted in
    // emitDunionTypedef), so storage is a single struct value — no nested
    // pointer indirection. Variants are required to be concrete classes;
    // recursive dunion/union variants are rejected at typeFromAnnotation.
    // Tag is typeIdent stripped of the `topaz_` prefix so the resulting
    // `topaz_array_dunion_A_or_B` / `topaz_map_<K>_dunion_A_or_B` /
    // `topaz_set_dunion_A_or_B` mangle is unique per variant set.
    return typeIdent(t).slice("topaz_".length);
  }
  if (t.kind === "undefined") {
    throwInternalCodegenError("elemTag: bare undefined cannot be a container element");
  }
  if (t.kind === "union") {
    throwInternalCodegenError(`elemTag: union ${typeIdent(t)} cannot be a container element (1.5-3b)`);
  }
  if (t.kind === "fn") {
    // Phase 1.5-3.5g-array-fn: fn elems are tagged like classes (the
    // arity-prefixed identifier from typeIdent stripped of `topaz_`).
    // Map / Set still reject fn at mapOf / setOf (eq / hash undefined).
    return typeIdent(t).slice("topaz_".length);
  }
  if (t.kind === "iter") {
    // Phase 1.5-3.5g-iterator: Iterator<T> values are single-pass and own
    // arena-allocated state — storing them in Array / Map / Set would need
    // ownership semantics we don't model. Always reject at container site.
    throwInternalCodegenError(`elemTag: iterator type ${typeIdent(t)} cannot be a container element (1.5-3.5g)`);
  }
  throwInternalCodegenError("elemTag: unsupported container element kind (no nested containers yet)");
}

function scalarTag(t: TopazType): string {
  if (t.kind !== "number" && t.kind !== "boolean" && t.kind !== "string") {
    throwInternalCodegenError(`scalarTag: expected scalar, got kind=${t.kind}`);
  }
  return t.kind;
}

// Monomorph short-name tags (used to compose function/struct names like
// `topaz_array_<short>_push`). Each matches the substring after the container
// prefix from the pre-1.4c-3 string union.
function arrayShortName(t: TopazType): string {
  if (t.kind === "array") return elemTag(t.elem);
  throwInternalCodegenError(`arrayShortName: not an array, kind=${t.kind}`);
}

function mapShortName(t: TopazType): string {
  if (t.kind === "map") return `${scalarTag(t.key)}_${elemTag(t.value)}`;
  throwInternalCodegenError(`mapShortName: not a map, kind=${t.kind}`);
}

function setShortName(t: TopazType): string {
  if (t.kind === "set") return elemTag(t.elem);
  throwInternalCodegenError(`setShortName: not a set, kind=${t.kind}`);
}

// Canonical C identifier for a type — the same string the pre-1.4c-3 string
// union used as its value. Used both as the C type name (for non-reference
// types) and as the display form in error messages and Map/Set keys.
// Phase 1.5-3b: `topaz_undefined` for the sentinel, `topaz_union_a_or_b` for
// canonical-sorted unions (used as a typeKey, not as a C type — the C side
// for `T | undefined` collapses to T's representation in cTypeName).
function typeIdent(t: TopazType): string {
  if (t.kind === "number") return "topaz_number";
  if (t.kind === "boolean") return "topaz_boolean";
  if (t.kind === "string") return "topaz_string";
  if (t.kind === "undefined") return "topaz_undefined";
  if (t.kind === "unknown") return "topaz_unknown";
  if (t.kind === "void") return "topaz_void";
  if (t.kind === "string_literal") return `topaz_string_literal_${t.value}`;
  if (t.kind === "array") return `topaz_array_${arrayShortName(t)}`;
  if (t.kind === "map") return `topaz_map_${mapShortName(t)}`;
  if (t.kind === "set") return `topaz_set_${setShortName(t)}`;
  if (t.kind === "class") return `topaz_class_${t.name}`;
  if (t.kind === "iface") return `topaz_iface_${t.name}`;
  if (t.kind === "dunion") {
    const sorted: Array<string> = [];
    for (const v of t.variants) {
      sorted.push(v);
      let i = sorted.length - 1;
      while (i > 0 && typeKeyLess(v, sorted[i - 1])) {
        sorted[i] = sorted[i - 1];
        i = i - 1;
      }
      sorted[i] = v;
    }
    let suffix = "";
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        suffix = sorted[i];
      } else {
        suffix = `${suffix}_or_${sorted[i]}`;
      }
    }
    return `topaz_dunion_${suffix}`;
  }
  if (t.kind === "union") {
    return `topaz_union_${t.variants.map((v) => typeIdent(v).slice("topaz_".length)).join("_or_")}`;
  }
  if (t.kind === "fn") {
    // Phase 1.5-3.5e: arity prefix `a<N>` keeps different-arity signatures
    // unambiguous even when param mangling contains `__`; the `__to__`
    // separator splits param list from return type.
    const paramIds = t.params.map((p) => typeIdent(p.type).slice("topaz_".length)).join("__");
    const retId = typeIdent(t.returnType).slice("topaz_".length);
    const paramSection = paramIds.length > 0 ? `__${paramIds}` : "";
    return `topaz_fn_a${t.params.length}${paramSection}__to__${retId}`;
  }
  if (t.kind === "iter") return `topaz_iter_${elemTag(t.elem)}`;
  throwInternalCodegenError("typeIdent: unsupported type kind");
}

// Stable key for using TopazType as a Map/Set key. Identical to typeIdent.
function typeKey(t: TopazType): string {
  return typeIdent(t);
}

function typeKeyLess(a: string, b: string): boolean {
  const limit = a.length < b.length ? a.length : b.length;
  for (let i = 0; i < limit; i++) {
    const ac = a.charCodeAt(i);
    const bc = b.charCodeAt(i);
    if (ac < bc) return true;
    if (ac > bc) return false;
  }
  return a.length < b.length;
}

// Phase 1.5-3.5e: capture-analysis filter for identifiers that name compile-
// time concepts rather than runtime values (so they should never be treated
// as captures even if they appear inside an arrow body).
// Phase 1.5-6e-2: a string-literal VALUE in the Topaz AST is either a `str_lit`
// or a no-substitution `template_lit` (head only, empty subs). Both surface the
// same cooked text. Returns the text, or undefined when `e` is neither.
function stringLitText(e: Expr): string | undefined {
  if (e.kind === "str_lit") return e.value;
  if (e.kind === "template_lit" && e.subs.length === 0) return e.head;
  return undefined;
}

function hasDecimalOrExponent(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 46 || ch === 69 || ch === 101) return true;
  }
  return false;
}

function isBuiltinName(name: string): boolean {
  // `undefined` lowers via emitUndefinedLiteral, never via a binding lookup.
  // `console` is a synthetic namespace handled directly in emitCall.
  return name === "undefined" || name === "console";
}

// Phase 1.5-6e-2: capture analysis no longer needs an `isReferencePosition`
// predicate. The Topaz Expr/Stmt walk in `collectCaptures` only descends into
// real sub-expressions, so member names / property keys / declaration names —
// which are plain strings in the Topaz AST, not Expr nodes — are never visited
// as identifier references. Reference-position semantics fall out structurally.

// C type used in declarations and signatures. Reference types (Array/Map/Set
// /Class) are pointers so assignment shares storage. Interfaces are passed by
// value as fat pointer structs (struct topaz_iface_X with embedded data ptr).
// Phase 1.5-3b: `T | undefined` collapses to T's C representation — reference
// T uses NULL pointer as undefined; interface T uses { data == NULL, vt == 0 }
// as undefined (the fat pointer keeps both fields zero on undefined).
// Phase 1.5-3c: scalar `T | undefined` is represented by the sentinel struct
// `topaz_opt_<scalar>` (defined in runtime.h). `.present` carries the bit,
// `.value` carries the scalar; identifier emission appends `.value` after
// narrowing strips the undefined variant.
function cTypeName(t: TopazType): string {
  if (t.kind === "undefined") {
    throwInternalCodegenError("cTypeName: bare `undefined` has no C representation (only `T | undefined` does)");
  }
  // Phase 1.5-6 prep: `void` has no C value representation. cTypeName is the
  // value-type helper; return-type slots use cReturnTypeName below, which
  // returns the bare "void" keyword. Reaching cTypeName with `void` means a
  // caller leaked a void type into a value position (variable annotation,
  // container element, union, fn param, etc.) — that should be rejected with
  // a CodegenError by the upstream check, but throwing here keeps the
  // invariant explicit.
  if (t.kind === "void") {
    throwInternalCodegenError("cTypeName: `void` is only valid as a function / method return type");
  }
  // Phase 1.5-3f: `unknown` is only legal as a catch binding annotation, where
  // the throw payload is `void *`. Narrowing via `instanceof` casts to the
  // concrete class type before any field/method access.
  if (t.kind === "unknown") {
    return "void *";
  }
  if (t.kind === "string_literal") {
    return "topaz_string";
  }
  if (t.kind === "dunion") {
    return typeIdent(t);
  }
  if (t.kind === "union") {
    const nonUndef = t.variants.filter((v) => v.kind !== "undefined");
    if (nonUndef.length !== 1) {
      throwInternalCodegenError(`cTypeName: union ${typeIdent(t)} is not \`T | undefined\` (1.5-3b only supports T | undefined)`);
    }
    const inner = nonUndef[0];
    if (isScalarType(inner)) {
      return `topaz_opt_${inner.kind}`;
    }
    // Phase 1.5-6 prep #15: dunion uses the same `{ kind, data }` fat struct
    // as its C representation, and `.data == NULL` (zero-initialized struct)
    // is the absent sentinel — identical shape to iface | undefined, so the
    // C representation for `dunion | undefined` is just the dunion struct.
    if (!isReferenceType(inner) && inner.kind !== "iface" && inner.kind !== "dunion") {
      throwInternalCodegenError(
        `cTypeName: \`T | undefined\` requires T to be a scalar, reference (array/map/set/class), interface, or dunion; got ${typeIdent(inner)}`,
      );
    }
    return cTypeName(inner);
  }
  if (isInterfaceType(t)) return typeIdent(t);
  // Phase 1.5-3.5e: fn type is a fat-pointer struct `{ fn, env }` passed by
  // value. typeIdent matches the typedef name we synthesize in emit().
  if (t.kind === "fn") return typeIdent(t);
  // Phase 1.5-3.5g-iterator: iter type is a fat-pointer struct `{ state, next }`
  // passed by value; the state pointer keeps source-specific data on the arena
  // so the iter struct itself can be copied freely.
  if (t.kind === "iter") return typeIdent(t);
  return isReferenceType(t) ? `${typeIdent(t)} *` : typeIdent(t);
}

// Phase 1.5-6 prep: C type spelling for function / method return slots.
// `void` returns emit the bare keyword; every other type falls through to
// cTypeName. Keeps the value-type invariant of cTypeName intact while
// letting signatures interpolate either kind uniformly.
function cReturnTypeName(t: TopazType): string {
  if (t.kind === "void") return "void";
  return cTypeName(t);
}

// Phase 1.5-3c: helpers for the scalar `T | undefined` representation. The
// underlying C type is the `topaz_opt_<scalar>` struct, so narrowed reads
// need a `.value` accessor and `=== undefined` lowers to `.present == false`.
function isScalarOptUnion(t: TopazType): boolean {
  if (t.kind !== "union") return false;
  const inner = withoutUndefined(t);
  return inner !== undefined && isScalarType(inner);
}

// Phase 1.5-3.5g-iterator: short identifier for the container backing an
// iter (Map<K, V> -> "map_K_V", Set<T> -> "set_T"). Used to name the per-
// container state struct and `_next` function.
function iterContainerTag(t: TopazType): string {
  if (isMapType(t)) return `map_${mapShortName(t)}`;
  if (isSetType(t)) return `set_${setShortName(t)}`;
  throwInternalCodegenError(`iterContainerTag: unsupported container kind=${t.kind}`);
}

// Phase 1.5-3.5g-iterator: C expression for the "value to return when done"
// in a `_next` function. C requires a return value even though callers must
// ignore it after `*done = true`; we use a zero-initialized value per elem
// shape (NULL for pointer types, zero for scalars, all-null for fat pointers).
function zeroValueOfElem(elem: TopazType): string {
  if (elem.kind === "number") return "(topaz_number)0";
  if (elem.kind === "boolean") return "(topaz_boolean)0";
  if (elem.kind === "string") return `(topaz_string){ "", 0 }`;
  if (isClassType(elem)) return `(${cTypeName(elem)})NULL`;
  if (isInterfaceType(elem)) return `(${cTypeName(elem)}){ NULL, NULL }`;
  throwInternalCodegenError(`zeroValueOfElem: unsupported ${typeIdent(elem)}`);
}

type Binding = { type: TopazType; isConst: boolean };

class ScopeFrame {
  bindings: Map<string, Binding> = new Map<string, Binding>();
  narrowings: Map<string, TopazType> = new Map<string, TopazType>();
  parent: ScopeFrame | undefined = undefined;
  depth: number = 0;
}

class LoopCtxFrame {
  kind: string = "";
  prev: LoopCtxFrame | undefined = undefined;
}

// Phase 1.5-6e-4: resolve a byte offset to 0-based { line, col } using the
// module's lineStarts table (the byte offset of each line start). Mirrors
// ts.SourceFile.getLineAndCharacterOfPosition so `file:line:col` diagnostics
// stay byte-identical after the tsc dependency is dropped.
function posToLineCol(module: SourceModule, pos: number): { line: number; col: number } {
  const starts = module.lineStarts;
  let lo = 0;
  let hi = starts.length - 1;
  let line = 0;
  while (lo <= hi) {
    const sum = lo + hi;
    const mid = (sum - (sum % 2)) / 2;
    if (starts[mid] <= pos) {
      line = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { line, col: pos - starts[line] };
}

export class CodegenError {
  message: string = "";

  // Phase 1.5-6e-4: accept a Topaz node `{ pos }` and resolve it against the
  // ambient SourceModule's lineStarts, mirroring tsc SourceFile diagnostics.
  constructor(node: { pos: number }, message?: string) {
    const text = message ?? "";
    const module = g_currentModule;
    if (module !== undefined) {
      const { line, col } = posToLineCol(module, node.pos);
      this.message = `${module.filePath}:${line + 1}:${col + 1}: ${text}`;
    } else {
      this.message = text;
    }
  }
}

class FormattedCodegenError {
  value: CodegenError;

  constructor(formatted: string) {
    const err = new CodegenError({ pos: 0 }, formatted);
    err.message = formatted;
    this.value = err;
  }
}

function throwInternalCodegenError(message: string): never {
  throw new FormattedCodegenError(message).value;
}

function unsupported(node: { kind: string; pos: number }, what: string): never {
  throw new CodegenError({ pos: node.pos }, `unsupported ${what} (${node.kind})`);
}

class Scope {
  private current: ScopeFrame = new ScopeFrame();
  // Phase 1.5-3d: each linked frame holds optional narrowed types for already
  // declared identifiers; lookup prefers the innermost narrowing at-or-above
  // the binding's frame.
  // Phase 1.5-3.5e: arrow function bodies push a barrier so their identifier
  // lookups don't accidentally pierce through to outer locals — captures must
  // route through the env struct instead. The barrier records the minimum depth
  // below which `lookup` / `lookupBase` stop; capture analysis uses
  // `lookupAcrossBarrier` to look up outer types while the barrier is active.
  private barrierDepths: number[] = [];

  push(): void {
    const next = new ScopeFrame();
    next.parent = this.current;
    next.depth = this.current.depth + 1;
    this.current = next;
  }

  pop(): void {
    const parent = this.current.parent;
    if (parent !== undefined) {
      this.current = parent;
    }
  }

  pushBarrier(): void {
    this.barrierDepths.push(this.current.depth + 1);
  }

  popBarrier(): void {
    this.barrierDepths.pop();
  }

  // Phase 1.5-6e-4: every caller passes a Topaz node `{ pos }`. The
  // redeclaration error never fires in practice (recordAnonClass guarantees
  // unique anon-class field names), so it keeps its historical position-less
  // message; `anchor` is retained only as the diagnostic-anchor slot.
  declareBinding(name: string, bindingType: TopazType, isConst: boolean, anchor: { pos: number }): void {
    if (this.current.bindings.has(name)) {
      throw new CodegenError(anchor, `redeclaration of '${name}'`);
    }
    this.current.bindings.set(name, { type: bindingType, isConst });
  }

  lookup(name: string): Binding | undefined {
    const floor = this.barrierDepths.length > 0 ? this.barrierDepths[this.barrierDepths.length - 1] : 0;
    let frame: ScopeFrame | undefined = this.current;
    while (true) {
      const frameCursor = frame;
      if (frameCursor === undefined) break;
      const currentFrame: ScopeFrame = frameCursor;
      if (currentFrame.depth < floor) break;
      const b = currentFrame.bindings.get(name);
      if (b !== undefined) {
        let narrowFrame: ScopeFrame | undefined = this.current;
        while (true) {
          const narrowFrameCursor = narrowFrame;
          if (narrowFrameCursor === undefined) break;
          const currentNarrowFrame: ScopeFrame = narrowFrameCursor;
          if (currentNarrowFrame.depth < currentFrame.depth) break;
          const n = currentNarrowFrame.narrowings.get(name);
          if (n !== undefined) return { type: n, isConst: b.isConst };
          narrowFrame = currentNarrowFrame.parent;
        }
        return b;
      }
      frame = currentFrame.parent;
    }
    return undefined;
  }

  // Phase 1.5-3c: look up the original (un-narrowed) binding. Identifier
  // emission needs both: `lookup` for the logical type, `lookupBase` to know
  // the C representation (for scalar opt structs, narrowed reads append
  // `.value` while assignments target the whole struct).
  lookupBase(name: string): Binding | undefined {
    const floor = this.barrierDepths.length > 0 ? this.barrierDepths[this.barrierDepths.length - 1] : 0;
    let frame: ScopeFrame | undefined = this.current;
    while (true) {
      const frameCursor = frame;
      if (frameCursor === undefined) break;
      const currentFrame: ScopeFrame = frameCursor;
      if (currentFrame.depth < floor) break;
      const b = currentFrame.bindings.get(name);
      if (b !== undefined) return b;
      frame = currentFrame.parent;
    }
    return undefined;
  }

  // Phase 1.5-3.5e: outer-scope lookup that ignores any active barrier. Only
  // capture analysis uses this — body emission must go through `lookup` so
  // missing captures show up as "unknown identifier" rather than silently
  // referencing the outer variable.
  //
  // Phase 1.5-6 prep: narrowing-aware (mirrors `lookup`'s narrowing scan with
  // no barrier floor). A closure constructed under an active narrowing — e.g.
  // the IIFE arm of `cond ? a : (() => {...})()` where the ternary condition
  // narrowed an outer dunion — captures the *narrowed* type. This is sound
  // because captures copy the value at construction time, so the narrowing
  // that held there holds for the captured copy. The narrowed type then flows
  // consistently into the env struct field type, its initializer (via
  // `emitCapturedIdentifier`, already narrowing-aware), and `inferType` reads
  // through `captureContext`.
  lookupAcrossBarrier(name: string): Binding | undefined {
    let frame: ScopeFrame | undefined = this.current;
    while (true) {
      const frameCursor = frame;
      if (frameCursor === undefined) break;
      const currentFrame: ScopeFrame = frameCursor;
      const b = currentFrame.bindings.get(name);
      if (b !== undefined) {
        let narrowFrame: ScopeFrame | undefined = this.current;
        while (true) {
          const narrowFrameCursor = narrowFrame;
          if (narrowFrameCursor === undefined) break;
          const currentNarrowFrame: ScopeFrame = narrowFrameCursor;
          if (currentNarrowFrame.depth < currentFrame.depth) break;
          const n = currentNarrowFrame.narrowings.get(name);
          if (n !== undefined) return { type: n, isConst: b.isConst };
          narrowFrame = currentNarrowFrame.parent;
        }
        return b;
      }
      frame = currentFrame.parent;
    }
    return undefined;
  }

  // Phase 1.5-3d: install a narrowed type for an existing identifier on the
  // current top frame. Caller is responsible for pushing a new frame first
  // (typically via `push()` before entering an if-branch).
  narrow(name: string, narrowedType: TopazType): void {
    this.current.narrowings.set(name, narrowedType);
  }
}

// Phase 1.5-6 prep: `isOptional` flag tracks the syntactic `?` on a parameter
// (function decl / class method / ctor). The type already includes
// `T | undefined` (the `?` rewrites the type at collection time), so `type`
// is the same as a hand-written `param: T | undefined`. The flag only
// affects call-site arity: trailing optional positions may be omitted, and
// each missing slot auto-fills with the undefined literal of `type`. Two fn
// types are equal regardless of optional markers (they have the same callable
// surface — see `typeEq` for the `fn` case).
type ParamInfo = { name: string; type: TopazType; isOptional: boolean };

function requiredParamCount(params: Array<ParamInfo>): number {
  let n = params.length;
  while (n > 0 && params[n - 1].isOptional) n--;
  return n;
}

type MethodInfo = {
  params: ParamInfo[];
  returnType: TopazType;
  // Phase 1.5-6e-3: the Topaz method member (carries `name`, `body: BlockStmt`,
  // and `pos`/`end` for the scope.declare anchor). The declaring module's
  // SourceFile is read from the owning `ClassInfo.sf`.
  decl: ClassMethodMember;
};

type ClassInfo = {
  name: string;
  fields: Map<string, TopazType>;
  fieldOrder: string[];
  // Phase 1.5-6 prep: field initializers (`x: T = init;`) collected here at
  // collectField time, emitted at constructor body head before user statements
  // run. Both explicit and auto-generated zero-arg ctors consume this map.
  fieldInits: Map<string, Expr>;
  // Phase 1.5-6 prep: `decl: undefined` is an auto-synthesized zero-arg
  // constructor for classes that declare only initializer-bearing fields and
  // no explicit ctor (used pervasively by self-hosting code like the Emitter
  // class). The anchor for errors falls back to `info.decl`.
  // Phase 1.5-6e-3: the explicit ctor is the Topaz constructor member
  // (`ClassMethodMember` with `isCtor`), whose `body: BlockStmt` feeds the SCC.
  ctor: { params: ParamInfo[]; decl: ClassMethodMember | undefined } | undefined;
  methods: Map<string, MethodInfo>;
  implements: string[]; // interface names this class declares to implement
  // Phase 1.5-6 prep-optional-param: for anonymous classes synthesized from a
  // TypeLiteral, the names of fields declared with `f?: T` (their type is
  // already lifted to `T | undefined`; this set lets the object-literal
  // expression branch auto-fill missing optional fields with undefined).
  // Empty for user-declared classes.
  optionalFields: Set<string>;
  // Phase 1.5-6 prep: anonymous classes synthesized from a TypeLiteral (e.g.
  // `type Pair = { a: number; b: string }`) carry the TypeLiteralNode as the
  // anchor; they have no user ClassDeclaration. The field is only ever read as
  // an error anchor (passed to CodegenError via `typeErr`), so widening the
  // type is safe.
  // Phase 1.5-6e-1: the anon anchor is now the Topaz `TypeLiteralNode` (the
  // type machine walks Topaz AST). Error sites that read it go through
  // `typeErr`, which accepts both tsc nodes and Topaz `{ pos }` shapes.
  // Phase 1.5-6e-3: user classes carry the Topaz `ClassDecl`.
  decl: ClassDecl | TypeLiteralNode;
  // Phase 1.5-6e-3: declaring module's SourceFile, used as the ambient position
  // oracle (g_currentModule / currentTypeModule) while emitting ctor / method bodies and
  // field initializers. `undefined` for anon classes synthesized from a
  // TypeLiteral (no user body, so the SCC is never entered for them).
  sf: SourceModule | undefined;
};

// Phase 1.5-6e-3: `decl` dropped — it was only an error anchor and is never
// read (interface method diagnostics fire at collection time, anchored on the
// Topaz member node directly).
type InterfaceMethodSig = {
  params: ParamInfo[];
  returnType: TopazType;
};

type InterfaceInfo = {
  name: string;
  fields: Map<string, TopazType>;
  fieldOrder: string[];
  methods: Map<string, InterfaceMethodSig>;
  methodOrder: string[];
};

type FunctionSig = { params: ParamInfo[]; returnType: TopazType };

type TopLevelFunctionSig = {
  name: string;
  sf: SourceModule;
  cName: string;
  params: ParamInfo[];
  returnType: TopazType;
};

// Phase 1.4c-2: generic top-level functions. Type parameters live in the AST
// only; we don't resolve param/return types until a call site supplies concrete
// type arguments (explicit or inferred). One MonomorphInfo per realized
// (function, typeArgs) tuple.
type GenericFunctionInfo = {
  name: string;
  typeParams: string[];
  decl: FunctionDecl;
  // Phase 1.5-6e-3: declaring module's SourceFile for ambient position oracle
  // while resolving the monomorph signature / unifying call-site arguments.
  sf: SourceModule;
};

type MonomorphInfo = {
  mangled: string;
  origName: string;
  typeArgs: TopazType[];
  subs: Map<string, TopazType>;
  sig: FunctionSig;
  decl: FunctionDecl;
  // Phase 1.5-6e-3: declaring module's SourceFile for ambient position oracle
  // while emitting the monomorph body.
  sf: SourceModule;
};

// Phase 1.4c-3: generic top-level classes. Same shape as GenericFunctionInfo
// but for classes. Concrete monomorphs land in `this.classes` under the
// mangled name; the original `name` (e.g. "Box") is reserved in
// `genericClasses` so `new Box<...>` / `Box<T>` references can be resolved.
type GenericClassInfo = {
  name: string;
  typeParams: string[];
  decl: ClassDecl;
  // Phase 1.5-6e-3: declaring module's SourceFile for ambient position oracle
  // while collecting the monomorph's members.
  sf: SourceModule;
};

// Per realized (class, typeArgs) tuple. The ClassInfo under the mangled name
// in `this.classes` already carries the substituted fields/methods (so
// references to `T` in collected types are already concrete), but the method
// *bodies* still mention `T`, so we need `subs` again when emitting them.
type ClassMonomorphInfo = {
  mangled: string;
  origName: string;
  typeArgs: TopazType[];
  subs: Map<string, TopazType>;
};

type TypeAliasInfo = {
  body: TypeNode;
  sf: SourceModule;
  resolved?: TopazType;
  resolving: boolean;
  recursive: boolean;
};

type PreAllocatedAnon = {
  key: string;
  node: TypeLiteralNode;
  anonName: string;
  sf: SourceModule;
};

class AliasRecursionMarker {
  typeAliases: Map<string, TypeAliasInfo>;
  depFrom: Array<string>;
  depTo: Array<string>;
  index: Map<string, number> = new Map<string, number>();
  lowlink: Map<string, number> = new Map<string, number>();
  onStack: Set<string> = new Set<string>();
  stack: Array<string> = [];
  counter: number = 0;

  constructor(typeAliases: Map<string, TypeAliasInfo>, depFrom: Array<string>, depTo: Array<string>) {
    this.typeAliases = typeAliases;
    this.depFrom = depFrom;
    this.depTo = depTo;
  }

  markAll(): void {
    for (const name of this.typeAliases.keys()) {
      if (!this.index.has(name)) this.strongconnect(name);
    }
  }

  private numberAt(map: Map<string, number>, key: string): number {
    const value = map.get(key);
    if (value !== undefined) return value;
    throwInternalCodegenError(`markRecursiveAliases: missing number for '${key}'`);
  }

  private lowerLowlink(v: string, candidate: number): void {
    const current = this.numberAt(this.lowlink, v);
    if (candidate < current) this.lowlink.set(v, candidate);
  }

  private popStack(): string {
    const last = this.stack.length - 1;
    if (last < 0) throwInternalCodegenError("markRecursiveAliases: empty Tarjan stack");
    const value = this.stack[last];
    this.stack.pop();
    return value;
  }

  private hasSelfEdge(name: string): boolean {
    for (let edgeIndex = 0; edgeIndex < this.depFrom.length; edgeIndex++) {
      if (this.depFrom[edgeIndex] === name && this.depTo[edgeIndex] === name) return true;
    }
    return false;
  }

  private markRecursive(name: string): void {
    const info = this.typeAliases.get(name);
    if (info !== undefined) {
      info.recursive = true;
      return;
    }
    throwInternalCodegenError(`markRecursiveAliases: unknown alias '${name}'`);
  }

  private strongconnect(v: string): void {
    this.index.set(v, this.counter);
    this.lowlink.set(v, this.counter);
    this.counter = this.counter + 1;
    this.stack.push(v);
    this.onStack.add(v);

    for (let edgeIndex = 0; edgeIndex < this.depFrom.length; edgeIndex++) {
      if (this.depFrom[edgeIndex] === v) {
        const w = this.depTo[edgeIndex];
        if (!this.index.has(w)) {
          this.strongconnect(w);
          this.lowerLowlink(v, this.numberAt(this.lowlink, w));
        } else if (this.onStack.has(w)) {
          this.lowerLowlink(v, this.numberAt(this.index, w));
        }
      }
    }

    if (this.numberAt(this.lowlink, v) === this.numberAt(this.index, v)) {
      const members: Array<string> = [];
      let memberCount = 0;
      let selfEdge = false;
      while (true) {
        const w = this.popStack();
        this.onStack.delete(w);
        members.push(w);
        memberCount = memberCount + 1;
        if (this.hasSelfEdge(w)) selfEdge = true;
        if (w === v) break;
      }
      if (memberCount > 1 || selfEdge) {
        for (const name of members) {
          this.markRecursive(name);
        }
      }
    }
  }
}

type TopLevelEntry = { stmt: Stmt; sf: SourceModule; isRoot: boolean };

type SwitchGroup = { conds: Array<Expr>; body: Array<Stmt> };

type IterNextInfo = {
  containerType: TopazType;
  source: string;
  elemType: TopazType;
  field: string;
};

// Mangling: stripped of the `topaz_` prefix, joined with `__`. Class/iface
// names already carry a `class_` / `iface_` prefix, so the resulting C
// identifier is unambiguous (e.g. `identity__number`, `pair__class_Box`,
// `first__array_class_Box`).
function mangleTypeArg(t: TopazType): string {
  return typeIdent(t).slice("topaz_".length);
}

function mangleMonomorph(origName: string, args: Array<TopazType>): string {
  return `${origName}__${args.map(mangleTypeArg).join("__")}`;
}

function lowerHexDigit(n: number): string {
  if (n < 10) return String.fromCharCode(48 + n);
  return String.fromCharCode(87 + n);
}

function lowerHexNumber(n: number): string {
  if (n === 0) return "0";
  let value = n;
  let out = "";
  while (value > 0) {
    const digit = value % 16;
    out = `${lowerHexDigit(digit)}${out}`;
    value = (value - digit) / 16;
  }
  return out;
}

function lowerHexByte2(n: number): string {
  const lo = n % 16;
  const hi = (n - lo) / 16;
  return `${lowerHexDigit(hi)}${lowerHexDigit(lo)}`;
}

function cIdentFragment(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 95
    ) {
      out += String.fromCharCode(code);
    } else {
      out += `_${lowerHexNumber(code)}_`;
    }
  }
  if (out.length === 0) return "_";
  const first = out.charCodeAt(0);
  if (first >= 48 && first <= 57) return `_${out}`;
  return out;
}

class Emitter {
  private scope: Scope = new Scope();
  private moduleIdModules: Array<SourceModule> = [];
  private moduleIdValues: Array<string> = [];
  private functionSigs: Array<TopLevelFunctionSig> = [];
  private functionSigDecls: Array<FunctionDecl> = [];
  private classes: Map<string, ClassInfo> = new Map<string, ClassInfo>();
  private interfaces: Map<string, InterfaceInfo> = new Map<string, InterfaceInfo>();
  private currentClass: string | undefined = undefined;
  private currentReturnType: TopazType | undefined = undefined;
  // Phase 1.5-6i prep: enclosing-construct stack for `continue` validation.
  // Topaz nodes carry no `.parent`, so we maintain the nearest loop / switch
  // context explicitly with linked frames. A nested arrow is a function
  // boundary and resets the stack (save / clear / restore).
  private loopCtx: LoopCtxFrame | undefined = undefined;
  // Phase 1.5-X: number of `try` frames currently live on the C stack within
  // the function being emitted (incremented only around a try *body*, not the
  // catch body — topaz_throw / the normal-path pop already removed the frame by
  // the time the catch body runs). A `return` inside a try body emits this many
  // `topaz_try_pop()` calls before the C return so the frame stack stays
  // balanced. Reset to 0 at every function boundary (nested fn/arrow returns
  // don't cross the outer try).
  private liveTryFrames: number = 0;
  private switchCounter: number = 0;
  private tmpCounter: number = 0;
  // Phase 1.4c-1a: each Array<class>/Array<interface> referenced in user code
  // gets a TOPAZ_ARRAY_DEFINE() expansion in the generated C, since the runtime
  // header only preexpands the scalar monomorphs. Keyed by typeKey() so we
  // de-duplicate structurally (TopazType objects compare by reference).
  private arrayMonomorphs: Map<string, TopazType> = new Map<string, TopazType>();
  // Phase 1.5-3.5g-array-fn: Array<fn> monomorphs live in a separate slot
  // because the TOPAZ_ARRAY_DEFINE expansion references the fn typedef, which
  // is itself emitted after the regular container slot. Splitting them keeps
  // the existing slot ordering invariants intact (container monomorphs ->
  // arrayJoinHelpers -> iter -> fn typedef -> Array<fn> container).
  private arrayFnMonomorphs: Map<string, TopazType> = new Map<string, TopazType>();
  // Phase 1.5-3.5f-join: Array monomorphs that need a per-(elem) `_join` helper
  // emitted. Keyed by typeKey() of the Array<elem> type. Helpers are generated
  // for scalar elems (number / boolean / string) only; class / iface / nested
  // container elems are rejected at the call site so they never land here.
  private arrayJoinMonomorphs: Map<string, TopazType> = new Map<string, TopazType>();
  // Phase 1.4c-1b: same idea for Map<K, class|interface> and Set<class|interface>.
  // Maps are tracked by full (K, V) tuple so we get one expansion per combo.
  private mapMonomorphs: Map<string, TopazType> = new Map<string, TopazType>();
  private setMonomorphs: Map<string, TopazType> = new Map<string, TopazType>();
  // Phase 1.5-3e: discriminated class unions like `Circle | Square` are
  // emitted as a fat pointer `{ topaz_string kind; void *data; }`. Recorded
  // when typeFromAnnotation lowers the union, expanded in the container slot.
  private dunionMonomorphs: Map<string, TopazType> = new Map<string, TopazType>();
  // Phase 1.4c-2: generic function declarations (registered but not signed
  // until a call site supplies type arguments), realized monomorphs keyed by
  // mangled name, and a worklist for monomorphs whose body still needs to be
  // emitted. typeParamScope binds the active substitution while emitting a
  // monomorph body (or while resolving its signature).
  private genericFunctions: Map<string, GenericFunctionInfo> = new Map<string, GenericFunctionInfo>();
  private genericMonomorphs: Map<string, MonomorphInfo> = new Map<string, MonomorphInfo>();
  private genericWorklist: string[] = [];
  private typeParamScope: Map<string, TopazType> | undefined = undefined;
  // Phase 1.4c-3: generic class declarations and their realized monomorphs.
  // The mangled name (e.g. "Box__number") is the key into `this.classes` for
  // the substituted ClassInfo; the worklist accumulates monomorphs whose
  // typedef/struct/methods still need to be emitted in the late slots.
  private genericClasses: Map<string, GenericClassInfo> = new Map<string, GenericClassInfo>();
  private classMonomorphs: Map<string, ClassMonomorphInfo> = new Map<string, ClassMonomorphInfo>();
  private classMonomorphWorklist: string[] = [];
  // Phase 1.5-6 prep: `type X = T;` declarations. The RHS is parsed lazily on
  // first reference so a forward-declared alias works; `resolving` flips on
  // during evaluation to catch self-referential cycles (`type A = B; type B = A`).
  // Aliases are erased — they introduce no value-level binding and produce no C
  // identifier — so typeFromAnnotation simply substitutes the resolved TopazType
  // into the call site.
  // Phase 1.5-6 prep #14: aliases that participate in a recursive SCC (computed
  // syntactically from alias-to-alias references) get their nested
  // TypeLiteralNodes pre-allocated into `preAllocatedAnons` so resolution can
  // short-circuit the recordAnonClass dedupe path and reference the eventual
  // anon class type before its fields are fully populated. Non-recursive aliases
  // (the common case — `Pair` / `Pair2` etc.) still flow through the lazy
  // structural-dedupe path so identical shapes collapse to one C struct.
  // Phase 1.5-6e-3: the type machine reads `body` (Topaz `TypeNode`, taken from
  // the converted `TypeAliasDecl.body`) and `sf` (for error positions when
  // resolving the body, which may live in a different module than the reference
  // site). The original `decl` anchor was never read and is dropped.
  private typeAliases: Map<string, TypeAliasInfo> = new Map<string, TypeAliasInfo>();
  private moduleGlobalTypes: Map<string, TopazType> = new Map<string, TopazType>();
  // Phase 1.5-6i prep: pre-allocated recursive-alias anonymous classes keyed by
  // module-local source span. This preserves TypeLiteralNode identity without
  // requiring a user-visible Map<class, V> monomorph.
  private preAllocatedAnons: Array<PreAllocatedAnon> = [];
  // Phase 1.5-6e-1: the SourceFile of the Topaz type tree currently being
  // lowered by `typeFromAnnotation` (and the helpers it calls). Set/restored at
  // every `typeFromAnnotation` entry so `typeErr` can turn a Topaz node's `pos`
  // into `file:line:col`. Undefined outside type-machine execution.
  private currentTypeModule: SourceModule | undefined = undefined;
  // Phase 1.5-3.5e: each arrow expression lowers to (a) a static C function
  // `__topaz_arrow_<N>` and (b) optionally an env struct `__topaz_env_<N>`
  // for its captures. arrowDefLines accumulates both halves in source order
  // and is spliced into the arrowDefSlot at end of emit(). captureContext is
  // active only while emitting an arrow body — body identifier lookups
  // consult it after scope.lookup fails.
  private arrowCounter: number = 0;
  private arrowFwdLines: Array<string> = [];
  private arrowDefLines: Array<string> = [];
  private fnValueWrappers: Set<string> = new Set<string>();
  private captureContext:
    | { envType: string; envIsEmpty: boolean; captures: Map<string, TopazType> }
    | undefined = undefined;

  private recordArrayMonomorph(t: TopazType): void {
    if (!isArrayType(t)) return;
    const elem = arrayElem(t)!;
    if (isScalarType(elem)) return; // runtime.h preexpands these
    if (elem.kind === "fn") {
      // Phase 1.5-3.5g-array-fn: defer to the post-fn-typedef slot. The
      // underlying fn typedef must also be emitted so the macro expansion
      // resolves `topaz_fn_<...>`.
      this.recordFnMonomorph(elem);
      this.arrayFnMonomorphs.set(typeKey(t), t);
      return;
    }
    this.arrayMonomorphs.set(typeKey(t), t);
  }

  // Phase 1.5-3.5f-join: register an Array<scalar> monomorph for `_join`
  // helper emission. Helpers are emitted per (Array, elem) so chaining and
  // multiple `.join` call sites share one definition. Only scalar elems land
  // here — class / iface / nested container elems are rejected at the call
  // site (format policy is undefined).
  private recordArrayJoinMonomorph(t: TopazType): void {
    if (!isArrayType(t)) return;
    const elem = arrayElem(t)!;
    if (elem.kind !== "number" && elem.kind !== "boolean" && elem.kind !== "string") return;
    this.arrayJoinMonomorphs.set(typeKey(t), t);
  }

  private recordMapMonomorph(t: TopazType): void {
    if (!isMapType(t)) return;
    if (isScalarType(mapValue(t)!)) return; // runtime.h preexpands scalar K×V combos
    this.mapMonomorphs.set(typeKey(t), t);
  }

  private recordSetMonomorph(t: TopazType): void {
    if (!isSetType(t)) return;
    if (isScalarType(setElem(t)!)) return; // runtime.h preexpands scalar element sets
    this.setMonomorphs.set(typeKey(t), t);
  }

  // Phase 1.5-6 prep: anonymous classes synthesized from TypeLiteral
  // annotations (e.g. `type Pair = { a: number; b: string }`). Two
  // TypeLiterals with the same shape (regardless of declaration order)
  // collapse to one C struct: the canonical key is the alphabetically-sorted
  // `<name>:<typeIdent>` list. The mangle name itself is a sequential index
  // (`anon_0`, `anon_1`, ...) — structural mangling with delimiters can be
  // ambiguous when field names contain underscores. The synthesized ClassInfo
  // carries a positional all-fields constructor (`decl: undefined` + params
  // in sorted order); emitConstructorDefinition has a branch to fill that
  // ctor body with per-param `this->f = f;` writes.
  private anonClassByKey: Map<string, string> = new Map<string, string>(); // canonical key -> mangled name
  private anonClassCounter: number = 0;
  private recordAnonClass(
    fields: Map<string, TopazType>,
    optionalFields: Set<string>,
    anchor: TypeLiteralNode,
  ): string {
    // Optional markers participate in the canonical key so `{ a: number }` and
    // `{ a?: number }` are *not* deduped to the same anon class (the latter has
    // `a: number | undefined`, so field type already differs — but make it
    // explicit so future field-type changes can't accidentally collapse them).
    const sorted: Array<string> = [];
    for (const f of fields.keys()) {
      sorted.push(f);
      let i = sorted.length - 1;
      while (i > 0 && typeKeyLess(f, sorted[i - 1])) {
        sorted[i] = sorted[i - 1];
        i = i - 1;
      }
      sorted[i] = f;
    }
    let key = "";
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      const fieldTypeMaybe = fields.get(f);
      if (fieldTypeMaybe !== undefined) {
        const fieldType: TopazType = fieldTypeMaybe;
        const opt = optionalFields.has(f) ? "?" : "";
        const part = `${f}${opt}:${typeIdent(fieldType)}`;
        if (i === 0) key = part;
        else key = `${key},${part}`;
      } else {
        throwInternalCodegenError("recordAnonClass: missing field type");
      }
    }
    const existing = this.anonClassByKey.get(key);
    if (existing !== undefined) return existing;
    const mangled = `anon_${this.anonClassCounter++}`;
    this.anonClassByKey.set(key, mangled);
    const params: ParamInfo[] = [];
    const fieldsOrdered = new Map<string, TopazType>();
    for (const f of sorted) {
      const fieldTypeMaybe = fields.get(f);
      if (fieldTypeMaybe !== undefined) {
        const fieldType: TopazType = fieldTypeMaybe;
        params.push({
          name: f,
          type: fieldType,
          isOptional: optionalFields.has(f),
        });
        fieldsOrdered.set(f, fieldType);
      } else {
        throwInternalCodegenError("recordAnonClass: missing field type");
      }
    }
    const optionalFieldsCopy = new Set<string>();
    for (const f of optionalFields) {
      optionalFieldsCopy.add(f);
    }
    const info: ClassInfo = {
      name: mangled,
      fields: fieldsOrdered,
      fieldOrder: sorted,
      fieldInits: new Map(),
      ctor: { params, decl: undefined },
      methods: new Map(),
      implements: [],
      optionalFields: optionalFieldsCopy,
      decl: anchor,
      // Anon classes carry no user ctor / method body, so `sf` is only a best-
      // effort anchor; the ambient type-resolution SourceFile is the closest fit.
      sf: this.currentTypeModule,
    };
    this.classes.set(mangled, info);
    // Reuse the generic-class monomorph worklist so the struct / signature /
    // definition lands in the same emit slots used for `Box<number>` etc.
    // typeArgs / subs are empty (no type params), but the ClassMonomorphInfo
    // entry is required by the worklist drain loop.
    this.classMonomorphs.set(mangled, {
      mangled,
      origName: mangled,
      typeArgs: [],
      subs: new Map(),
    });
    this.classMonomorphWorklist.push(mangled);
    return mangled;
  }

  private isAnonClassName(name: string): boolean {
    if (!name.startsWith("anon_")) return false;
    if (name.length <= 5) return false;
    for (let i = 5; i < name.length; i++) {
      const ch = name.charCodeAt(i);
      if (ch < 48 || ch > 57) return false;
    }
    return true;
  }

  private recordDunionMonomorph(t: TopazType): void {
    if (t.kind !== "dunion") return;
    this.dunionMonomorphs.set(typeKey(t), t);
  }

  // Phase 1.5-3.5e: each distinct fn signature seen in user code (annotation
  // or arrow expression) gets a typedef + struct expansion emitted in the
  // fn-typedef slot. Nested fn params / returns must be registered before the
  // outer fn so the outer typedef can name already-complete inner structs.
  private fnMonomorphs: Map<string, TopazType> = new Map<string, TopazType>();
  private recordFnMonomorph(t: TopazType): void {
    if (t.kind !== "fn") return;
    for (const p of t.params) {
      this.recordFnMonomorph(p.type);
    }
    this.recordFnMonomorph(t.returnType);
    this.fnMonomorphs.set(typeKey(t), t);
  }

  // Phase 1.5-3.5g-iterator: `Iterator<T>` values are produced by
  // `.values()` / `.keys()` on Map / Set. Three layers of monomorph need to
  // be emitted:
  //   - per-elem `topaz_iter_<elem>` typedef (the fat pointer struct itself)
  //   - per-container `topaz_iter_state_<container>` state struct
  //   - per-(source, container) `_next` function
  // Map.values() and Map.keys() share the state struct but have different
  // _next functions; Set.values() and Set.keys() share both (Set yields the
  // element for either, matching JS semantics).
  private iterTypedefMonomorphs: Map<string, TopazType> = new Map<string, TopazType>();
  private iterStateMonomorphs: Map<string, TopazType> = new Map<string, TopazType>();
  private iterNextMonomorphs: Map<string, IterNextInfo> = new Map<string, IterNextInfo>();
  private recordIterMonomorph(
    elemType: TopazType,
    containerType: TopazType,
    source: string,
    field: string,
  ): void {
    // Containers themselves need their _new / _set / _add / etc helpers, so
    // make sure the underlying monomorph is registered first.
    if (isMapType(containerType)) this.recordMapMonomorph(containerType);
    if (isSetType(containerType)) this.recordSetMonomorph(containerType);
    this.iterTypedefMonomorphs.set(typeKey(elemType), elemType);
    this.iterStateMonomorphs.set(typeKey(containerType), containerType);
    const sourceKey = `${source}__${typeKey(containerType)}`;
    this.iterNextMonomorphs.set(sourceKey, { containerType, source, elemType, field });
  }

  // Phase 1.5-3e: union of class types with shared `kind: "literal"`
  // discriminator collapses into a `dunion`. Returns undefined if the union
  // is not a discriminated class union (caller falls back to general union).
  private tryMakeDiscriminatedUnion(
    variants: Array<TopazType>,
    anchor: { pos: number },
  ): TopazType | undefined {
    if (variants.length < 2) return undefined;
    for (const v of variants) {
      if (v.kind !== "class") return undefined;
    }
    const discriminator = "kind";
    const classNames: string[] = [];
    const seenLiterals = new Set<string>();
    for (const v of variants) {
      if (v.kind !== "class") return undefined;
      const name = v.name;
      const clsMaybe = this.classes.get(name);
      if (clsMaybe === undefined) return undefined;
      const cls: ClassInfo = clsMaybe;
      const fieldMaybe = cls.fields.get(discriminator);
      if (fieldMaybe === undefined) return undefined;
      if (fieldMaybe.kind !== "string_literal") return undefined;
      const field = fieldMaybe;
      if (seenLiterals.has(field.value)) {
        let seen = "";
        for (const literal of seenLiterals) {
          if (seen.length === 0) seen = literal;
          else seen = `${seen}', '${literal}`;
        }
        throw this.typeErr(
          anchor,
          `discriminated union: classes '${seen}' and '${name}' both use kind=\"${field.value}\"`,
        );
      }
      seenLiterals.add(field.value);
      classNames.push(name);
      let i = classNames.length - 1;
      while (i > 0 && typeKeyLess(name, classNames[i - 1])) {
        classNames[i] = classNames[i - 1];
        i = i - 1;
      }
      classNames[i] = name;
    }
    const d: TopazType = { kind: "dunion", variants: classNames, discriminator };
    this.recordDunionMonomorph(d);
    return d;
  }

  // Lookup the string literal value that class `cls` assigns to its
  // discriminator field. Validated at field collection (string_literal type).
  private dunionLiteralFor(unionType: TopazType, cls: string): string {
    if (unionType.kind === "dunion") {
      const discriminator = unionType.discriminator;
      const infoMaybe = this.classes.get(cls);
      if (infoMaybe !== undefined) {
        const info: ClassInfo = infoMaybe;
        const fieldMaybe = info.fields.get(discriminator);
        if (fieldMaybe !== undefined) {
          if (fieldMaybe.kind === "string_literal") {
            return fieldMaybe.value;
          }
        }
      } else {
        throwInternalCodegenError(`dunionLiteralFor: unknown class '${cls}'`);
      }
      throwInternalCodegenError(`dunionLiteralFor: class '${cls}' has no string-literal '${discriminator}'`);
    }
    throwInternalCodegenError("dunionLiteralFor: not a dunion");
  }

  // Phase 1.5-6 prep #18: a dunion field shared by every variant with one
  // identical type is readable without narrowing (TS common-property access).
  // Returns the shared field type, or undefined when the field is missing on
  // some variant, differs in type across variants, or is the discriminator
  // (handled inline as the fat struct's own `kind` slot).
  private dunionCommonFieldType(
    t: DunionType,
    field: string,
  ): TopazType | undefined {
    if (field === t.discriminator) return undefined;
    let hasResult = false;
    let result: TopazType = T_UNDEFINED;
    for (const cname of t.variants) {
      const clsMaybe = this.classes.get(cname);
      if (clsMaybe === undefined) return undefined;
      const cls: ClassInfo = clsMaybe;
      const ftMaybe = cls.fields.get(field);
      if (ftMaybe === undefined) return undefined;
      const ft: TopazType = ftMaybe;
      if (!hasResult) {
        result = ft;
        hasResult = true;
      } else {
        if (!typeEq(result, ft)) return undefined;
      }
    }
    if (hasResult) return result;
    return undefined;
  }

  // Phase 1.5-6 prep #18: read a common field off a dunion value. The fat
  // struct's `.data` points at one of the variant class instances, each with
  // its own field layout, so we snapshot `.data` once into a tmp and pick the
  // right cast by comparing the variant tag (offset 0, the slot `instanceof`
  // reads). The final variant is the no-check fall-through since the type
  // guarantees `.data` wraps one of the variants.
  private emitDunionCommonFieldAccess(
    expr: PropAccessExpr,
    t: DunionType,
  ): string {
    const field = expr.name;
    const id = this.tmpCounter++;
    const tmp = `__topaz_dcf_${id}`;
    const data = `(${this.emitExpression(expr.receiver)}).data`;
    let chain = "";
    for (let i = 0; i < t.variants.length; i++) {
      const cname = t.variants[i];
      const read = `((topaz_class_${cname} *)${tmp})->${field}`;
      if (i === t.variants.length - 1) {
        chain += read;
      } else {
        chain += `*((const char * const *)${tmp}) == &topaz_class_${cname}_tag ? ${read} : `;
      }
    }
    return `({ void *${tmp} = ${data}; ${chain}; })`;
  }

  // Phase 1.5-6 prep #14: syntactically collect alias-to-alias references
  // reachable from `node`. Only references whose name is currently registered
  // as a type alias are tracked — references to classes / interfaces /
  // built-ins / type params are ignored (they don't participate in alias
  // cycles). The walk covers every TypeNode shape the codegen accepts so the
  // graph is faithful to what typeFromAnnotation would actually traverse.
  private collectAliasRefs(node: TypeNode, out: Set<string>): void {
    if (node.kind === "type_union") {
      for (const t of node.variants) this.collectAliasRefs(t, out);
      return;
    }
    if (node.kind === "type_array") {
      this.collectAliasRefs(node.elem, out);
      return;
    }
    if (node.kind === "type_ref") {
      // Primitive keyword types (`number` etc.) also lower to `type_ref`, but
      // they're never registered as aliases so the `.has` guard skips them.
      if (this.typeAliases.has(node.name)) out.add(node.name);
      for (const t of node.typeArgs) this.collectAliasRefs(t, out);
      return;
    }
    if (node.kind === "type_literal") {
      // Mirror the pre-migration walk: only field-member types feed the alias
      // graph (method-signature param / return types were not traversed).
      for (const m of node.members) {
        if (m.kind === "type_lit_field") this.collectAliasRefs(m.type, out);
      }
      return;
    }
    if (node.kind === "type_fn") {
      for (const p of node.params) this.collectAliasRefs(p.type, out);
      this.collectAliasRefs(node.returnType, out);
      return;
    }
    // Other shapes (string / number literal types, void / unknown) carry no
    // alias references.
  }

  // Phase 1.5-6 prep #14: Tarjan SCC on the alias dependency graph. Any alias
  // sitting in an SCC of size > 1 — or a singleton SCC that has a self-edge —
  // is marked recursive and gets the pre-allocation treatment below. Strict
  // self-loops via non-TypeLiteralNode bodies (`type A = A`) still hit the
  // existing `resolving` cycle check; pre-allocation only changes behavior
  // when the body (or a nested type position) is a TypeLiteralNode.
  private markRecursiveAliases(): void {
    if (this.typeAliases.size === 0) return;
    const depFrom: string[] = [];
    const depTo: string[] = [];
    for (const [name, info] of this.typeAliases.entries()) {
      const out = new Set<string>();
      this.collectAliasRefs(info.body, out);
      for (const to of out) {
        depFrom.push(name);
        depTo.push(to);
      }
    }
    new AliasRecursionMarker(this.typeAliases, depFrom, depTo).markAll();
  }

  private preAllocatedAnonKey(node: TypeLiteralNode, sf: SourceModule): string {
    return `${sf.filePath}:${node.pos}:${node.end}`;
  }

  private findPreAllocatedAnonByKey(key: string): PreAllocatedAnon | undefined {
    for (const entry of this.preAllocatedAnons) {
      if (entry.key === key) return entry;
    }
    return undefined;
  }

  private findPreAllocatedAnon(node: TypeLiteralNode, sf: SourceModule): PreAllocatedAnon | undefined {
    return this.findPreAllocatedAnonByKey(this.preAllocatedAnonKey(node, sf));
  }

  // Phase 1.5-6 prep #14: walk every TypeLiteralNode reachable from a recursive
  // alias body and reserve an anon class name + placeholder ClassInfo. Skipping
  // structural dedupe is intentional here: dedupe would require canonical keys
  // (and therefore resolved field types) that we don't have until field-fill
  // runs. Non-recursive aliases continue to dedupe via the regular
  // recordAnonClass path so `type Pair = { a; b }` and `type Pair2 = { a; b }`
  // still collapse to one C struct.
  private preAllocateRecursiveAnonVisit(node: TypeNode, sf: SourceModule): void {
    if (node.kind === "type_union") {
      for (const t of node.variants) this.preAllocateRecursiveAnonVisit(t, sf);
      return;
    }
    if (node.kind === "type_array") {
      this.preAllocateRecursiveAnonVisit(node.elem, sf);
      return;
    }
    if (node.kind === "type_ref") {
      for (const t of node.typeArgs) this.preAllocateRecursiveAnonVisit(t, sf);
      return;
    }
    if (node.kind === "type_literal") {
      const key = this.preAllocatedAnonKey(node, sf);
      if (this.findPreAllocatedAnonByKey(key) === undefined) {
        const mangled = `anon_${this.anonClassCounter++}`;
        this.preAllocatedAnons.push({ key, node, anonName: mangled, sf });
        const info: ClassInfo = {
          name: mangled,
          fields: new Map(),
          fieldOrder: [],
          fieldInits: new Map(),
          ctor: { params: [], decl: undefined },
          methods: new Map(),
          implements: [],
          optionalFields: new Set(),
          decl: node,
          sf,
        };
        this.classes.set(mangled, info);
        this.classMonomorphs.set(mangled, {
          mangled,
          origName: mangled,
          typeArgs: [],
          subs: new Map(),
        });
        this.classMonomorphWorklist.push(mangled);
      }
      // Mirror the pre-migration walk: only field-member types are visited.
      for (const m of node.members) {
        if (m.kind === "type_lit_field") this.preAllocateRecursiveAnonVisit(m.type, sf);
      }
      return;
    }
    if (node.kind === "type_fn") {
      for (const p of node.params) this.preAllocateRecursiveAnonVisit(p.type, sf);
      this.preAllocateRecursiveAnonVisit(node.returnType, sf);
      return;
    }
  }

  private preAllocateRecursiveAnons(): void {
    for (const info of this.typeAliases.values()) {
      if (!info.recursive) continue;
      const body = info.body;
      this.preAllocateRecursiveAnonVisit(body, info.sf);
      if (body.kind === "type_literal") {
        const entry = this.findPreAllocatedAnon(body, info.sf);
        if (entry !== undefined) {
          info.resolved = classOf(entry.anonName);
        } else {
          throwInternalCodegenError("preAllocateRecursiveAnons: missing root anon allocation");
        }
      }
    }
  }

  // Phase 1.5-6 prep #14: two-phase populate the pre-allocated anon classes.
  // Sub-pass A sets only string-literal-typed fields (`kind: "literal"`) so
  // tryMakeDiscriminatedUnion can find a discriminator even mid-resolution of
  // a sibling alias. Sub-pass B then fully resolves every member type via
  // typeFromAnnotation; references back to other pre-allocated anons short-
  // circuit through preAllocatedAnons. Validation (duplicate property name,
  // empty `{}`, modifier filter, method signature reject, etc.) is performed
  // here in sub-pass B — moving it up from the inline TypeLiteralNode branch
  // is fine because the pre-allocated entries cover exactly the same nodes.
  private fillPreAllocatedAnonFields(): void {
    // Sub-pass A: populate string-literal discriminator fields. No recursion
    // into typeFromAnnotation — direct AST inspection only. Non-field members
    // and non-string-literal field types are skipped here; sub-pass B performs
    // the full validation.
    for (const entry of this.preAllocatedAnons) {
      const literalNode = entry.node;
      const cls = this.classes.get(entry.anonName)!;
      for (const m of literalNode.members) {
        if (m.kind !== "type_lit_field") continue;
        const memberType = m.type;
        if (memberType.kind === "type_str_lit") {
          const v = memberType.value;
          let ascii = true;
          for (let i = 0; i < v.length; i++) {
            if (v.charCodeAt(i) > 0x7e) { ascii = false; break; }
          }
          if (!ascii) continue;
          cls.fields.set(m.name, { kind: "string_literal", value: v });
        }
      }
    }

    // Sub-pass B: fully resolve fields. Mirrors the validation in the inline
    // TypeLiteralNode branch of typeFromAnnotation. `currentTypeModule` is set per
    // literal node so the validation / typeFromAnnotation diagnostics position
    // against the module the recursive alias was declared in.
    for (const entry of this.preAllocatedAnons) {
      const literalNode = entry.node;
      const cls = this.classes.get(entry.anonName)!;
      const sf = entry.sf;
      const savedSf = this.currentTypeModule;
      this.currentTypeModule = sf;
      const literalAnchor: { pos: number } = { pos: literalNode.pos };
      if (literalNode.members.length === 0) {
        throw this.typeErr(literalAnchor, "empty object literal type `{}` is unsupported (Phase 1.5-6 prep)");
      }
      const fields = new Map<string, TopazType>();
      const optionalFields = new Set<string>();
      for (const m of literalNode.members) {
        const memberAnchor: { pos: number } = { pos: m.pos };
        if (m.kind !== "type_lit_field") {
          throw this.typeErr(memberAnchor, "object literal type only supports plain property signatures (Phase 1.5-6 prep)");
        }
        const fname = m.name;
        if (fields.has(fname)) {
          throw this.typeErr(memberAnchor, `duplicate property '${fname}' in object literal type`);
        }
        const annot = this.typeFromAnnotation(m.type, memberAnchor, sf);
        this.assertNotVoid(annot, memberAnchor, "object literal type property");
        const fty = m.isOptional ? makeUnion([annot, T_UNDEFINED]) : annot;
        if (m.isOptional) optionalFields.add(fname);
        fields.set(fname, fty);
      }
      const sorted: Array<string> = [];
      for (const f of fields.keys()) {
        sorted.push(f);
        let i = sorted.length - 1;
        while (i > 0 && typeKeyLess(f, sorted[i - 1])) {
          sorted[i] = sorted[i - 1];
          i = i - 1;
        }
        sorted[i] = f;
      }
      const fieldsOrdered = new Map<string, TopazType>();
      const params: ParamInfo[] = [];
      for (const f of sorted) {
        const fieldTypeMaybe = fields.get(f);
        if (fieldTypeMaybe !== undefined) {
          const fieldType: TopazType = fieldTypeMaybe;
          fieldsOrdered.set(f, fieldType);
          params.push({
            name: f,
            type: fieldType,
            isOptional: optionalFields.has(f),
          });
        } else {
          throwInternalCodegenError("fillPreAllocatedAnonFields: missing field type");
        }
      }
      cls.fields = fieldsOrdered;
      cls.fieldOrder = sorted;
      cls.optionalFields = optionalFields;
      cls.ctor = { params, decl: undefined };
      this.currentTypeModule = savedSf;
    }
  }

  // Flatten every Topaz `SourceModule`'s items into the per-kind declaration
  // buckets the prepass walks. Imports are ignored (all modules share one
  // global namespace, so name
  // imports carry no codegen meaning). Module-level statements land in
  // `topLevel`: the root module accepts any statement (they become `main()`
  // body); a non-root module accepts hoistable scalar-literal `const` and
  // annotated module-global var declarations (file-scope decl + main init).
  // Each entry is paired with the declaring `sf` so later passes can set the
  // ambient position oracle (Topaz nodes carry `pos`/`end` but not their file).
  private extractDecls(sourceFiles: Array<SourceModule>): {
    functions: Array<{ decl: FunctionDecl; sf: SourceModule }>;
    classes: Array<{ decl: ClassDecl; sf: SourceModule }>;
    interfaces: Array<{ decl: InterfaceDecl; sf: SourceModule }>;
    aliases: Array<{ decl: TypeAliasDecl; sf: SourceModule }>;
    topLevel: Array<TopLevelEntry>;
  } {
    const functions: Array<{ decl: FunctionDecl; sf: SourceModule }> = [];
    const classes: Array<{ decl: ClassDecl; sf: SourceModule }> = [];
    const interfaces: Array<{ decl: InterfaceDecl; sf: SourceModule }> = [];
    const aliases: Array<{ decl: TypeAliasDecl; sf: SourceModule }> = [];
    const topLevel: Array<TopLevelEntry> = [];
    const rootSf = sourceFiles[sourceFiles.length - 1];
    for (const sf of sourceFiles) {
      const isRoot = sf === rootSf;
      const module: SourceModule = sf;
      for (const item of module.items) {
        if (item.kind === "module_decl") {
          const d: Decl = item.decl;
          switch (d.kind) {
            case "import_decl":
              break;
            case "function_decl":
              functions.push({ decl: d, sf });
              break;
            case "class_decl":
              classes.push({ decl: d, sf });
              break;
            case "interface_decl":
              interfaces.push({ decl: d, sf });
              break;
            case "type_alias_decl":
              aliases.push({ decl: d, sf });
              break;
          }
          continue;
        }
        const stmt = item.stmt;
        if (isRoot) {
          topLevel.push({ stmt, sf, isRoot });
          continue;
        }
        // Phase 1.5-6 prep #13 + 6i: a non-root module may carry file-scope
        // globals that are visible to emitted functions. Everything else stays
        // rejected so imported modules cannot run arbitrary statement bodies.
        this.withSfVoid(sf, () => {
          if (this.canHoistModuleConst(stmt, sf) || this.canModuleGlobalVar(stmt)) {
            topLevel.push({ stmt, sf, isRoot });
          } else {
            const stmtAnchor: { pos: number } = { pos: stmt.pos };
            throw new CodegenError(
              stmtAnchor,
              "non-root module may only contain import / class / interface / function / type alias declarations, hoistable scalar-literal `const`, or annotated module-global variables",
            );
          }
        });
      }
    }
    return { functions, classes, interfaces, aliases, topLevel };
  }

  private moduleId(sf: SourceModule): string {
    for (let i = 0; i < this.moduleIdModules.length; i++) {
      if (this.moduleIdModules[i] === sf) return this.moduleIdValues[i];
    }
    throwInternalCodegenError(`missing module id for ${sf.filePath}`);
  }

  private functionCName(sf: SourceModule, name: string): string {
    return `topaz_fn_${this.moduleId(sf)}_${cIdentFragment(name)}`;
  }

  private functionSigInModule(name: string, sf: SourceModule): TopLevelFunctionSig | undefined {
    for (const sig of this.functionSigs) {
      if (sig.name === name && sig.sf === sf) return sig;
    }
    return undefined;
  }

  private registerFunctionSig(decl: FunctionDecl, sig: TopLevelFunctionSig): void {
    this.functionSigs.push(sig);
    this.functionSigDecls.push(decl);
  }

  private functionSigForDecl(decl: FunctionDecl): TopLevelFunctionSig {
    for (let i = 0; i < this.functionSigDecls.length; i++) {
      if (this.functionSigDecls[i] === decl) return this.functionSigs[i];
    }
    throwInternalCodegenError(`missing signature for function ${decl.name}`);
  }

  private resolveFunctionSig(name: string, anchor: { pos: number }): TopLevelFunctionSig | undefined {
    const matches: Array<TopLevelFunctionSig> = [];
    for (const sig of this.functionSigs) {
      if (sig.name === name) matches.push(sig);
    }
    if (matches.length === 0) return undefined;
    const current = g_currentModule;
    if (current !== undefined) {
      const local = matches.filter((sig) => sig.sf === current);
      if (local.length > 1) {
        throw new CodegenError(anchor, `redeclaration of function '${name}'`);
      }
      if (local.length === 1) return local[0];
    }
    if (matches.length === 1) return matches[0];
    throw new CodegenError(
      anchor,
      `ambiguous top-level function '${name}' across modules; declare a local wrapper or use a unique imported function name`,
    );
  }

  emit(sourceFiles: Array<SourceModule>): string {
    if (sourceFiles.length === 0) {
      throwInternalCodegenError("codegen: at least one source file is required");
    }
    const emptyModuleIds: Array<SourceModule> = [];
    this.moduleIdModules = emptyModuleIds;
    const emptyModuleIdValues: Array<string> = [];
    this.moduleIdValues = emptyModuleIdValues;
    for (let i = 0; i < sourceFiles.length; i++) {
      this.moduleIdModules.push(sourceFiles[i]);
      this.moduleIdValues.push(`m${i}`);
    }
    // Phase 1.5-6e-4: codegen consumes Topaz `SourceModule[]` directly (the
    // `convertFromTsc` bridge now lives in cli.ts). `extractDecls` flattens
    // every module's items into the per-kind declaration buckets (paired with
    // the declaring module for position diagnostics) plus the root module's
    // top-level statements.
    const { functions, classes, interfaces, aliases, topLevel } =
      this.extractDecls(sourceFiles);

    // Pass 1a: register class names so field/method types can refer to each
    // other regardless of source order. Generic classes (`class Box<T>`) are
    // held aside in `genericClasses`; their substituted ClassInfo is built
    // lazily under the mangled name on first use.
    for (const classEntry of classes) {
      const cls = classEntry.decl;
      const sf = classEntry.sf;
      this.withSfVoid(sf, () => {
        const name = cls.name;
        const clsAnchor: { pos: number } = { pos: cls.pos };
        if (name === "Array" || name === "Map" || name === "Set" || name === "Iterator") {
          throw new CodegenError(clsAnchor, `cannot redefine built-in '${name}'`);
        }
      if (this.classes.has(name) || this.genericClasses.has(name)) {
        throw new CodegenError(clsAnchor, `redeclaration of class '${name}'`);
      }
      if (cls.typeParams.length > 0) {
        // Validate the type-param declaration eagerly so errors fire even
        // when the class is never instantiated (mirrors generic functions).
        // Constraint / default rejection already happened in convert; only the
        // duplicate-name check remains.
        const typeParams: string[] = [];
        for (const tp of cls.typeParams) {
          const tpAnchor: { pos: number } = { pos: tp.pos };
          if (typeParams.includes(tp.name)) {
            throw new CodegenError(tpAnchor, `duplicate type parameter '${tp.name}'`);
          }
          typeParams.push(tp.name);
        }
        if (cls.implementsList.length > 0) {
          throw new CodegenError(
            clsAnchor,
            "generic classes cannot implement interfaces (Phase 1.4c-3)",
          );
        }
        this.genericClasses.set(name, { name, typeParams, decl: cls, sf });
        return;
      }
      this.classes.set(name, {
        name,
        fields: new Map(),
        fieldOrder: [],
        fieldInits: new Map(),
        ctor: undefined,
        methods: new Map(),
        implements: [],
        optionalFields: new Set(),
        decl: cls,
        sf,
      });
      });
    }

    // Pass 1b: register interface names.
    for (const ifaceEntry of interfaces) {
      const iface = ifaceEntry.decl;
      const sf = ifaceEntry.sf;
      this.withSfVoid(sf, () => {
      const name = iface.name;
      const ifaceAnchor: { pos: number } = { pos: iface.pos };
      if (name === "Array" || name === "Map" || name === "Set" || name === "Iterator") {
        throw new CodegenError(ifaceAnchor, `cannot redefine built-in '${name}'`);
      }
      if (this.classes.has(name) || this.genericClasses.has(name)) {
        throw new CodegenError(ifaceAnchor, `interface '${name}' collides with a class of the same name`);
      }
      if (this.interfaces.has(name)) {
        throw new CodegenError(ifaceAnchor, `redeclaration of interface '${name}'`);
      }
      this.interfaces.set(name, {
        name,
        fields: new Map(),
        fieldOrder: [],
        methods: new Map(),
        methodOrder: [],
      });
      });
    }

    // Pass 1c: register type alias names. RHS resolution is lazy
    // (typeFromAnnotation evaluates on demand), so forward references between
    // aliases work as long as the resulting graph is acyclic. Name conflicts
    // are checked eagerly against built-ins, classes, generic classes, and
    // interfaces — the alias lookup in typeFromAnnotation otherwise sits
    // alongside those tables at the same scoping priority.
    for (const aliasEntry of aliases) {
      const alias = aliasEntry.decl;
      const sf = aliasEntry.sf;
      this.withSfVoid(sf, () => {
      const name = alias.name;
      const aliasAnchor: { pos: number } = { pos: alias.pos };
      if (name === "Array" || name === "Map" || name === "Set" || name === "Iterator") {
        throw new CodegenError(aliasAnchor, `cannot redefine built-in '${name}'`);
      }
      if (this.classes.has(name) || this.genericClasses.has(name)) {
        throw new CodegenError(aliasAnchor, `type alias '${name}' collides with a class of the same name`);
      }
      if (this.interfaces.has(name)) {
        throw new CodegenError(aliasAnchor, `type alias '${name}' collides with an interface of the same name`);
      }
      if (this.typeAliases.has(name)) {
        throw new CodegenError(aliasAnchor, `redeclaration of type alias '${name}'`);
      }
      if (alias.typeParams.length > 0) {
        throw new CodegenError(
          aliasAnchor,
          `generic type alias '${name}' is unsupported (Phase 1.5-6 prep)`,
        );
      }
      // Phase 1.5-6e-3: the type machine (markRecursiveAliases /
      // preAllocateRecursiveAnons / typeFromAnnotation's alias resolution) reads
      // `body` (the already-converted Topaz `TypeNode`) and `sf` (the declaring
      // module for error positions during body resolution).
      this.typeAliases.set(name, {
        body: alias.body,
        sf,
        resolving: false,
        recursive: false,
      });
      });
    }

    // Phase 1.5-6 prep #14: detect recursive aliases (SCC of alias-to-alias
    // references) and pre-allocate anon class names for every TypeLiteralNode
    // appearing inside their bodies. After this returns, references to those
    // TypeLiteralNodes resolve via `preAllocatedAnons` without re-entering the
    // alias being resolved — breaking the chicken-and-egg between
    // `type TypeNode = TypeRef | ...` and `type TypeRef = { typeArgs: Array<TypeNode> }`.
    this.markRecursiveAliases();
    this.preAllocateRecursiveAnons();
    this.fillPreAllocatedAnonFields();

    // Pass 2a: parse interface members (so classes can reference interfaces in
    // field/method types).
    for (const ifaceEntry of interfaces) {
      const iface = ifaceEntry.decl;
      const sf = ifaceEntry.sf;
      this.collectInterfaceMembers(iface, sf);
    }

    // Pass 2b: parse class members + verify implements. Generic classes are
    // deferred — their substituted ClassInfo is built on demand when a use
    // site instantiates them via instantiateGenericClass.
    for (const classEntry of classes) {
      const cls = classEntry.decl;
      const sf = classEntry.sf;
      if (cls.typeParams.length > 0) continue;
      this.collectClassMembers(cls, sf);
    }

    for (const fnEntry of functions) {
      const fn = fnEntry.decl;
      const sf = fnEntry.sf;
      this.withSfVoid(sf, () => {
      const fname = fn.name;
      const fnAnchor: { pos: number } = { pos: fn.pos };
      const existingSig = this.functionSigInModule(fname, sf);
      const existingGeneric = this.genericFunctions.get(fname);
      const hasExistingSig = existingSig !== undefined;
      const hasExistingGeneric = existingGeneric !== undefined && existingGeneric.sf === sf;
      if (hasExistingSig || hasExistingGeneric) {
        throw new CodegenError(fnAnchor, `redeclaration of function '${fname}'`);
      }
      if (fn.typeParams.length > 0) {
        // Generic function: defer signature resolution until call sites
        // supply concrete type arguments. Constraint / default rejection
        // already happened in convert; only the duplicate-name check remains.
        if (this.genericFunctions.has(fname)) {
          throw new CodegenError(fnAnchor, `redeclaration of function '${fname}'`);
        }
        const typeParams: string[] = [];
        for (const tp of fn.typeParams) {
          const tpAnchor: { pos: number } = { pos: tp.pos };
          if (typeParams.includes(tp.name)) {
            throw new CodegenError(tpAnchor, `duplicate type parameter '${tp.name}'`);
          }
          typeParams.push(tp.name);
        }
        this.genericFunctions.set(fname, { name: fname, typeParams, decl: fn, sf });
        return;
      }
      const ret = this.typeFromAnnotation(fn.returnType, fnAnchor, sf);
      const params = this.collectParams(fn.params, sf);
      this.registerFunctionSig(fn, {
        name: fname,
        sf,
        cName: this.functionCName(sf, fname),
        params,
        returnType: ret,
      });
      });
    }

    const out: string[] = [];
    out.push('#include "runtime.h"');
    out.push("");

    // Forward-declare class structs and interface vtable structs so any
    // ordering of fields/methods that crosses class/interface boundaries works.
    // Generic class monomorphs get their own typedef slot below; we don't
    // know all of them yet.
    const concreteClasses = classes
      .filter((c) => c.decl.typeParams.length === 0)
      .map((c) => c.decl);
    if (concreteClasses.length > 0) {
      for (const cls of concreteClasses) {
        const n = cls.name;
        out.push(`typedef struct topaz_class_${n} topaz_class_${n};`);
      }
      out.push("");
    }
    // Phase 1.4c-3: generic class monomorph typedefs. Concrete class struct
    // bodies, function signatures, and main() can all reference monomorph
    // class pointers, so the typedef must precede everything below. Filled
    // at the end of emit() once the class worklist has drained.
    const classMonoTypedefSlot = out.length;
    out.push("");
    if (interfaces.length > 0) {
      for (const ifaceEntry of interfaces) {
        const iface = ifaceEntry.decl;
        const n = iface.name;
        out.push(`struct topaz_iface_${n}_vt;`);
        out.push(
          `typedef struct topaz_iface_${n} { void *data; const struct topaz_iface_${n}_vt *vt; } topaz_iface_${n};`,
        );
        // Phase 1.5-3c: per-iface "absent" macro for Map<K, I> _get's miss
        // sentinel. Defined here so any map monomorph below can reference it
        // by token without re-emitting the compound literal (which would
        // mis-parse inside the TOPAZ_MAP_DEFINE arg list due to the comma).
        out.push(
          `#define topaz_iface_${n}_absent ((topaz_iface_${n}){ NULL, NULL })`,
        );
      }
      out.push("");
    }

    // Placeholder for TOPAZ_ARRAY_DEFINE / TOPAZ_MAP_DEFINE / TOPAZ_SET_DEFINE
    // expansions for container monomorphs whose element/value type is a class
    // or interface. Phase 1.5-6 prep: positioned BEFORE concrete class struct
    // defs so a class field of type `Array<C>` / `Set<C>` / `Map<scalar, C>`
    // (newly reachable via field initializer) can use `topaz_array_class_<C> *`
    // in its struct body. The macro only needs `topaz_class_<C>` to be a
    // forward-declared opaque type (pointer use), which is satisfied by the
    // `typedef struct topaz_class_<n> topaz_class_<n>;` block above; iface
    // value types are fully defined two blocks up. Filled at end of emit().
    const containerMonomorphSlot = out.length;
    out.push("");

    if (concreteClasses.length > 0) {
      for (const cls of concreteClasses) {
        out.push(this.emitClassStruct(this.classes.get(cls.name)!));
      }
      out.push("");
    }
    // Phase 1.4c-3: generic class monomorph struct definitions. Field types
    // already use pointer C types for class refs, so this can sit after
    // concrete struct defs without circular-ordering pain.
    const classMonoStructSlot = out.length;
    out.push("");
    if (interfaces.length > 0) {
      for (const ifaceEntry of interfaces) {
        const iface = ifaceEntry.decl;
        out.push(this.emitInterfaceVtableStruct(this.interfaces.get(iface.name)!));
      }
      out.push("");
    }

    // Phase 1.5-3.5f-join: per-monomorph Array<T> `_join` helpers. Emitted as
    // free `static inline` functions (not via TOPAZ_ARRAY_DEFINE) so the macro
    // stays minimal. Placed after container monomorphs (so `topaz_array_<name>`
    // typedefs exist) and before fn typedefs (so the helper signature can
    // reference `topaz_string`).
    const arrayJoinHelperSlot = out.length;
    out.push("");

    // Phase 1.5-3.5g-iterator: `Iterator<T>` infra. Placed after container
    // monomorphs (state struct references `topaz_map_<K>_<V> *` /
    // `topaz_set_<T> *`) and before fn typedefs (independent — fn typedefs
    // don't reference iter and vice versa). Layout inside the slot is:
    //   1. per-container state struct typedefs
    //   2. per-elem iter typedefs (fat pointer struct with next fn pointer)
    //   3. per-(source, container) static inline _next functions
    const iterTypedefSlot = out.length;
    out.push("");

    // Phase 1.5-3.5e: fn typedefs for every distinct fn signature seen in
    // user code. Placed after container monomorphs but before function
    // signatures so user functions, class methods, and main() can all
    // reference fn types in params / returns / local declarations. Interface
    // method signatures are emitted before this slot, so fn types in iface
    // methods were rejected at collection time.
    const fnTypedefSlot = out.length;
    out.push("");

    // Phase 1.5-3.5g-array-fn: Array<fn> TOPAZ_ARRAY_DEFINE expansions. Must
    // follow fnTypedefSlot so `topaz_fn_<...>` is a complete type, and must
    // precede arrow / function fwd decls so any signature carrying
    // `topaz_array_fn_<...> *` resolves.
    const arrayFnContainerSlot = out.length;
    out.push("");

    // Phase 1.5-3.5e: forward declarations for arrow functions + their env
    // structs. Goes before user function bodies so a function that returns an
    // arrow can reference `__topaz_arrow_<N>` / `__topaz_env_<N>` by name.
    const arrowFwdSlot = out.length;
    out.push("");

    for (const fnEntry of functions) {
      const fn = fnEntry.decl;
      if (fn.typeParams.length > 0) continue;
      out.push(`${this.formatSignature(this.functionSigForDecl(fn))};`);
    }
    for (const cls of concreteClasses) {
      const info = this.classes.get(cls.name)!;
      for (const line of this.classMemberSignatures(info)) out.push(`${line};`);
    }
    if (functions.length > 0 || concreteClasses.length > 0) out.push("");

    // Phase 1.4c-3: forward declarations for generic class monomorph members.
    // Placed alongside the concrete class member fwds so user code, methods,
    // and main() can all reference monomorph constructors/methods by mangled
    // name. Filled at the end of emit().
    const classMonoSigSlot = out.length;
    out.push("");

    // Phase 1.4c-2: forward declarations for generic-function monomorphs go
    // here so concrete function bodies, class methods, and main() can all
    // reference them by mangled name. Filled at the end of emit() once the
    // worklist has fully drained.
    const monomorphFwdSlot = out.length;
    out.push("");

    // Phase 1.5-6 prep #9: module-level `const` decls with scalar-literal
    // initializers are hoisted to file scope as `static const T NAME = LIT;`
    // and registered in scope.stack[0] so emitted static C functions
    // (user fns, class methods, iface wrappers) can resolve them. Without
    // this, top-level consts live only in main()'s frame and function bodies
    // get "unknown identifier" at codegen time. Only number / boolean literal
    // (incl. unary +/- on numeric literal) qualify — string / object / `new` /
    // call initializers stay in main() body (handled in a later step). The
    // hoisted statement is skipped in the main() loop below so it doesn't
    // re-emit as a local.
    const moduleConstSlot = out.length;
    out.push("");
    const hoistedTopLevel: Set<Stmt> = new Set();
    {
      const hoistLines: string[] = [];
      for (const topEntry of topLevel) {
        const stmt = topEntry.stmt;
        const sf = topEntry.sf;
        const line = this.tryHoistModuleConst(stmt, sf);
        if (line !== undefined) {
          hoistedTopLevel.add(stmt);
          hoistLines.push(line);
        }
      }
      if (hoistLines.length > 0) {
        out[moduleConstSlot] = hoistLines.join("\n") + "\n";
      }
    }

    // Phase 1.5-6i prep: non-root module globals need file-scope storage so
    // imported functions can read them. Initializers still run from main()
    // after runtime setup, preserving one process-wide initialization point.
    const moduleGlobalSlot = out.length;
    out.push("");
    const moduleGlobalTopLevel: Set<Stmt> = new Set();
    {
      const globalLines: string[] = [];
      for (const topEntry of topLevel) {
        if (topEntry.isRoot) continue;
        const stmt = topEntry.stmt;
        if (hoistedTopLevel.has(stmt)) continue;
        const sf = topEntry.sf;
        const line = this.tryEmitModuleGlobalDecl(stmt, sf);
        if (line !== undefined) {
          moduleGlobalTopLevel.add(stmt);
          globalLines.push(line);
        }
      }
      if (globalLines.length > 0) {
        out[moduleGlobalSlot] = globalLines.join("\n") + "\n";
      }
    }

    // Emit per-(interface, implementing-class) wrapper functions and the
    // static const vtable instances. These must come before user function /
    // class method definitions so coercion sites (`&topaz_iface_I_for_C_vt`)
    // can reference them.
    for (const cls of concreteClasses) {
      const info = this.classes.get(cls.name)!;
      for (const ifaceName of info.implements) {
        const iface = this.interfaces.get(ifaceName)!;
        for (const def of this.emitInterfaceWrappers(iface, info)) {
          out.push(def);
        }
        out.push(this.emitInterfaceVtableInstance(iface, info));
        out.push("");
      }
    }

    for (const fnEntry of functions) {
      const fn = fnEntry.decl;
      const sf = fnEntry.sf;
      if (fn.typeParams.length > 0) continue;
      out.push(this.emitFunctionDefinition(fn, sf));
      out.push("");
    }

    for (const cls of concreteClasses) {
      const info = this.classes.get(cls.name)!;
      for (const def of this.emitClassMemberDefinitions(info)) {
        out.push(def);
        out.push("");
      }
    }

    // Phase 1.4c-3: generic class monomorph member definitions. Filled at
    // the end of emit() after the class worklist drains. Sits before the
    // generic function monomorph defs since a generic class method body
    // might call a generic function with a monomorph class type arg.
    const classMonoDefSlot = out.length;
    out.push("");

    // Phase 1.5-3.5e: per-arrow env struct typedef + static arrow function
    // definitions. Accumulated into `arrowDefLines` as user expressions are
    // walked, spliced in here so the bodies can reference any prior user
    // function / class method by direct name.
    const arrowDefSlot = out.length;
    out.push("");

    // Phase 1.4c-2: monomorph definitions land just before main, after any
    // concrete user functions/methods. They're already forward-declared above
    // so the order between concrete and monomorph defs doesn't matter.
    const monomorphDefSlot = out.length;
    out.push("");

    // Phase 1.5-6 prep #26: main takes argc/argv and stashes them so
    // `process.argv` can read them. The params use the `__topaz_` reserved
    // prefix (same namespace as internal temps) so a user variable named
    // `argv` does not collide. The init call is unconditional (every program
    // gets it) so the params are always used — no -Wunused-parameter under
    // -Wextra even when the program never touches process.argv.
    out.push("int main(int __topaz_argc, char **__topaz_argv) {");
    out.push("  topaz_runtime_init_argv(__topaz_argc, __topaz_argv);");
    this.scope.push();
    for (const topEntry of topLevel) {
      const stmt = topEntry.stmt;
      if (!moduleGlobalTopLevel.has(stmt)) continue;
      out.push(this.emitModuleGlobalInit(stmt, topEntry.sf, 1));
    }
    for (const topEntry of topLevel) {
      const stmt = topEntry.stmt;
      const sf = topEntry.sf;
      // Phase 1.5-6 prep #9: hoisted module consts are already emitted at
      // file scope and registered in scope.stack[0]; emitting them again as
      // local decls would shadow the hoisted bindings inside main() body and
      // duplicate the storage.
      if (hoistedTopLevel.has(stmt) || moduleGlobalTopLevel.has(stmt)) continue;
      // Phase 1.5-6e-3: emit the Topaz top-level statement under the declaring
      // module's SourceFile (ambient position oracle for the SCC).
      out.push(this.emitStatementBoundary(stmt, sf));
    }
    this.scope.pop();
    out.push("  return 0;");
    out.push("}");

    // Drain the generic worklists now that all user emission is done. Class
    // and function monomorphs can transitively register each other (a
    // generic class method may call a generic function and vice versa), so
    // we round-robin until both worklists are empty. Container monomorphs
    // discovered here flow into the arrayMonomorphs/mapMonomorphs/
    // setMonomorphs sets and get expanded below.
    const classMonoTypedefLines: string[] = [];
    const classMonoStructLines: string[] = [];
    const classMonoSigLines: string[] = [];
    const classMonoDefLines: string[] = [];
    const monoFwdLines: string[] = [];
    const monoDefLines: string[] = [];
    while (
      this.classMonomorphWorklist.length > 0 ||
      this.genericWorklist.length > 0
    ) {
      while (this.classMonomorphWorklist.length > 0) {
        const last = this.classMonomorphWorklist.length - 1;
        const mangled = this.classMonomorphWorklist[last];
        this.classMonomorphWorklist.pop();
        const info = this.classes.get(mangled)!;
        const mono = this.classMonomorphs.get(mangled)!;
        classMonoTypedefLines.push(`typedef struct topaz_class_${mangled} topaz_class_${mangled};`);
        classMonoStructLines.push(this.emitClassStruct(info));
        for (const line of this.classMemberSignatures(info)) classMonoSigLines.push(`${line};`);
        // Method bodies still reference T/U/...; reactivate the substitution
        // for the duration of body emission.
        const prevScope = this.typeParamScope;
        this.typeParamScope = mono.subs;
        for (const def of this.emitClassMemberDefinitions(info)) {
          classMonoDefLines.push(def);
          classMonoDefLines.push("");
        }
        this.typeParamScope = prevScope;
      }
      while (this.genericWorklist.length > 0) {
        const last = this.genericWorklist.length - 1;
        const mangled = this.genericWorklist[last];
        this.genericWorklist.pop();
        const mono = this.genericMonomorphs.get(mangled)!;
        monoFwdLines.push(`${this.formatMonomorphSignature(mono.mangled, mono.sig)};`);
        monoDefLines.push(this.emitMonomorphDefinition(mono));
        monoDefLines.push("");
      }
    }
    if (classMonoTypedefLines.length > 0) {
      out[classMonoTypedefSlot] = classMonoTypedefLines.join("\n") + "\n";
    }
    if (classMonoStructLines.length > 0) {
      out[classMonoStructSlot] = classMonoStructLines.join("\n") + "\n";
    }
    if (classMonoSigLines.length > 0) {
      out[classMonoSigSlot] = classMonoSigLines.join("\n") + "\n";
    }
    if (classMonoDefLines.length > 0) {
      // Generic class methods can legitimately ignore type-parameterized
      // params just like generic functions, and a monomorph realized via a
      // type annotation may have methods that are never called (e.g.
      // `Box<string>.replace` when only `.get` is used). Suppress both
      // warnings around the monomorph block.
      out[classMonoDefSlot] = [
        '#pragma GCC diagnostic push',
        '#pragma GCC diagnostic ignored "-Wunused-parameter"',
        '#pragma GCC diagnostic ignored "-Wunused-function"',
        classMonoDefLines.join("\n"),
        '#pragma GCC diagnostic pop',
      ].join("\n");
    }
    if (monoFwdLines.length > 0) {
      out[monomorphFwdSlot] = monoFwdLines.join("\n") + "\n";
    }
    if (monoDefLines.length > 0) {
      // Generic functions can legitimately ignore some type-parameterized
      // params in the body (e.g. `pickSecond<A,B>(a: A, b: B): B` only uses
      // `b`), which trips -Wunused-parameter. Wrap the monomorph block in a
      // diagnostic pragma rather than synthesizing a `(void)x` per param.
      const wrapped = [
        '#pragma GCC diagnostic push',
        '#pragma GCC diagnostic ignored "-Wunused-parameter"',
        monoDefLines.join("\n"),
        '#pragma GCC diagnostic pop',
      ].join("\n");
      out[monomorphDefSlot] = wrapped;
    }

    // Phase 1.5-3.5e: fn typedefs and arrow definitions. The typedef block is
    // self-contained (each fn type is a `{ fn ptr; env ptr; }` struct that
    // only references already-declared types), so no `#pragma` is needed.
    // Arrow defs use `void *env` even when the arrow has no captures, which
    // would trip -Wunused-parameter; wrap the block to suppress.
    if (this.fnMonomorphs.size > 0) {
      const lines: string[] = [];
      for (const t of this.fnMonomorphs.values()) {
        lines.push(this.emitFnTypedef(t));
      }
      out[fnTypedefSlot] = lines.join("\n") + "\n";
    }
    if (this.arrowFwdLines.length > 0) {
      // Env struct typedefs sit alongside the arrow fwd decls; no `-Wunused`
      // concerns since these are just declarations.
      out[arrowFwdSlot] = this.arrowFwdLines.join("\n") + "\n";
    }
    if (this.arrowDefLines.length > 0) {
      out[arrowDefSlot] = [
        '#pragma GCC diagnostic push',
        '#pragma GCC diagnostic ignored "-Wunused-parameter"',
        this.arrowDefLines.join("\n"),
        '#pragma GCC diagnostic pop',
      ].join("\n");
    }

    if (
      this.arrayMonomorphs.size > 0 ||
      this.mapMonomorphs.size > 0 ||
      this.setMonomorphs.size > 0 ||
      this.dunionMonomorphs.size > 0
    ) {
      const sections: string[] = [];
      // Phase 1.5-3e: discriminated class unions lower to a `{ topaz_string
      // kind; void *data; }` fat pointer. Emit the typedef before any
      // container macros so map/array monomorphs can carry dunion values
      // (not used yet, but cheap insurance against ordering surprises).
      const dunionLines: string[] = [];
      for (const t of this.dunionMonomorphs.values()) {
        dunionLines.push(this.emitDunionTypedef(t));
      }
      if (dunionLines.length > 0) sections.push(dunionLines.join("\n"));

      // Set<class>/Set<interface> need a typed hash/eq pair before
      // TOPAZ_SET_DEFINE can reference them; emit those first.
      const setElemKeys = new Set<string>();
      const helperLines: string[] = [];
      for (const t of this.setMonomorphs.values()) {
        const elem = setElem(t)!;
        const key = typeKey(elem);
        if (setElemKeys.has(key)) continue;
        setElemKeys.add(key);
        const elemHelpers = this.emitSetElemHelpers(elem);
        for (const line of elemHelpers) helperLines.push(line);
      }
      if (helperLines.length > 0) sections.push(helperLines.join("\n"));

      for (const t of this.arrayMonomorphs.values()) {
        sections.push(this.emitArrayMonomorphMacro(t));
      }
      for (const t of this.mapMonomorphs.values()) {
        sections.push(this.emitMapMonomorphMacro(t));
      }
      for (const t of this.setMonomorphs.values()) {
        sections.push(this.emitSetMonomorphMacro(t));
      }

      // TOPAZ_ARRAY_DEFINE / TOPAZ_MAP_DEFINE / TOPAZ_SET_DEFINE expand several
      // static-inline helpers (notably _pop / _delete) that the user program
      // may not call. Suppress the warning so emit stays monomorph-driven
      // instead of usage-driven.
      out[containerMonomorphSlot] =
        `#pragma GCC diagnostic push\n` +
        `#pragma GCC diagnostic ignored "-Wunused-function"\n` +
        `${sections.join("\n")}\n` +
        `#pragma GCC diagnostic pop\n`;
    }

    if (this.arrayJoinMonomorphs.size > 0) {
      const joinLines: string[] = [];
      for (const t of this.arrayJoinMonomorphs.values()) {
        joinLines.push(this.emitArrayJoinHelper(t));
      }
      out[arrayJoinHelperSlot] =
        `#pragma GCC diagnostic push\n` +
        `#pragma GCC diagnostic ignored "-Wunused-function"\n` +
        `${joinLines.join("\n")}\n` +
        `#pragma GCC diagnostic pop\n`;
    }

    if (this.arrayFnMonomorphs.size > 0) {
      const fnArrayLines: string[] = [];
      for (const t of this.arrayFnMonomorphs.values()) {
        fnArrayLines.push(this.emitArrayFnMonomorphMacro(t));
      }
      out[arrayFnContainerSlot] =
        `#pragma GCC diagnostic push\n` +
        `#pragma GCC diagnostic ignored "-Wunused-function"\n` +
        `${fnArrayLines.join("\n")}\n` +
        `#pragma GCC diagnostic pop\n`;
    }

    if (
      this.iterStateMonomorphs.size > 0 ||
      this.iterTypedefMonomorphs.size > 0 ||
      this.iterNextMonomorphs.size > 0
    ) {
      const iterLines: string[] = [];
      // 1. state structs — depend on container monomorphs being defined above.
      for (const t of this.iterStateMonomorphs.values()) {
        iterLines.push(this.emitIterStateStruct(t));
      }
      // 2. iter typedefs — fat pointer struct, one per distinct elem type.
      for (const t of this.iterTypedefMonomorphs.values()) {
        iterLines.push(this.emitIterTypedef(t));
      }
      // 3. _next functions — reference both state struct and iter typedef.
      for (const entry of this.iterNextMonomorphs.values()) {
        iterLines.push(this.emitIterNextFunction(entry));
      }
      out[iterTypedefSlot] =
        `#pragma GCC diagnostic push\n` +
        `#pragma GCC diagnostic ignored "-Wunused-function"\n` +
        `${iterLines.join("\n")}\n` +
        `#pragma GCC diagnostic pop\n`;
    }

    return out.join("\n") + "\n";
  }

  // Phase 1.5-3.5f-join: emit a `static inline topaz_string
  // topaz_array_<name>_join(topaz_array_<name> *src, topaz_string sep)` helper
  // per Array<scalar> monomorph. Two passes: pass 1 stringifies each elem (or
  // copies the string for `string` elems) into a stack-local cache while
  // accumulating total length; pass 2 alloc()s the result buffer once from the
  // arena and writes elements + separators in order. The cache holds up to
  // TOPAZ_ARRAY_JOIN_STACK_CACHE topaz_string handles on the C stack — beyond
  // that size, we restart pass 2 from scratch and re-stringify (memory cost
  // grows linearly with N, never recursive). Caller-side tmp `__s` / `__sep`
  // guarantees the recv / separator are evaluated once.
  private emitArrayJoinHelper(t: TopazType): string {
    const tag = arrayShortName(t);
    const elem = arrayElem(t)!;
    let toStringStmt: string = "";
    if (elem.kind === "string") {
      toStringStmt = `topaz_string __e = src->data[i];`;
    } else if (elem.kind === "number") {
      toStringStmt = `topaz_string __e = topaz_number_to_string(src->data[i]);`;
    } else if (elem.kind === "boolean") {
      toStringStmt = `topaz_string __e = topaz_boolean_to_string(src->data[i]);`;
    } else {
      throwInternalCodegenError(`emitArrayJoinHelper: unsupported elem ${typeIdent(elem)}`);
    }
    return [
      `static inline topaz_string topaz_array_${tag}_join(topaz_array_${tag} *src, topaz_string sep) {`,
      `  size_t n = src->len;`,
      `  if (n == 0) { topaz_string r = { "", 0 }; return r; }`,
      `  size_t total = (n - 1) * sep.len;`,
      `  for (size_t i = 0; i < n; i++) {`,
      `    ${toStringStmt}`,
      `    total += __e.len;`,
      `  }`,
      `  char *buf = (char *)topaz_arena_alloc(total + 1);`,
      `  size_t off = 0;`,
      `  for (size_t i = 0; i < n; i++) {`,
      `    if (i > 0 && sep.len) {`,
      `      memcpy(buf + off, sep.data, sep.len);`,
      `      off += sep.len;`,
      `    }`,
      `    ${toStringStmt}`,
      `    if (__e.len) memcpy(buf + off, __e.data, __e.len);`,
      `    off += __e.len;`,
      `  }`,
      `  buf[total] = '\\0';`,
      `  topaz_string r = { buf, total };`,
      `  return r;`,
      `}`,
    ].join("\n");
  }

  // Phase 1.5-3.5g-iterator: emit the per-container state struct used by every
  // iter produced from this container. Holds a pointer to the source container
  // and the current slot index; one struct shared by Map.values / Map.keys (or
  // by Set.values / Set.keys, which iterate identically).
  private emitIterStateStruct(t: TopazType): string {
    const tag = iterContainerTag(t);
    const cty = cTypeName(t);
    return [
      `typedef struct topaz_iter_state_${tag} {`,
      `  ${cty} src;`,
      `  size_t idx;`,
      `} topaz_iter_state_${tag};`,
    ].join("\n");
  }

  // Phase 1.5-3.5g-iterator: per-elem fat pointer `topaz_iter_<elem-tag>`. The
  // `next` field's signature must reference the elem's C type, so we need a
  // typedef per distinct elem (number / boolean / string / class<C> / iface<I>).
  private emitIterTypedef(elem: TopazType): string {
    const tag = elemTag(elem);
    const cty = cTypeName(elem);
    return [
      `typedef struct topaz_iter_${tag} {`,
      `  void *state;`,
      `  ${cty} (*next)(void *state, bool *done);`,
      `} topaz_iter_${tag};`,
    ].join("\n");
  }

  // Phase 1.5-3.5g-iterator: per-(source, container) `_next` function. Linear
  // probe over `src->cap`, skipping non-OCCUPIED slots (same walk as the
  // hash-form for-of lowering in 1.5-3.5g-mapset); on exhaustion sets *done
  // and returns the elem's zero value (caller ignores the value when done).
  private emitIterNextFunction(entry: {
    containerType: TopazType;
    source: string;
    elemType: TopazType;
    field: string;
  }): string {
    const containerTag = iterContainerTag(entry.containerType);
    const cty = cTypeName(entry.elemType);
    const suffix = entry.source.endsWith("_values") ? "values" : "keys";
    const fnName = `topaz_iter_${containerTag}_${suffix}_next`;
    const zero = zeroValueOfElem(entry.elemType);
    return [
      `static ${cty} ${fnName}(void *state, bool *done) {`,
      `  topaz_iter_state_${containerTag} *s = (topaz_iter_state_${containerTag} *)state;`,
      `  while (s->idx < s->src->cap) {`,
      `    size_t i = s->idx;`,
      `    s->idx = i + 1;`,
      `    if (s->src->slots[i].state == TOPAZ_HASH_SLOT_OCCUPIED) {`,
      `      return s->src->slots[i].${entry.field};`,
      `    }`,
      `  }`,
      `  *done = true;`,
      `  return ${zero};`,
      `}`,
    ].join("\n");
  }

  // Phase 1.5-3.5g-iterator: emit a stmt expression that allocates the iter
  // state on the arena, snapshots the source container, and returns the fat
  // pointer { .state, .next }. Used by standalone `.values()` / `.keys()` call
  // sites (the for-of hash-form lowering bypasses this and walks slots in-line).
  private emitIterConstruction(
    recvExpr: Expr,
    containerType: TopazType,
    source: string,
    elemType: TopazType,
    field: string,
  ): string {
    this.recordIterMonomorph(elemType, containerType, source, field);
    const containerTag = iterContainerTag(containerType);
    const tag = elemTag(elemType);
    const elemCty = cTypeName(elemType);
    const suffix = source.endsWith("_values") ? "values" : "keys";
    const id = this.tmpCounter++;
    const stateTmp = `__topaz_iter_state_${id}`;
    const recvStr = this.emitExpression(recvExpr);
    return `({ topaz_iter_state_${containerTag} *${stateTmp} = topaz_arena_alloc(sizeof(topaz_iter_state_${containerTag})); ${stateTmp}->src = ${recvStr}; ${stateTmp}->idx = 0; (topaz_iter_${tag}){ .state = ${stateTmp}, .next = (${elemCty} (*)(void *, bool *))&topaz_iter_${containerTag}_${suffix}_next }; })`;
  }

  // Phase 1.4c-1a: expand TOPAZ_ARRAY_DEFINE for class/interface element types.
  // Scalar monomorphs (number/boolean/string) are pre-expanded in runtime.h.
  private emitArrayMonomorphMacro(t: TopazType): string {
    const tag = arrayShortName(t);
    const elem = arrayElem(t)!;
    let cElem: string = "";
    if (isClassType(elem)) {
      cElem = `topaz_class_${classNameOf(elem)!} *`;
    } else if (isInterfaceType(elem)) {
      cElem = `topaz_iface_${interfaceNameOf(elem)!}`;
    } else if (elem.kind === "dunion") {
      // Phase 1.5-6 prep #8: Array<dunion> stores the fat `{ kind, void *data }`
      // struct as a value. Each element costs 16 bytes (two pointers on LP64)
      // — same as topaz_iface_<I>. push / [i] = / for-of all see the dunion
      // value directly; variant narrowing happens via switch on `.kind` or
      // `instanceof` against `.data`.
      cElem = typeIdent(elem);
    } else {
      throwInternalCodegenError(`unexpected array element type ${typeIdent(elem)} for monomorph emission`);
    }
    return `TOPAZ_ARRAY_DEFINE(${tag}, ${cElem})`;
  }

  // Phase 1.5-3.5g-array-fn: TOPAZ_ARRAY_DEFINE for fn-typed elements. Emitted
  // in a separate slot after the fn typedef so the macro expansion sees the
  // fat-pointer struct as a complete type.
  private emitArrayFnMonomorphMacro(t: TopazType): string {
    const tag = arrayShortName(t);
    const elem = arrayElem(t)!;
    if (elem.kind !== "fn") {
      throwInternalCodegenError(`emitArrayFnMonomorphMacro: not an fn-elem array, got ${typeIdent(elem)}`);
    }
    return `TOPAZ_ARRAY_DEFINE(${tag}, ${typeIdent(elem)})`;
  }

  // Phase 1.4c-1b: expand TOPAZ_MAP_DEFINE for scalar-keyed maps whose value
  // type is a class or interface. The key still uses the scalar hash/eq from
  // runtime.h; only the value type changes.
  // Phase 1.5-3c: scalar V monomorphs are pre-expanded in runtime.h, so this
  // path only sees class / interface V. Both reuse the same C type as the
  // optional (NULL ptr / .data == NULL is the sentinel), so `opt_t = val_t`
  // and `opt_wrap = topaz_opt_passthrough`. Iface absent uses the per-iface
  // helper macro emitted alongside the iface typedef.
  private emitMapMonomorphMacro(t: TopazType): string {
    const tag = mapShortName(t);
    const k = mapKey(t)!;
    const v = mapValue(t)!;
    const kShort = scalarTag(k);
    const hashFn = `topaz_hash_${kShort}`;
    // string keys use topaz_string_eq (byte compare); number/boolean use the
    // SameValueZero-aware topaz_key_eq_* wrappers from runtime.h.
    const eqFn = kShort === "string" ? "topaz_string_eq" : `topaz_key_eq_${kShort}`;
    const cVal = this.cElemTypeForContainer(v);
    let optAbsent: string = "";
    if (isClassType(v)) {
      optAbsent = "NULL";
    } else if (isInterfaceType(v)) {
      optAbsent = `topaz_iface_${interfaceNameOf(v)!}_absent`;
    } else if (v.kind === "dunion") {
      // Phase 1.5-6 prep #8: dunion absent uses `.data == NULL` sentinel
      // (same shape as iface). The compound literal zero-initializes both
      // `.kind` (empty topaz_string) and `.data` (NULL).
      optAbsent = `((${typeIdent(v)}){0})`;
    } else {
      throwInternalCodegenError(`emitMapMonomorphMacro: scalar V should be pre-expanded in runtime.h, got ${typeIdent(v)}`);
    }
    return `TOPAZ_MAP_DEFINE(${tag}, ${typeIdent(k)}, ${cVal}, ${cVal}, topaz_opt_passthrough, ${optAbsent}, ${hashFn}, ${eqFn})`;
  }

  // Phase 1.4c-1b: expand TOPAZ_SET_DEFINE for class/interface element sets.
  // The hash/eq wrappers were emitted earlier (see emitSetElemHelpers).
  private emitSetMonomorphMacro(t: TopazType): string {
    const tag = setShortName(t);
    const elem = setElem(t)!;
    const cElem = this.cElemTypeForContainer(elem);
    let hashFn: string = "";
    let eqFn: string = "";
    if (isClassType(elem)) {
      const cname = classNameOf(elem)!;
      hashFn = `topaz_hash_class_${cname}`;
      eqFn = `topaz_key_eq_class_${cname}`;
    } else if (isInterfaceType(elem)) {
      const iname = interfaceNameOf(elem)!;
      hashFn = `topaz_hash_iface_${iname}`;
      eqFn = `topaz_key_eq_iface_${iname}`;
    } else if (elem.kind === "dunion") {
      const tag2 = elemTag(elem);
      hashFn = `topaz_hash_${tag2}`;
      eqFn = `topaz_key_eq_${tag2}`;
    } else {
      throwInternalCodegenError(`unexpected set element type ${typeIdent(elem)} for monomorph emission`);
    }
    return `TOPAZ_SET_DEFINE(${tag}, ${cElem}, ${hashFn}, ${eqFn})`;
  }

  // Phase 1.5-3e: emit `typedef struct { topaz_string kind; void *data; }
  // topaz_dunion_A_or_B;` for a class union with a shared string-literal
  // discriminator. The `data` field holds the underlying class instance
  // pointer; case-narrowing casts it back via `(topaz_class_<C> *)d.data`.
  private emitDunionTypedef(t: TopazType): string {
    switch (t.kind) {
      case "dunion":
        return `typedef struct { topaz_string ${t.discriminator}; void *data; } ${typeIdent(t)};`;
      default:
        throwInternalCodegenError(`emitDunionTypedef: not a dunion (${typeIdent(t)})`);
        return "";
    }
  }

  // Per-(class|interface) hash and key-equality wrappers used by
  // Set<class>/Set<interface> monomorphs. JS Set uses reference identity for
  // objects, so the hash routes the underlying pointer through
  // topaz_hash_pointer and equality is pointer comparison. For interface
  // elements that's the .data field of the fat pointer — two interface values
  // wrapping the same instance compare equal regardless of which interface
  // "view" they came from.
  private emitSetElemHelpers(elem: TopazType): string[] {
    if (isClassType(elem)) {
      const cname = classNameOf(elem)!;
      const cType = `topaz_class_${cname} *`;
      return [
        `static inline size_t topaz_hash_class_${cname}(${cType} p) { return topaz_hash_pointer((const void *)p); }`,
        `static inline topaz_boolean topaz_key_eq_class_${cname}(${cType} a, ${cType} b) { return a == b; }`,
      ];
    }
    if (isInterfaceType(elem)) {
      const iname = interfaceNameOf(elem)!;
      const iType = `topaz_iface_${iname}`;
      return [
        `static inline size_t topaz_hash_iface_${iname}(${iType} v) { return topaz_hash_pointer(v.data); }`,
        `static inline topaz_boolean topaz_key_eq_iface_${iname}(${iType} a, ${iType} b) { return a.data == b.data; }`,
      ];
    }
    if (elem.kind === "dunion") {
      // Phase 1.5-6 prep #8: Set<dunion> uses the `.data` pointer as the
      // identity key (same reference-identity semantics as Set<class> and
      // Set<iface>). Two dunion values wrapping the same underlying class
      // instance compare equal regardless of variant tag.
      const tag = elemTag(elem);
      const cty = typeIdent(elem);
      return [
        `static inline size_t topaz_hash_${tag}(${cty} v) { return topaz_hash_pointer(v.data); }`,
        `static inline topaz_boolean topaz_key_eq_${tag}(${cty} a, ${cty} b) { return a.data == b.data; }`,
      ];
    }
    throwInternalCodegenError(`unexpected set element type ${typeIdent(elem)} for helper emission`);
  }

  private cElemTypeForContainer(elem: TopazType): string {
    if (isClassType(elem)) return `topaz_class_${classNameOf(elem)!} *`;
    if (isInterfaceType(elem)) return `topaz_iface_${interfaceNameOf(elem)!}`;
    if (isScalarType(elem)) return typeIdent(elem);
    // Phase 1.5-6 prep #8: dunion stores the fat `{ kind, void *data }` struct
    // value directly. The typedef is already emitted (emitDunionTypedef) ahead
    // of the container macros (see emit() containerMonomorphSlot order).
    if (elem.kind === "dunion") return typeIdent(elem);
    throwInternalCodegenError(`unexpected container element type ${typeIdent(elem)}`);
  }

  // Phase 1.5-6e-3: consumes the Topaz `InterfaceDecl`. The syntactic rejects
  // (generic interface, heritage, optional fields / methods, non-identifier
  // names, index / call / construct signatures, accessors, generic methods,
  // unsupported field modifiers) all live in convert now; codegen enforces the
  // remaining semantic rules (duplicate members, void / fn-typed fields and
  // method params / returns). `readonly` on interface fields is accepted as a
  // no-op (carried as `isReadonly` on the member, unused here).
  private collectInterfaceMembers(iface: InterfaceDecl, sf: SourceModule): void {
    this.withSfVoid(sf, () => {
      const info = this.interfaces.get(iface.name)!;
      for (const m of iface.members) {
        if (m.kind === "interface_field") {
          const memberAnchor: { pos: number } = { pos: m.pos };
          const fname = m.name;
          if (info.fields.has(fname) || info.methods.has(fname)) {
            throw new CodegenError(memberAnchor, `duplicate member '${fname}' in interface '${info.name}'`);
          }
          const t = this.typeFromAnnotation(m.type, memberAnchor, sf);
          this.assertNotVoid(t, memberAnchor, "interface field type");
          if (t.kind === "fn") {
            throw new CodegenError(memberAnchor, "fn-typed interface fields are unsupported (Phase 1.5-3.5e)");
          }
          info.fields.set(fname, t);
          info.fieldOrder.push(fname);
        } else {
          const memberAnchor: { pos: number } = { pos: m.pos };
          const mname = m.name;
          if (info.fields.has(mname) || info.methods.has(mname)) {
            throw new CodegenError(memberAnchor, `duplicate member '${mname}' in interface '${info.name}'`);
          }
          const params = this.collectParams(m.params, sf);
          const returnType = this.typeFromAnnotation(m.returnType, memberAnchor, sf);
          // Phase 1.5-3.5e: interface vtable struct is emitted before the fn
          // typedef slot, so fn types in interface methods would forward-
          // reference an undeclared typedef. Reject at collection time.
          for (const p of params) {
            if (p.type.kind === "fn") {
              throw new CodegenError(memberAnchor, "fn-typed parameters on interface methods are unsupported (Phase 1.5-3.5e)");
            }
          }
          if (returnType.kind === "fn") {
            throw new CodegenError(memberAnchor, "fn-typed return on interface methods is unsupported (Phase 1.5-3.5e)");
          }
          info.methods.set(mname, { params, returnType });
          info.methodOrder.push(mname);
        }
      }
    });
  }

  // Phase 1.5-6e-3: consumes the Topaz `ClassDecl`. `extends` rejection,
  // implements-target shape, and member-kind / modifier syntax all live in
  // convert; the heritage list arrives pre-flattened as `implementsList`. `sf`
  // is the declaring module (set ambient for member type resolution); the
  // generic-monomorph path passes the generic class's `sf` via `infoOverride`.
  private collectClassMembers(cls: ClassDecl, sf: SourceModule, infoOverride?: ClassInfo): void {
    this.withSfVoid(sf, () => {
    // infoOverride is set when collecting members for a generic class
    // monomorph (the ClassInfo lives under the mangled name, not cls.name);
    // otherwise we look up by the source name.
    const info = infoOverride ?? this.classes.get(cls.name)!;
    const clsAnchor: { pos: number } = { pos: cls.pos };
    for (const ifaceName of cls.implementsList) {
      if (!this.interfaces.has(ifaceName)) {
        throw new CodegenError(clsAnchor, `unknown interface '${ifaceName}'`);
      }
      if (info.implements.includes(ifaceName)) {
        throw new CodegenError(clsAnchor, `class '${info.name}' lists interface '${ifaceName}' more than once`);
      }
      info.implements.push(ifaceName);
    }
    for (const m of cls.members) {
      const memberAnchor: { pos: number } = { pos: m.pos };
      // Phase 1.5-6 prep: public / private / protected / readonly は no-op
      // として受理(C 出力に可視性概念は無く、readonly も runtime 強制しない)。
      // static / abstract / override は意味が変わるので引き続き明示エラー。
      // convert は modifier を lowercase 文字列で持つので、診断は SyntaxKind 名
      // (`StaticKeyword` 等)へ再構成して旧メッセージと一致させる。
      for (const mod of m.modifiers) {
        if (mod === "public" || mod === "private" || mod === "protected" || mod === "readonly") {
          continue;
        }
        let cap: string = "";
        if (mod === "static") {
          cap = "Static";
        } else if (mod === "abstract") {
          cap = "Abstract";
        } else if (mod === "override") {
          cap = "Override";
        } else {
          throwInternalCodegenError(`unknown class member modifier '${mod}'`);
        }
        throw new CodegenError(memberAnchor, `class member modifier '${cap}Keyword' is unsupported`);
      }
      if (m.kind === "class_field") {
        this.collectField(info, m, sf);
      } else if (m.isCtor) {
        this.collectConstructor(info, m, sf);
      } else {
        this.collectMethod(info, m, sf);
      }
    }
    const hasCtor = info.ctor !== undefined;
    if (info.fields.size > 0 && !hasCtor) {
      // Phase 1.5-6 prep: if every field carries an initializer, synthesize a
      // zero-arg constructor that consists entirely of the initializer
      // assignments. Otherwise keep the historical error — at least one field
      // would be left untouched and we can't pick a sensible default for it
      // (and don't want to surprise callers with silent zero-init).
      let allInitialized = true;
      for (const f of info.fieldOrder) {
        if (!info.fieldInits.has(f)) {
          allInitialized = false;
          break;
        }
      }
      if (allInitialized) {
        info.ctor = { params: [], decl: undefined };
      } else {
        const missing = info.fieldOrder.filter((f) => !info.fieldInits.has(f));
        throw new CodegenError(
          clsAnchor,
          `class '${info.name}' has fields but no constructor; add an explicit constructor or a field initializer for: ${missing.join(", ")}`,
        );
      }
    }
    // Phase 1.5-3a: --strictPropertyInitialization 相当。constructor body の
    // top-level で `this.f = ...` 代入される field を集め、全 field がカバー
    // されていなければエラー。制御フロー (if/for/while/try/switch) 内の代入
    // は保守的に「無代入」扱い (1.5-3 で flow narrowing が入った後で再評価)。
    // generic class の monomorph 経路 (infoOverride) は同じ ctor decl を見る
    // ので結果が同じになるため skip する。
    const hasInfoOverride = infoOverride !== undefined;
    if (!hasInfoOverride) {
      this.verifyDefiniteFieldInit(info);
    }
    for (const ifaceName of info.implements) {
      this.verifyImplements(info, this.interfaces.get(ifaceName)!, clsAnchor);
    }
    });
  }

  private verifyDefiniteFieldInit(info: ClassInfo): void {
    if (info.fields.size === 0) return;
    const ctor = info.ctor;
    if (ctor === undefined) return; // field-without-ctor は上で報告済み
    const assigned = new Set<string>();
    // Phase 1.5-6 prep: field initializer (`x: T = init;`) を持つ field は
    // emitConstructorDefinition が ctor body 冒頭で代入を吐くため definitely
    // assigned。残りは従来通り ctor body top-level の `this.f = ...` で埋める
    // 必要がある。auto-synthesized ctor (decl === undefined) はそもそも全
    // field が initializer 持ちなので 2 つ目の集計はスキップする。
    for (const fname of info.fieldInits.keys()) assigned.add(fname);
    const ctorDecl = ctor.decl;
    if (ctorDecl !== undefined) {
      this.collectDefiniteFieldAssignments(ctorDecl.body, assigned);
    }
    for (const fname of info.fieldOrder) {
      if (!assigned.has(fname)) {
        // info.decl is the Topaz `ClassDecl` (or anon `TypeLiteralNode`); route
        // through typeErr, which accepts Topaz `{ pos }` anchors. The ambient
        // SourceFile is set by the enclosing collectClassMembers' withSf.
        let errAnchor: { pos: number } = { pos: info.decl.pos };
        if (ctorDecl !== undefined) errAnchor = { pos: ctorDecl.pos };
        throw this.typeErr(
          errAnchor,
          `field '${info.name}.${fname}' is not definitely assigned in the constructor (assign it directly under the constructor body, or add a field initializer 'x: T = init;' - control-flow inside if/for/while/try is not analyzed yet)`,
        );
      }
    }
  }

  // Phase 1.5-6e-3: walk the Topaz ctor body for top-level `this.f = ...`
  // assignments (`assign_expr` with op `=`, target `prop_access` on `this`).
  private collectDefiniteFieldAssignments(body: BlockStmt, out: Set<string>): void {
    for (const s of body.stmts) {
      if (s.kind !== "expr_stmt") continue;
      const e = s.expr;
      if (e.kind !== "assign_expr") continue;
      if (e.op !== "=") continue;
      const target = e.target;
      let assignedField: string = "";
      let hasAssignedField = false;
      switch (target.kind) {
        case "prop_access":
          if (target.receiver.kind === "this_expr") {
            assignedField = target.name;
            hasAssignedField = true;
          }
          break;
        default:
          break;
      }
      if (hasAssignedField) out.add(assignedField);
    }
  }

  // Phase 1.4b: exact structural match — interface field types and method
  // signatures must equal the class's. No coercion happens at the vtable
  // boundary, only at user-visible value sites.
  private verifyImplements(cls: ClassInfo, iface: InterfaceInfo, anchor: { pos: number }): void {
    for (const fname of iface.fieldOrder) {
      const want = iface.fields.get(fname)!;
      const got = cls.fields.get(fname);
      if (got === undefined) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}' is missing field '${fname}' required by interface '${iface.name}'`,
        );
      } else if (!typeEq(got, want)) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}.${fname}' has type ${typeIdent(got)}, but interface '${iface.name}' requires ${typeIdent(want)}`,
        );
      }
    }
    for (const mname of iface.methodOrder) {
      const want = iface.methods.get(mname)!;
      const got = cls.methods.get(mname);
      if (got === undefined) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}' is missing method '${mname}' required by interface '${iface.name}'`,
        );
      } else {
        if (!typeEq(got.returnType, want.returnType)) {
          throw new CodegenError(
            anchor,
            `class '${cls.name}.${mname}' returns ${typeIdent(got.returnType)}, but interface '${iface.name}' requires ${typeIdent(want.returnType)}`,
          );
        }
        if (got.params.length !== want.params.length) {
          throw new CodegenError(
            anchor,
            `class '${cls.name}.${mname}' has ${got.params.length} parameter(s), but interface '${iface.name}' requires ${want.params.length}`,
          );
        }
        for (let i = 0; i < want.params.length; i++) {
          const gotParam = got.params[i];
          const wantParam = want.params[i];
          if (!typeEq(gotParam.type, wantParam.type)) {
            throw new CodegenError(
              anchor,
              `class '${cls.name}.${mname}' parameter ${i + 1} has type ${typeIdent(gotParam.type)}, but interface '${iface.name}' requires ${typeIdent(wantParam.type)}`,
            );
          }
        }
      }
    }
  }

  private classImplements(className: string, ifaceName: string): boolean {
    const cls = this.classes.get(className);
    if (cls === undefined) {
      return false;
    } else {
      return cls.implements.includes(ifaceName);
    }
  }

  // Phase 1.5-6e-3: consumes the Topaz `ClassFieldMember`. Name-identifier,
  // optional `?`, and `!` rejection live in convert; `type` is always present.
  // `sf` positions the field's type-annotation diagnostics.
  private collectField(info: ClassInfo, m: ClassFieldMember, sf: SourceModule): void {
    const fieldAnchor: { pos: number } = { pos: m.pos };
    const fname = m.name;
    if (info.fields.has(fname)) {
      throw new CodegenError(fieldAnchor, `redeclaration of field '${fname}'`);
    }
    if (info.methods.has(fname)) {
      throw new CodegenError(fieldAnchor, `field '${fname}' conflicts with a method of the same name`);
    }
    // Phase 1.5-6 prep: field initializer (`x: T = init;`) を保存。型は注釈
    // 必須(初期化子からの推論は意図的に行わない、`let` / `const` と違って class
    // field は全プログラムから参照されるため型を syntactically 確定させたい)。
    // initializer 自体は emit 時に `emitWithExpected(init, t)` で型整合 + 必要な
    // coercion(class → iface / string-literal widening 等)を走らせる。
    const t = this.typeFromAnnotation(m.type, fieldAnchor, sf);
    this.assertNotVoid(t, fieldAnchor, "class field type");
    if (t.kind === "fn") {
      throw new CodegenError(fieldAnchor, "fn-typed class fields are unsupported (Phase 1.5-3.5e); store the closure in a local instead");
    }
    info.fields.set(fname, t);
    info.fieldOrder.push(fname);
    const initializer = m.initializer;
    if (initializer !== undefined) {
      info.fieldInits.set(fname, initializer);
    }
  }

  // Phase 1.5-6e-3: consumes the Topaz ctor member (`ClassMethodMember` with
  // `isCtor`). Generic-ctor / missing-body rejection live in convert.
  private collectConstructor(info: ClassInfo, m: ClassMethodMember, sf: SourceModule): void {
    const ctorAnchor: { pos: number } = { pos: m.pos };
    const existingCtor = info.ctor;
    if (existingCtor !== undefined) {
      throw new CodegenError(ctorAnchor, `class '${info.name}' has multiple constructors`);
    }
    const params = this.collectParams(m.params, sf);
    info.ctor = { params, decl: m };
  }

  // Phase 1.5-6e-3: consumes the Topaz `ClassMethodMember`. Name-identifier,
  // generic / optional / generator / missing-body rejection live in convert.
  private collectMethod(info: ClassInfo, m: ClassMethodMember, sf: SourceModule): void {
    const methodAnchor: { pos: number } = { pos: m.pos };
    const mname = m.name;
    if (info.methods.has(mname)) {
      throw new CodegenError(methodAnchor, `redeclaration of method '${mname}'`);
    }
    if (info.fields.has(mname)) {
      throw new CodegenError(methodAnchor, `method '${mname}' conflicts with a field of the same name`);
    }
    const params = this.collectParams(m.params, sf);
    const returnType = this.typeFromAnnotation(m.returnType, methodAnchor, sf);
    info.methods.set(mname, { params, returnType, decl: m });
  }

  // Phase 1.5-6e-3: consumes Topaz `FunctionParam[]`. Non-identifier name,
  // default / rest, parameter-property modifiers, and the optional-trailing rule
  // are all enforced in convert; `?` arrives as `isOptional` and `type` is always
  // present. `sf` positions the param's type-annotation diagnostics.
  private collectParams(params: Array<FunctionParam>, sf: SourceModule): ParamInfo[] {
    const out: ParamInfo[] = [];
    for (const p of params) {
      const paramAnchor: { pos: number } = { pos: p.pos };
      const annot = this.typeFromAnnotation(p.type, paramAnchor, sf);
      this.assertNotVoid(annot, paramAnchor, "parameter type");
      // Phase 1.5-6 prep: `param?: T` is the syntactic sugar for
      // `param: T | undefined`. Lift the declared type into the union here so
      // the rest of codegen (narrowing, undefined wrap helpers, vtable
      // signatures) sees a uniform representation regardless of source.
      const t = p.isOptional ? makeUnion([annot, T_UNDEFINED]) : annot;
      out.push({ name: p.name, type: t, isOptional: p.isOptional });
    }
    return out;
  }

  private emitClassStruct(info: ClassInfo): string {
    const lines: string[] = [];
    lines.push(`struct topaz_class_${info.name} {`);
    // Phase 1.5-3f: every class struct carries a tag pointer at offset 0 so
    // `instanceof` can read the runtime type from a `void *` (catch payload)
    // without knowing the concrete class up front. The tag itself is a static
    // sentinel per class; the constructor sets the field.
    lines.push("  const char *__topaz_class_tag;");
    for (const f of info.fieldOrder) {
      const t = info.fields.get(f)!;
      lines.push(`  ${cTypeName(t)} ${f};`);
    }
    lines.push("};");
    lines.push(`static const char topaz_class_${info.name}_tag = 0;`);
    return lines.join("\n");
  }

  private classMemberSignatures(info: ClassInfo): string[] {
    const lines: string[] = [];
    const ctor = info.ctor;
    if (ctor !== undefined) {
      lines.push(this.constructorSignature(info, ctor));
    }
    for (const method of info.methods.values()) {
      lines.push(this.methodSignature(info, method));
    }
    return lines;
  }

  private emitClassMemberDefinitions(info: ClassInfo): string[] {
    const out: string[] = [];
    const ctor = info.ctor;
    if (ctor !== undefined) out.push(this.emitConstructorDefinition(info, ctor));
    for (const method of info.methods.values()) {
      out.push(this.emitMethodDefinition(info, method));
    }
    return out;
  }

  private constructorSignature(
    info: ClassInfo,
    ctor: { params: ParamInfo[]; decl: ClassMethodMember | undefined },
  ): string {
    const params = ctor.params
      .map((p) => `${cTypeName(p.type)} ${p.name}`)
      .join(", ");
    const renderedParams = params.length > 0 ? params : "void";
    return `static topaz_class_${info.name} *topaz_class_${info.name}_new(${renderedParams})`;
  }

  private methodSignature(info: ClassInfo, method: MethodInfo): string {
    const name = method.decl.name;
    const ownerArg = `topaz_class_${info.name} *${TOPAZ_THIS}`;
    const tail = method.params.map((p) => `${cTypeName(p.type)} ${p.name}`).join(", ");
    const params = tail.length > 0 ? `${ownerArg}, ${tail}` : ownerArg;
    return `static ${cReturnTypeName(method.returnType)} topaz_class_${info.name}_method_${name}(${params})`;
  }

  private emitConstructorDefinition(
    info: ClassInfo,
    ctor: { params: ParamInfo[]; decl: ClassMethodMember | undefined },
  ): string {
    this.currentClass = info.name;
    this.scope.push();
    // Phase 1.5-6e-3: ctor body / field initializers feed the SCC, so set the
    // ambient SourceFile to the class's declaring module. Anon classes carry no
    // field inits and no user body, so the SCC is never entered for them; their
    // `info.sf` is a best-effort anchor (or undefined).
    const declSf = info.sf;
    const savedG = g_currentModule;
    const savedT = this.currentTypeModule;
    if (declSf !== undefined) {
      g_currentModule = declSf;
      this.currentTypeModule = declSf;
    }
    const ctorDecl = ctor.decl;
    const anchor: { pos: number } = ctorDecl !== undefined ? { pos: ctorDecl.pos } : { pos: info.decl.pos };
    for (const p of ctor.params) {
      this.scope.declareBinding(p.name, p.type, /* isConst */ false, anchor);
    }
    const bodyLines: string[] = [];
    bodyLines.push("{");
    bodyLines.push(
      `  topaz_class_${info.name} *${TOPAZ_THIS} = (topaz_class_${info.name} *)topaz_arena_calloc(1, sizeof(*${TOPAZ_THIS}));`,
    );
    bodyLines.push(
      `  ${TOPAZ_THIS}->__topaz_class_tag = &topaz_class_${info.name}_tag;`,
    );
    this.emitFieldInitializers(info, bodyLines);
    // Phase 1.5-6 prep: positional all-args auto-ctor (anonymous class
    // synthesized from a TypeLiteral). When `decl === undefined` and the
    // ctor carries params, each param maps 1:1 to a field of the same name
    // (recordAnonClass guarantees this) and we emit `this->f = f;` for each
    // in field order.
    if (ctorDecl === undefined && ctor.params.length > 0) {
      for (const p of ctor.params) {
        bodyLines.push(`  ${TOPAZ_THIS}->${p.name} = ${p.name};`);
      }
    }
    // Phase 1.5-6 prep: auto-synthesized ctors (decl === undefined) have no
    // user body — the field initializer block above is the entire body.
    if (ctorDecl !== undefined) {
      for (const s of ctorDecl.body.stmts) {
        if (s.kind === "return_stmt") {
          const stmtAnchor: { pos: number } = { pos: s.pos };
          throw new CodegenError(stmtAnchor, "`return` inside a constructor is unsupported");
        }
        bodyLines.push(this.emitStatement(s, 1));
      }
    }
    bodyLines.push(`  return ${TOPAZ_THIS};`);
    bodyLines.push("}");
    const rendered = `${this.constructorSignature(info, ctor)} ${bodyLines.join("\n")}`;
    this.scope.pop();
    this.currentClass = undefined;
    g_currentModule = savedG;
    this.currentTypeModule = savedT;
    return rendered;
  }

  // Phase 1.5-6 prep: each field initializer (`x: T = init;`) becomes a
  // `this->x = init;` written into the ctor body right after the calloc + tag
  // store, in field declaration order. The struct is already zero-initialized
  // by calloc, so forward references to later fields read 0 / NULL / false /
  // empty string — matching JS field init semantics (later declarations are
  // not yet evaluated when an earlier initializer runs). emitWithExpected
  // takes care of class → iface coercion, string-literal widening, and scalar
  // opt wrap; we route through it so initializer sites match assignment
  // sites. Phase 1.5-6e-3: the initializer is already a Topaz `Expr`; the
  // ambient SourceFile is set by emitConstructorDefinition.
  private emitFieldInitializers(info: ClassInfo, out: string[]): void {
    if (info.fieldInits.size === 0) return;
    for (const fname of info.fieldOrder) {
      const init = info.fieldInits.get(fname);
      if (init === undefined) continue;
      const fty = info.fields.get(fname)!;
      const initC = this.emitWithExpected(init, fty);
      out.push(`  ${TOPAZ_THIS}->${fname} = ${initC};`);
    }
  }

  private emitMethodDefinition(info: ClassInfo, method: MethodInfo): string {
    this.currentClass = info.name;
    const prevRet = this.currentReturnType;
    const prevLive = this.liveTryFrames;
    this.currentReturnType = method.returnType;
    this.liveTryFrames = 0;
    this.scope.push();
    const methodAnchor: { pos: number } = { pos: method.decl.pos };
    for (const p of method.params) {
      this.scope.declareBinding(p.name, p.type, /* isConst */ false, methodAnchor);
    }
    // Methods only exist on user-declared classes, so `info.sf` is defined.
    const methodSf = info.sf;
    let body = "";
    if (methodSf === undefined) {
      throwInternalCodegenError(`missing source module for method '${info.name}.${method.decl.name}'`);
    } else {
      body = this.emitBlockBoundary(method.decl.body, methodSf);
    }
    const rendered = `${this.methodSignature(info, method)} ${body}`;
    this.scope.pop();
    this.currentClass = undefined;
    this.currentReturnType = prevRet;
    this.liveTryFrames = prevLive;
    return rendered;
  }

  // Phase 1.4b: each interface gets a vtable struct. Fields become get/set
  // function pointers (so we don't have to pin field layouts across all
  // implementing classes), methods become function pointers that take
  // `void *self` as the first arg.
  private emitInterfaceVtableStruct(info: InterfaceInfo): string {
    const lines: string[] = [];
    lines.push(`struct topaz_iface_${info.name}_vt {`);
    if (info.fieldOrder.length === 0 && info.methodOrder.length === 0) {
      lines.push("  char __topaz_empty;");
    } else {
      for (const f of info.fieldOrder) {
        const t = info.fields.get(f)!;
        lines.push(`  ${cTypeName(t)} (*get_${f})(void *self);`);
        lines.push(`  void (*set_${f})(void *self, ${cTypeName(t)} value);`);
      }
      for (const mname of info.methodOrder) {
        const sig = info.methods.get(mname)!;
        const tail = sig.params.map((p) => `${cTypeName(p.type)} ${p.name}`).join(", ");
        const params = tail.length > 0 ? `void *self, ${tail}` : "void *self";
        lines.push(`  ${cReturnTypeName(sig.returnType)} (*${mname})(${params});`);
      }
    }
    lines.push("};");
    return lines.join("\n");
  }

  // Per-(interface, implementing-class) thin wrappers around the class's
  // field accesses and methods. Each one casts `void *self` back to
  // `topaz_class_<C> *` and forwards to the underlying access/call.
  private emitInterfaceWrappers(iface: InterfaceInfo, cls: ClassInfo): string[] {
    const out: string[] = [];
    const prefix = `topaz_iface_${iface.name}_for_${cls.name}`;
    for (const f of iface.fieldOrder) {
      const t = iface.fields.get(f)!;
      out.push(
        `static ${cTypeName(t)} ${prefix}_get_${f}(void *self) { return ((topaz_class_${cls.name} *)self)->${f}; }`,
      );
      out.push(
        `static void ${prefix}_set_${f}(void *self, ${cTypeName(t)} value) { ((topaz_class_${cls.name} *)self)->${f} = value; }`,
      );
    }
    for (const mname of iface.methodOrder) {
      const sig = iface.methods.get(mname)!;
      const declParams =
        sig.params.length === 0
          ? "void *self"
          : `void *self, ${sig.params.map((p) => `${cTypeName(p.type)} ${p.name}`).join(", ")}`;
      const callArgs = [`(topaz_class_${cls.name} *)self`, ...sig.params.map((p) => p.name)].join(", ");
      const callExpr = `topaz_class_${cls.name}_method_${mname}(${callArgs})`;
      // Phase 1.5-6 prep: void-returning method wrappers must not say
      // `return <void-expr>`; the C standard forbids it inside a void function.
      const body = sig.returnType.kind === "void" ? `${callExpr};` : `return ${callExpr};`;
      out.push(
        `static ${cReturnTypeName(sig.returnType)} ${prefix}_${mname}(${declParams}) { ${body} }`,
      );
    }
    return out;
  }

  private emitInterfaceVtableInstance(iface: InterfaceInfo, cls: ClassInfo): string {
    const prefix = `topaz_iface_${iface.name}_for_${cls.name}`;
    const entries: string[] = [];
    for (const f of iface.fieldOrder) {
      entries.push(`  .get_${f} = ${prefix}_get_${f},`);
      entries.push(`  .set_${f} = ${prefix}_set_${f},`);
    }
    for (const mname of iface.methodOrder) {
      entries.push(`  .${mname} = ${prefix}_${mname},`);
    }
    const body = entries.length === 0 ? "  .__topaz_empty = 0,\n" : entries.join("\n") + "\n";
    return `static const struct topaz_iface_${iface.name}_vt ${prefix}_vt = {\n${body}};`;
  }

  // Phase 1.5-6 prep: reject `void` outside of function / method / fn return
  // slots. `void` has no value representation, so it cannot appear as a
  // parameter type, variable type, field type, container element / value /
  // key, union variant, or type argument.
  private assertNotVoid(t: TopazType, anchor: { pos: number }, what: string): void {
    if (t.kind === "void") {
      throw this.typeErr(anchor, `\`void\` is only allowed as a function / method return type (used in ${what})`);
    }
  }

  // Phase 1.5-6e-1: build a CodegenError for a diagnostic anchor that is either
  // a tsc node (carries its own SourceFile) or a Topaz node `{ pos }` (file
  // supplied by the ambient `currentTypeModule`). The Topaz `pos` equals the tsc
  // `getStart(sf)` that `convertType` recorded, so positions are identical to
  // the pre-migration tsc-anchored errors.
  private typeErr(anchor: { pos: number }, message: string): CodegenError {
    const module = this.currentTypeModule;
    if (module === undefined) {
      return new FormattedCodegenError(message).value;
    } else {
      const { line, col } = posToLineCol(module, anchor.pos);
      return new FormattedCodegenError(`${module.filePath}:${line + 1}:${col + 1}: ${message}`).value;
    }
  }

  // decl-land → emit/infer SCC boundary helper. Sets the ambient
  // `g_currentModule` (so CodegenError can resolve Topaz-node positions) and
  // `currentTypeModule` (so typeFromAnnotation reached from the SCC has a module
  // for inline annotation positions), runs the SCC, and restores.
  private withSfVoid(sf: SourceModule, fn: () => void): void {
    const savedG = g_currentModule;
    const savedT = this.currentTypeModule;
    g_currentModule = sf;
    this.currentTypeModule = sf;
    fn();
    g_currentModule = savedG;
    this.currentTypeModule = savedT;
  }

  private withSfString(sf: SourceModule, fn: () => string): string {
    const savedG = g_currentModule;
    const savedT = this.currentTypeModule;
    g_currentModule = sf;
    this.currentTypeModule = sf;
    const out = fn();
    g_currentModule = savedG;
    this.currentTypeModule = savedT;
    return out;
  }

  private withSfFunctionSig(sf: SourceModule, fn: () => FunctionSig): FunctionSig {
    const savedG = g_currentModule;
    const savedT = this.currentTypeModule;
    g_currentModule = sf;
    this.currentTypeModule = sf;
    const out = fn();
    g_currentModule = savedG;
    this.currentTypeModule = savedT;
    return out;
  }

  // The statement / block is a Topaz node; set the ambient SourceModule so the
  // SCC can resolve positions, then emit directly.
  private emitStatementBoundary(stmt: Stmt, sf: SourceModule): string {
    return this.withSfString(sf, () => this.emitStatement(stmt, 1));
  }

  private emitBlockBoundary(block: BlockStmt, sf: SourceModule): string {
    return this.withSfString(sf, () => this.emitBlock(block, 0));
  }

  // Phase 1.5-6e-1: the type machine consumes Topaz `TypeNode` (ast.ts). `sf` is
  // the module the tree was converted from — threaded so `typeErr` can position
  // diagnostics (Topaz nodes carry `pos` but not their file) and switched when
  // recursing into an alias body declared in another module. The save/restore
  // of `currentTypeModule` keeps it correct after each nested resolution returns.
  private typeFromAnnotation(
    node: TypeNode | undefined,
    anchor: { pos: number },
    sf: SourceModule,
  ): TopazType {
    const savedSf = this.currentTypeModule;
    this.currentTypeModule = sf;
    const out = this.typeFromAnnotationCore(node, anchor, sf);
    this.currentTypeModule = savedSf;
    return out;
  }

  private typeFromAnnotationCore(
    node: TypeNode | undefined,
    anchor: { pos: number },
    sf: SourceModule,
  ): TopazType {
    if (node === undefined) throw this.typeErr(anchor, "type annotation required");
    const nodeAnchor: { pos: number } = { pos: node.pos };
    if (node.kind === "type_void") return T_VOID;
    if (node.kind === "type_unknown") return T_UNKNOWN;
    // Phase 1.5-3e: string literal type (`kind: "circle"`) for discriminators.
    if (node.kind === "type_str_lit") {
      const v = node.value;
      for (let i = 0; i < v.length; i++) {
        const code = v.charCodeAt(i);
        if (code > 0x7e) {
          throw this.typeErr(nodeAnchor, "string literal type must be ASCII (1.5-3e)");
        }
      }
      return { kind: "string_literal", value: v };
    }
    // Phase 1.5-3b: `T | undefined` only. cTypeName enforces the shape; we
    // accept any union here so error messages can say "scalar | undefined is
    // deferred to 1.5-3c" instead of "unsupported type".
    // Phase 1.5-3e: class union with a shared `kind: "literal"` discriminator
    // collapses into a `dunion` (tagged fat pointer) at this site.
    if (node.kind === "type_union") {
      const variants: TopazType[] = [];
      for (const t of node.variants) {
        const variantAnchor: { pos: number } = { pos: t.pos };
        const vt = this.typeFromAnnotation(t, variantAnchor, sf);
        this.assertNotVoid(vt, variantAnchor, "union variant");
        variants.push(vt);
      }
      const dunion = this.tryMakeDiscriminatedUnion(variants, nodeAnchor);
      if (dunion !== undefined) return dunion;
      return makeUnion(variants);
    }
    if (node.kind === "type_array") {
      const elem = this.typeFromAnnotation(node.elem, nodeAnchor, sf);
      this.assertNotVoid(elem, nodeAnchor, "Array element");
      const arr = arrayOf(elem);
      if (arr === undefined) {
        throw this.typeErr(nodeAnchor, `no Array monomorph for element type ${typeIdent(elem)}`);
      }
      this.recordArrayMonomorph(arr);
      return arr;
    }
    if (node.kind === "type_ref") {
      const refName = node.name;
      // Phase 1.5-6e-1: `number` / `string` / `boolean` / `undefined` are
      // keyword types in tsc but lower to bare `type_ref` after conversion.
      // Resolve them first so they retain keyword priority over type params /
      // aliases / class names (matching the pre-migration keyword branches at
      // the top of this function).
      if (refName === "number") return T_NUMBER;
      if (refName === "boolean") return T_BOOLEAN;
      if (refName === "string") return T_STRING;
      if (refName === "undefined") return T_UNDEFINED;
      if (refName === "never") return T_VOID;
      // Phase 1.4c-2: when emitting under an active type-parameter scope,
      // bare type references like `T` resolve through the substitution. Must
      // come before the class/interface lookup so that a class declared with
      // the same name as a type parameter doesn't shadow the binding.
      const typeParamScope = this.typeParamScope;
      if (typeParamScope !== undefined) {
        const scoped = typeParamScope.get(refName);
        if (scoped !== undefined) {
          if (node.typeArgs.length > 0) {
            throw this.typeErr(nodeAnchor, `type parameter '${refName}' cannot have type arguments`);
          }
          return scoped;
        }
      }
      // Phase 1.5-6 prep: type alias substitution. Lookup sits between
      // typeParamScope (so a `T` param shadows a same-named alias inside a
      // generic body) and the built-ins (`Array` / `Map` / `Set` / `Iterator`
      // collision is rejected at declaration time, so the ordering here is
      // only relevant for error message clarity). Resolution is memoized;
      // `resolving` guards against cycles like `type A = B; type B = A;`.
      {
        const alias = this.typeAliases.get(refName);
        if (alias !== undefined) {
          if (node.typeArgs.length > 0) {
            throw this.typeErr(nodeAnchor, `type alias '${refName}' takes no type arguments (Phase 1.5-6 prep)`);
          }
          const cachedAliasType = alias.resolved;
          if (cachedAliasType !== undefined) return cachedAliasType;
          if (alias.resolving) {
            throw this.typeErr(nodeAnchor, `circular type alias '${refName}'`);
          }
          alias.resolving = true;
          const aliasAnchor: { pos: number } = { pos: alias.body.pos };
          const resolvedAliasType = this.typeFromAnnotation(alias.body, aliasAnchor, alias.sf);
          alias.resolved = resolvedAliasType;
          alias.resolving = false;
          return resolvedAliasType;
        }
      }
      if (refName === "Array") {
        if (node.typeArgs.length !== 1) {
          throw this.typeErr(nodeAnchor, "Array<T> requires exactly one type argument");
        }
        const elem = this.typeFromAnnotation(node.typeArgs[0], nodeAnchor, sf);
        this.assertNotVoid(elem, nodeAnchor, "Array element");
        const arr = arrayOf(elem);
        if (arr === undefined) {
          throw this.typeErr(nodeAnchor, `no Array monomorph for element type ${typeIdent(elem)}`);
        }
        this.recordArrayMonomorph(arr);
        return arr;
      }
      if (refName === "Map") {
        if (node.typeArgs.length !== 2) {
          throw this.typeErr(nodeAnchor, "Map<K, V> requires exactly two type arguments");
        }
        const k = this.typeFromAnnotation(node.typeArgs[0], nodeAnchor, sf);
        this.assertNotVoid(k, nodeAnchor, "Map key");
        const v = this.typeFromAnnotation(node.typeArgs[1], nodeAnchor, sf);
        this.assertNotVoid(v, nodeAnchor, "Map value");
        const m = mapOf(k, v);
        if (m === undefined) {
          throw this.typeErr(nodeAnchor, `no Map monomorph for key=${typeIdent(k)}, value=${typeIdent(v)}`);
        }
        this.recordMapMonomorph(m);
        return m;
      }
      if (refName === "Set") {
        if (node.typeArgs.length !== 1) {
          throw this.typeErr(nodeAnchor, "Set<T> requires exactly one type argument");
        }
        const elem = this.typeFromAnnotation(node.typeArgs[0], nodeAnchor, sf);
        this.assertNotVoid(elem, nodeAnchor, "Set element");
        const s = setOf(elem);
        if (s === undefined) {
          throw this.typeErr(nodeAnchor, `no Set monomorph for element type ${typeIdent(elem)}`);
        }
        this.recordSetMonomorph(s);
        return s;
      }
      // Phase 1.5-3.5g-iterator: Iterator<T> as first-class type. Elem must be
      // scalar / class / interface (same shape constraint as Map / Set values).
      // The typedef alone doesn't pull in a _next function — that's recorded
      // at construction sites (Map.values / Map.keys / Set.values / Set.keys).
      if (refName === "Iterator") {
        if (node.typeArgs.length !== 1) {
          throw this.typeErr(nodeAnchor, "Iterator<T> requires exactly one type argument");
        }
        const elem = this.typeFromAnnotation(node.typeArgs[0], nodeAnchor, sf);
        this.assertNotVoid(elem, nodeAnchor, "Iterator element");
        if (
          elem.kind !== "number" && elem.kind !== "boolean" && elem.kind !== "string"
          && !isClassType(elem) && !isInterfaceType(elem)
        ) {
          throw this.typeErr(
            nodeAnchor,
            `Iterator<T>: element type ${typeIdent(elem)} is unsupported (must be scalar / class / interface)`,
          );
        }
        // Reserve typedef so a bare `Iterator<T>` annotation (e.g. function
        // return type) emits the struct even if no .values() / .keys() call
        // appears in this TU.
        this.iterTypedefMonomorphs.set(typeKey(elem), elem);
        return { kind: "iter", elem };
      }
      if (this.genericClasses.has(refName)) {
        return this.instantiateGenericClass(refName, node.typeArgs, nodeAnchor, sf);
      }
      if (this.classes.has(refName)) {
        if (node.typeArgs.length > 0) {
          throw this.typeErr(nodeAnchor, `class '${refName}' takes no type arguments`);
        }
        return classOf(refName);
      }
      if (this.interfaces.has(refName)) {
        if (node.typeArgs.length > 0) {
          throw this.typeErr(nodeAnchor, `interface '${refName}' takes no type arguments (Phase 1.4c)`);
        }
        return interfaceOf(refName);
      }
      // Unknown type-reference name (e.g. `null`, an undeclared type) falls
      // through to the unsupported-type throw below.
    }
    // Phase 1.5-3.5e: `(p: T) => R` function type. Param annotations are
    // mandatory (no contextual inference yet); no rest/optional/default. The
    // param-shape rejections (non-identifier name, optional/rest, missing
    // annotation) live in `convertType` now, so they never reach this branch.
    if (node.kind === "type_fn") {
      const params: ParamInfo[] = [];
      const seenNames = new Set<string>();
      for (const p of node.params) {
        const paramAnchor: { pos: number } = { pos: p.pos };
        const pt = this.typeFromAnnotation(p.type, paramAnchor, sf);
        this.assertNotVoid(pt, paramAnchor, "fn-type parameter");
        if (seenNames.has(p.name)) {
          throw this.typeErr(paramAnchor, `duplicate parameter name '${p.name}'`);
        }
        seenNames.add(p.name);
        params.push({ name: p.name, type: pt, isOptional: false });
      }
      const returnAnchor: { pos: number } = { pos: node.returnType.pos };
      const ret = this.typeFromAnnotation(node.returnType, returnAnchor, sf);
      const ft: TopazType = { kind: "fn", params, returnType: ret };
      this.recordFnMonomorph(ft);
      return ft;
    }
    // Phase 1.5-6 prep: object literal type `{ a: T; b: U }`. Lowered to an
    // anonymous class. Members must all be plain property signatures with a
    // simple identifier name and a type annotation; readonly modifier is
    // accepted as a no-op (mirroring class / interface field treatment in
    // prep #1). The name / modifier / missing-type rejections live in
    // `convertType`; method signatures, optional `f?: T`, empty `{}`, and
    // duplicate properties are rejected here. Field order is alphabetical
    // (see recordAnonClass) so two TypeLiterals with the same shape collapse
    // to the same C struct.
    if (node.kind === "type_literal") {
      // Phase 1.5-6 prep #14: pre-allocated anon classes from recursive
      // aliases short-circuit the dedupe path here. Field-fill has already
      // populated this anon (or will, if we're currently inside its own fill
      // pass). Either way the class type is the stable forward reference.
      const preAllocated = this.findPreAllocatedAnon(node, sf);
      if (preAllocated !== undefined) {
        return classOf(preAllocated.anonName);
      }
      if (node.members.length === 0) {
        throw this.typeErr(nodeAnchor, "empty object literal type `{}` is unsupported (Phase 1.5-6 prep)");
      }
      const fields = new Map<string, TopazType>();
      // Phase 1.5-6 prep-optional-param: collect optional field names so the
      // anon-class ctor and `recordAnonClass` can mark which positions accept
      // an auto-filled `undefined` at the object-literal expression site.
      const optionalFields = new Set<string>();
      for (const m of node.members) {
        const memberAnchor: { pos: number } = { pos: m.pos };
        if (m.kind !== "type_lit_field") {
          throw this.typeErr(memberAnchor, "object literal type only supports plain property signatures (Phase 1.5-6 prep)");
        }
        const fname = m.name;
        if (fields.has(fname)) {
          throw this.typeErr(memberAnchor, `duplicate property '${fname}' in object literal type`);
        }
        const annot = this.typeFromAnnotation(m.type, memberAnchor, sf);
        this.assertNotVoid(annot, memberAnchor, "object literal type property");
        // Phase 1.5-6 prep-optional-param: `f?: T` is the syntactic sugar for
        // `f: T | undefined`. Lift here so structural dedupe (canonical key
        // includes typeIdent) collapses `{ f?: T }` and `{ f: T | undefined }`
        // to the same anon class.
        const fty = m.isOptional ? makeUnion([annot, T_UNDEFINED]) : annot;
        if (m.isOptional) optionalFields.add(fname);
        fields.set(fname, fty);
      }
      const anonName = this.recordAnonClass(fields, optionalFields, node);
      return classOf(anonName);
    }
    throw this.typeErr(nodeAnchor, `unsupported type (${node.kind})`);
  }

  private formatSignature(sig: TopLevelFunctionSig): string {
    const params = sig.params
      .map((p) => `${cTypeName(p.type)} ${p.name}`)
      .join(", ");
    const paramsTail = params.length > 0 ? params : "void";
    return `static ${cReturnTypeName(sig.returnType)} ${sig.cName}(${paramsTail})`;
  }

  private emitFunctionDefinition(fn: FunctionDecl, sf: SourceModule): string {
    const sig = this.functionSigForDecl(fn);
    const prevRet = this.currentReturnType;
    const prevLive = this.liveTryFrames;
    this.currentReturnType = sig.returnType;
    this.liveTryFrames = 0;
    this.scope.push();
    const fnAnchor: { pos: number } = { pos: fn.pos };
    // Phase 1.5-6 prep-optional-param: declare each param using the lifted
    // type from `sig.params` (where `?`-marked params already carry
    // `T | undefined`), not the raw annotation — otherwise narrowing would
    // disagree with the actual C parameter type.
    for (const p of sig.params) {
      this.scope.declareBinding(p.name, p.type, /* isConst */ false, fnAnchor);
    }
    const body = this.emitBlockBoundary(fn.body, sf);
    const rendered = `${this.formatSignature(sig)} ${body}`;
    this.scope.pop();
    this.currentReturnType = prevRet;
    this.liveTryFrames = prevLive;
    return rendered;
  }

  // Phase 1.4c-2: format a monomorph's C signature from its resolved
  // FunctionSig. Distinct from formatSignature(fn) which re-resolves via
  // typeFromAnnotation; here the substitution has already been applied and we
  // want the mangled name instead of the source name.
  private formatMonomorphSignature(mangled: string, sig: FunctionSig): string {
    const params = sig.params
      .map((p) => `${cTypeName(p.type)} ${p.name}`)
      .join(", ");
    const paramsTail = params.length > 0 ? params : "void";
    return `static ${cReturnTypeName(sig.returnType)} ${mangled}(${paramsTail})`;
  }

  private emitMonomorphDefinition(mono: MonomorphInfo): string {
    const prevScope = this.typeParamScope;
    this.typeParamScope = mono.subs;
    const prevRet = this.currentReturnType;
    const prevLive = this.liveTryFrames;
    this.currentReturnType = mono.sig.returnType;
    this.liveTryFrames = 0;
    this.scope.push();
    const monoAnchor: { pos: number } = { pos: mono.decl.pos };
    for (const p of mono.sig.params) {
      this.scope.declareBinding(p.name, p.type, /* isConst */ false, monoAnchor);
    }
    const body = this.emitBlockBoundary(mono.decl.body, mono.sf);
    const rendered = `${this.formatMonomorphSignature(mono.mangled, mono.sig)} ${body}`;
    this.scope.pop();
    this.currentReturnType = prevRet;
    this.liveTryFrames = prevLive;
    this.typeParamScope = prevScope;
    return rendered;
  }

  // Phase 1.5-3.5e: derive the fn type of an arrow expression without
  // emitting code. Used by inferType when the arrow appears in a position
  // that needs only its type (e.g. as the RHS of a `let f = ...` whose
  // initializer is being typed before the matching declareVar runs the
  // emit path).
  private inferArrowType(arrow: ArrowExpr, expectedType: TopazType | undefined): TopazType {
    let expectedFn: FnType | undefined = undefined;
    if (expectedType !== undefined) {
      if (expectedType.kind === "fn") {
        expectedFn = expectedType;
      }
    }
    if (expectedFn !== undefined && expectedFn.params.length !== arrow.params.length) {
      throw new CodegenError(
        { pos: arrow.pos },
        `arrow function arity ${arrow.params.length} does not match expected type ${typeIdent(expectedFn)} (arity ${expectedFn.params.length})`,
      );
    }
    const params: ParamInfo[] = [];
    for (let i = 0; i < arrow.params.length; i++) {
      const p = arrow.params[i];
      const paramAnchor: { pos: number } = { pos: p.pos };
      const paramType = p.type;
      let pt: TopazType = T_VOID;
      if (paramType !== undefined) {
        pt = this.typeFromAnnotation(paramType, paramAnchor, g_currentModule!);
      } else if (expectedFn !== undefined) {
        pt = expectedFn.params[i].type;
      } else {
        throw new CodegenError(paramAnchor, "arrow function parameter requires a type annotation (no contextual type available)");
      }
      params.push({ name: p.name, type: pt, isOptional: false });
    }
    let returnType: TopazType = T_VOID;
    let inferredExprBodyType: TopazType | undefined = undefined;
    const arrowReturnType = arrow.returnType;
    if (arrowReturnType !== undefined) {
      const returnAnchor: { pos: number } = { pos: arrowReturnType.pos };
      returnType = this.typeFromAnnotation(arrowReturnType, returnAnchor, g_currentModule!);
    } else if (expectedFn !== undefined) {
      returnType = expectedFn.returnType;
    } else if (arrow.body.kind === "arrow_expr_body") {
      const inferred = this.inferArrowExpressionBodyType(arrow, params);
      inferredExprBodyType = inferred;
      returnType = inferred;
    } else {
      throw new CodegenError({ pos: arrow.pos }, "arrow function requires an explicit return type annotation (no contextual type available)");
    }
    if (returnType.kind === "void" && arrow.body.kind === "arrow_expr_body") {
      let bodyType: TopazType = T_VOID;
      if (inferredExprBodyType !== undefined) {
        bodyType = inferredExprBodyType;
      } else {
        bodyType = this.inferArrowExpressionBodyType(arrow, params);
      }
      if (bodyType.kind !== "void") {
        throw new CodegenError({ pos: arrow.pos }, "void-returning arrows require block bodies");
      }
    }
    return { kind: "fn", params, returnType };
  }

  private inferArrowExpressionBodyType(
    arrow: ArrowExpr,
    params: Array<ParamInfo>,
  ): TopazType {
    const body = arrow.body;
    switch (body.kind) {
      case "arrow_expr_body":
        return this.inferArrowBodyExpressionTypeInScope(body.expr, arrow, params);
      case "arrow_block_body":
        throwInternalCodegenError("inferArrowExpressionBodyType: not an expression body");
        return T_VOID;
    }
  }

  private inferArrowBodyExpressionTypeInScope(
    expr: Expr,
    arrow: ArrowExpr,
    params: Array<ParamInfo>,
  ): TopazType {
    const arrowAnchor: { pos: number } = { pos: arrow.pos };
    this.scope.push();
    for (const p of params) {
      this.scope.declareBinding(p.name, p.type, /* isConst */ false, arrowAnchor);
    }
    const inferred = this.inferArrowBodyExpressionType(expr);
    this.scope.pop();
    return inferred;
  }

  private inferArrowBodyExpressionType(expr: Expr): TopazType {
    if (expr.kind === "call_expr") {
      const voidCall = this.tryInferVoidCallExpression(expr);
      if (voidCall !== undefined) return voidCall;
    }
    return this.inferType(expr);
  }

  private tryInferVoidCallExpression(expr: CallExpr): TopazType | undefined {
    if (expr.optional) return undefined;
    const callee = expr.callee;
    if (callee.kind === "prop_access") {
      return this.tryInferVoidPropCallExpression(expr, callee);
    }
    if (callee.kind === "ident") {
      if (callee.name === "writeFileSync") {
        this.checkNodeFsWriteFileSyncArgs(expr);
        return T_VOID;
      }
      if (callee.name === "mkdirSync") {
        this.checkNodeFsMkdirSyncArgs(expr);
        return T_VOID;
      }
      if (callee.name === "execFileSync") {
        this.checkNodeChildProcessExecFileSyncArgs(expr);
        return T_VOID;
      }
    }
    return undefined;
  }

  private tryInferVoidPropCallExpression(
    expr: CallExpr,
    callee: PropAccessExpr,
  ): TopazType | undefined {
    const receiver = callee.receiver;
    if (
      receiver.kind === "ident" &&
      receiver.name === "console" &&
      (callee.name === "log" || callee.name === "error")
    ) {
      this.checkConsoleCallArgs(expr, callee.name);
      return T_VOID;
    }
    if (receiver.kind === "prop_access") {
      const receiverBase = receiver.receiver;
      if (
        receiverBase.kind === "ident" &&
        receiverBase.name === "process" &&
        (receiver.name === "stdout" || receiver.name === "stderr") &&
        callee.name === "write"
      ) {
        this.checkProcessStreamWriteArgs(expr, receiver.name);
        return T_VOID;
      }
    }
    if (callee.name !== "push" && callee.name !== "set" && callee.name !== "add") {
      return undefined;
    }
    const baseType = this.inferType(callee.receiver);
    if (isArrayType(baseType) && callee.name === "push") {
      if (expr.args.length !== 1) {
        throw new CodegenError({ pos: expr.pos }, "Array.push expects exactly one argument");
      }
      this.expectType(expr.args[0], arrayElem(baseType)!);
      return T_VOID;
    }
    if (isMapType(baseType) && callee.name === "set") {
      if (expr.args.length !== 2) {
        throw new CodegenError({ pos: expr.pos }, "Map.set expects exactly two arguments");
      }
      this.expectType(expr.args[0], mapKey(baseType)!);
      this.expectType(expr.args[1], mapValue(baseType)!);
      return T_VOID;
    }
    if (isSetType(baseType) && callee.name === "add") {
      if (expr.args.length !== 1) {
        throw new CodegenError({ pos: expr.pos }, "Set.add expects exactly one argument");
      }
      this.expectType(expr.args[0], setElem(baseType)!);
      return T_VOID;
    }
    return undefined;
  }

  // Phase 1.5-3.5f: infer the fn type of a callback expression given the
  // expected param types (typically supplied by an Array.map / .filter call
  // site from the source element type). Unlike `inferArrowType`, the return
  // type is inferred from the arrow's body when no annotation is present —
  // .map's result element type isn't known until we read the callback's
  // return. Block-bodied arrows still require an explicit return annotation
  // since we don't walk return statements to infer.
  //
  // Non-arrow callbacks must already type as `fn`; their param types and
  // arity must match exactly (no implicit coercion, mirroring how function
  // call argument types are checked).
  private inferCallbackFn(
    cb: Expr,
    paramTypes: Array<TopazType>,
    label: string,
  ): FnType {
    const cbAnchor: { pos: number } = { pos: cb.pos };
    if (cb.kind === "arrow_expr") {
      const cbBody = cb.body;
      if (cb.params.length !== paramTypes.length) {
        throw new CodegenError(
          cbAnchor,
          `${label} callback arity ${cb.params.length} does not match expected ${paramTypes.length}`,
        );
      }
      const params: ParamInfo[] = [];
      const seenNames = new Set<string>();
      for (let i = 0; i < cb.params.length; i++) {
        const p = cb.params[i];
        const paramAnchor: { pos: number } = { pos: p.pos };
        const pt = paramTypes[i];
        const paramType = p.type;
        if (paramType !== undefined) {
          const annot = this.typeFromAnnotation(paramType, paramAnchor, g_currentModule!);
          if (!typeEq(annot, pt)) {
            throw new CodegenError(
              paramAnchor,
              `${label} callback parameter type ${typeIdent(annot)} does not match expected ${typeIdent(pt)}`,
            );
          }
        }
        if (seenNames.has(p.name)) {
          throw new CodegenError(paramAnchor, `duplicate parameter name '${p.name}'`);
        }
        seenNames.add(p.name);
        params.push({ name: p.name, type: pt, isOptional: false });
      }
      let returnType: TopazType = T_VOID;
      const cbReturnType = cb.returnType;
      if (cbReturnType !== undefined) {
        const returnAnchor: { pos: number } = { pos: cbReturnType.pos };
        returnType = this.typeFromAnnotation(cbReturnType, returnAnchor, g_currentModule!);
      } else if (cbBody.kind === "arrow_expr_body") {
        returnType = this.inferArrowExpressionBodyType(cb, params);
      } else {
        throw new CodegenError(
          { pos: cb.pos },
          `block-bodied arrow callback requires an explicit return type annotation`,
        );
      }
      return { kind: "fn", params, returnType };
    }
    const t = this.inferType(cb);
    if (t.kind === "fn") {
      const fnType = t;
      if (fnType.params.length !== paramTypes.length) {
        throw new CodegenError(
          { pos: cb.pos },
          `${label} callback arity ${fnType.params.length} does not match expected ${paramTypes.length}`,
        );
      }
      for (let i = 0; i < paramTypes.length; i++) {
        const gotParam = fnType.params[i];
        const expectedParam = paramTypes[i];
        if (!typeEq(gotParam.type, expectedParam)) {
          throw new CodegenError(
            { pos: cb.pos },
            `${label} callback parameter ${i} type ${typeIdent(gotParam.type)} does not match expected ${typeIdent(expectedParam)}`,
          );
        }
      }
      return fnType;
    }
    throw new CodegenError(cbAnchor, `${label} callback must be a function value, got ${typeIdent(t)}`);
  }

  // Phase 1.5-3.5e: emit a typedef for a fn signature. The struct holds a
  // function pointer that takes `void *env` as its hidden first parameter
  // followed by the user-visible params, and a generic env pointer that the
  // arrow's body uses to reach its captures. Both fields are present even for
  // arrows with no captures (env is just NULL) so the call site dispatch is
  // uniform.
  private emitFnTypedef(t: TopazType): string {
    if (t.kind === "fn") {
      const fnType = t;
      const name = typeIdent(fnType);
      const ret = cReturnTypeName(fnType.returnType);
      const paramList = fnType.params.length === 0
        ? "void *"
        : ["void *", ...fnType.params.map((p) => cTypeName(p.type))].join(", ");
      return `typedef struct ${name} {\n  ${ret} (*fn)(${paramList});\n  void *env;\n} ${name};`;
    }
    throwInternalCodegenError("emitFnTypedef: not a fn type");
  }

  private fnValueWrapperName(sig: TopLevelFunctionSig): string {
    return `topaz_fn_value_${sig.cName}`;
  }

  private fnValueWrapperSignature(sig: TopLevelFunctionSig): string {
    const params = sig.params
      .map((p) => `${cTypeName(p.type)} ${p.name}`)
      .join(", ");
    const paramsTail = params.length > 0 ? ", " + params : "";
    return `static ${cReturnTypeName(sig.returnType)} ${this.fnValueWrapperName(sig)}(void *__topaz_env${paramsTail})`;
  }

  private recordTopLevelFunctionValueWrapper(sig: TopLevelFunctionSig): string {
    const wrapperName = this.fnValueWrapperName(sig);
    if (this.fnValueWrappers.has(wrapperName)) return wrapperName;
    this.fnValueWrappers.add(wrapperName);
    const args = sig.params.map((p) => p.name).join(", ");
    const call = `${sig.cName}(${args})`;
    const lines: string[] = [];
    lines.push(`${this.fnValueWrapperSignature(sig)} {`);
    lines.push("  (void)__topaz_env;");
    if (sig.returnType.kind === "void") {
      lines.push(`  ${call};`);
    } else {
      lines.push(`  return ${call};`);
    }
    lines.push("}");
    this.arrowFwdLines.push(`${this.fnValueWrapperSignature(sig)};`);
    this.arrowDefLines.push(lines.join("\n"));
    return wrapperName;
  }

  private emitTopLevelFunctionValue(sig: TopLevelFunctionSig): string {
    const fnType: TopazType = { kind: "fn", params: sig.params, returnType: sig.returnType };
    this.recordFnMonomorph(fnType);
    const wrapperName = this.recordTopLevelFunctionValueWrapper(sig);
    const fnTypeName = typeIdent(fnType);
    const retCType = cReturnTypeName(sig.returnType);
    const paramCasts = sig.params.map((p) => ", " + cTypeName(p.type)).join("");
    return `((${fnTypeName}){ .fn = (${retCType}(*)(void *${paramCasts}))${wrapperName}, .env = NULL })`;
  }

  private pushLoopCtx(kind: string): void {
    const next = new LoopCtxFrame();
    next.kind = kind;
    next.prev = this.loopCtx;
    this.loopCtx = next;
  }

  private popLoopCtx(): void {
    const top = this.loopCtx;
    if (top !== undefined) {
      this.loopCtx = top.prev;
    }
  }

  private resetLoopCtx(): LoopCtxFrame | undefined {
    const prev = this.loopCtx;
    this.loopCtx = undefined;
    return prev;
  }

  private restoreLoopCtx(prev: LoopCtxFrame | undefined): void {
    this.loopCtx = prev;
  }

  // Phase 1.5-3.5e: walk a Topaz arrow expression and emit it as a static C
  // function (named `__topaz_arrow_<N>`) plus, when needed, an env struct
  // typedef (`__topaz_env_<N>`) and arena allocation. Returns a compound
  // literal of the fn fat-pointer type that the caller can store / pass.
  //
  // The arrow's body is type-checked inside a scope.push() with a barrier so
  // that identifier lookups in the body cannot reach outer locals directly —
  // they must instead route through the env struct, which capture analysis
  // populates. Capture analysis itself uses `lookupAcrossBarrier` to peek
  // through the barrier and record types for each free identifier the body
  // references.
  //
  // Capture semantics are by-value (a snapshot of the outer variable's value
  // at the moment the arrow is constructed), divergent from JS's by-reference
  // closures. Mutating an outer `let` after capture does not affect the
  // closure's view, and mutating the captured field inside the arrow does not
  // propagate back. Documented as a divergence in CLAUDE.md.
  private emitArrowFunction(arrow: ArrowExpr, expectedType?: TopazType): string {
    // Phase 1.5-6e-2: generic / async arrows are rejected in convert. Param
    // types: annotation is mandatory unless the expected fn type can
    // contextually supply them (default / optional / rest / destructuring
    // params are rejected in convert). Names must be unique.
    let expectedFn: FnType | undefined = undefined;
    if (expectedType !== undefined) {
      if (expectedType.kind === "fn") {
        expectedFn = expectedType;
      }
    }
    if (expectedFn !== undefined && expectedFn.params.length !== arrow.params.length) {
      throw new CodegenError(
        { pos: arrow.pos },
        `arrow function arity ${arrow.params.length} does not match expected type ${typeIdent(expectedFn)} (arity ${expectedFn.params.length})`,
      );
    }
    const params: ParamInfo[] = [];
    const seenNames = new Set<string>();
    for (let i = 0; i < arrow.params.length; i++) {
      const p = arrow.params[i];
      const paramAnchor: { pos: number } = { pos: p.pos };
      const paramType = p.type;
      let pt: TopazType = T_VOID;
      if (paramType !== undefined) {
        pt = this.typeFromAnnotation(paramType, paramAnchor, g_currentModule!);
      } else if (expectedFn !== undefined) {
        pt = expectedFn.params[i].type;
      } else {
        throw new CodegenError(paramAnchor, "arrow function parameter requires a type annotation (no contextual type available)");
      }
      this.assertNotVoid(pt, paramAnchor, "arrow parameter");
      if (seenNames.has(p.name)) {
        throw new CodegenError(paramAnchor, `duplicate parameter name '${p.name}'`);
      }
      seenNames.add(p.name);
      params.push({ name: p.name, type: pt, isOptional: false });
    }

    // Return type: annotation/context wins. Without either, expression-bodied
    // arrows can infer from the expression under the typed param scope; block
    // bodies still need an explicit/contextual return type.
    let returnType: TopazType = T_VOID;
    let inferredExprBodyType: TopazType | undefined = undefined;
    const arrowReturnType = arrow.returnType;
    if (arrowReturnType !== undefined) {
      const returnAnchor: { pos: number } = { pos: arrowReturnType.pos };
      returnType = this.typeFromAnnotation(arrowReturnType, returnAnchor, g_currentModule!);
    } else if (expectedFn !== undefined) {
      returnType = expectedFn.returnType;
    } else if (arrow.body.kind === "arrow_expr_body") {
      const inferred = this.inferArrowExpressionBodyType(arrow, params);
      inferredExprBodyType = inferred;
      returnType = inferred;
    } else {
      throw new CodegenError({ pos: arrow.pos }, "arrow function requires an explicit return type annotation (no contextual type available)");
    }
    if (returnType.kind === "void" && arrow.body.kind === "arrow_expr_body") {
      let bodyType: TopazType = T_VOID;
      if (inferredExprBodyType !== undefined) {
        bodyType = inferredExprBodyType;
      } else {
        bodyType = this.inferArrowExpressionBodyType(arrow, params);
      }
      if (bodyType.kind !== "void") {
        throw new CodegenError({ pos: arrow.pos }, "void-returning arrows require block bodies");
      }
    }

    const arrowType: TopazType = { kind: "fn", params, returnType };
    this.recordFnMonomorph(arrowType);

    // Body: rewrite expression-bodied arrows into a single return, except for
    // void expressions which must stay statement-shaped.
    const id = this.arrowCounter++;
    const fnName = `__topaz_arrow_${id}`;
    const envName = `__topaz_env_${id}`;

    // Capture analysis: walk the body AST collecting free identifiers that
    // resolve to outer-scope bindings via `lookupAcrossBarrier`. Locals
    // declared inside the body and the param names themselves are excluded.
    const captures = new Map<string, TopazType>();
    const excludedNames = new Set<string>();
    for (const p of params) {
      excludedNames.add(p.name);
    }
    this.collectCaptures(arrow, excludedNames, captures);

    const envIsEmpty = captures.size === 0;
    let envTypedef = "";
    if (!envIsEmpty) {
      const fieldLines: string[] = [];
      for (const n of captures.keys()) {
        const tMaybe = captures.get(n);
        if (tMaybe === undefined) {
          throwInternalCodegenError(`emitArrowFunction: missing captured type for '${n}'`);
        } else {
          fieldLines.push(`  ${cTypeName(tMaybe)} ${n};`);
        }
      }
      envTypedef = `typedef struct ${envName} {\n${fieldLines.join("\n")}\n} ${envName};`;
    }

    // Emit the body with a barrier in place. Set captureContext so identifier
    // emission can route reads through `((${envName} *)__topaz_env)->name`
    // instead of the raw identifier.
    const prevCaptureContext = this.captureContext;
    const prevRet = this.currentReturnType;
    const prevLive = this.liveTryFrames;
    // Phase 1.5-6e-2: an arrow is a function boundary — `continue` inside the
    // body must not see the outer loop context. Save / clear / restore.
    const prevLoopCtx = this.resetLoopCtx();
    this.captureContext = { envType: envName, envIsEmpty, captures };
    this.currentReturnType = returnType;
    this.liveTryFrames = 0;
    // Barrier must come BEFORE the scope.push so that the new (inner) frame
    // sits at the barrier floor and lookups within the body can still see
    // it. Outer frames remain hidden behind the barrier.
    this.scope.pushBarrier();
    this.scope.push();
    const arrowAnchor: { pos: number } = { pos: arrow.pos };
    for (const p of params) {
      this.scope.declareBinding(p.name, p.type, /* isConst */ false, arrowAnchor);
    }
    const bodyText: string = this.emitArrowBodyText(arrow, returnType);

    // C function signature: env is `void *` so the same callable shape
    // works for both capturing and non-capturing arrows.
    const paramDecls = params.map((p) => `${cTypeName(p.type)} ${p.name}`).join(", ");
    const fnSig = `static ${cReturnTypeName(returnType)} ${fnName}(void *__topaz_env${paramDecls.length > 0 ? ", " + paramDecls : ""})`;

    // Splice the env typedef (if any) + the arrow's forward declaration
    // into the fwd slot; the full body goes into the def slot. This lets a
    // function that returns an arrow reference `__topaz_arrow_<N>` and
    // `__topaz_env_<N>` by name in its body even though the actual
    // definition lands later in the C file.
    const fwdLines: string[] = [];
    if (envTypedef.length > 0) fwdLines.push(envTypedef);
    fwdLines.push(`${fnSig};`);
    this.arrowFwdLines.push(fwdLines.join("\n"));
    this.arrowDefLines.push(`${fnSig} ${bodyText}`);
    this.scope.pop();
    this.scope.popBarrier();
    this.captureContext = prevCaptureContext;
    this.currentReturnType = prevRet;
    this.liveTryFrames = prevLive;
    this.restoreLoopCtx(prevLoopCtx);

    // Build the call-site compound literal. Allocate the env on the arena
    // and copy each captured value in. Non-capturing arrows just take a NULL
    // env pointer.
    const fnTypeName = typeIdent(arrowType);
    const retCType = cReturnTypeName(returnType);
    if (envIsEmpty) {
      return `((${fnTypeName}){ .fn = (${retCType}(*)(void *${params.map((p) => ", " + cTypeName(p.type)).join("")}))${fnName}, .env = NULL })`;
    }
    const envExprParts: string[] = [];
    for (const name of captures.keys()) {
      const tMaybe = captures.get(name);
      if (tMaybe === undefined) {
        throwInternalCodegenError(`emitArrowFunction: missing captured type for '${name}'`);
      } else {
        // Emit each capture using the *outer* scope. The barrier is already
        // popped, so a plain emitExpression reads from the correct frame.
        // Use a fresh tmp-free expression: re-emit the identifier the same way
        // the outer scope sees it.
        const captureExpr = this.emitCapturedIdentifier(name, tMaybe, arrowAnchor);
        envExprParts.push(`.${name} = ${captureExpr}`);
      }
    }
    const envInit = `({ ${envName} *__e = topaz_arena_alloc(sizeof(${envName})); *__e = (${envName}){ ${envExprParts.join(", ")} }; __e; })`;
    return `((${fnTypeName}){ .fn = (${retCType}(*)(void *${params.map((p) => ", " + cTypeName(p.type)).join("")}))${fnName}, .env = ${envInit} })`;
  }

  private emitArrowBodyText(arrow: ArrowExpr, returnType: TopazType): string {
    const body = arrow.body;
    if (body.kind === "arrow_block_body") {
      const blk: BlockStmt = { kind: "block_stmt", stmts: body.stmts, pos: arrow.pos, end: arrow.end };
      return this.emitBlock(blk, 0);
    }

    if (returnType.kind === "void") {
      const exprStr = this.emitExpression(body.expr);
      return `{\n  ${exprStr};\n  return;\n}`;
    }

    // Expression body: wrap in `{ return <expr>; }`. emitWithExpected applies
    // the return-type coercion the same way an explicit return statement would.
    const exprStr = this.emitWithExpected(body.expr, returnType);
    return `{\n  return ${exprStr};\n}`;
  }

  // Phase 1.5-3.5e: emit an identifier as the outer scope sees it (for
  // capture initialization). Handles narrowed scalar opt unions and narrowed
  // dunion / unknown the same way emitExpression's identifier branch does.
  private emitCapturedIdentifier(name: string, _capturedType: TopazType, anchor: { pos: number }): string {
    const bMaybe = this.scope.lookup(name);
    if (bMaybe === undefined) throw new CodegenError(anchor, `capture '${name}' is not visible at the arrow construction site`);
    const b = bMaybe;
    const baseMaybe = this.scope.lookupBase(name);
    if (baseMaybe === undefined) throw new CodegenError(anchor, `capture '${name}' has no base binding at the arrow construction site`);
    const base = baseMaybe;
    if (isScalarOptUnion(base.type) && !typeEq(base.type, b.type)) {
      return `(${name}).value`;
    }
    if (base.type.kind === "dunion" && isClassType(b.type)) {
      const cname = classNameOf(b.type)!;
      return `((topaz_class_${cname} *)(${name}).data)`;
    }
    if (base.type.kind === "unknown" && isClassType(b.type)) {
      const cname = classNameOf(b.type)!;
      return `((topaz_class_${cname} *)(${name}))`;
    }
    return name;
  }

  // Phase 1.5-3.5e: walk an arrow's body and collect free-identifier captures.
  // `locals` accumulates names declared inside the body (params, then let /
  // const / for-init / catch binding as the walk proceeds). Identifiers that
  // are NOT locals AND resolve via `lookupAcrossBarrier` get added to
  // `captures` with their outer-scope type. The same name encountered twice
  // is recorded once (first hit wins).
  //
  // We deliberately do NOT recurse into nested arrows here — the inner arrow
  // will run its own collectCaptures during its own emit, and the outer arrow
  // sees the *inner* arrow's free vars as its own captures (transitively)
  // because the inner emit calls emitCapturedIdentifier against the outer
  // scope before we leave outer's emit.
  private collectCaptures(
    arrow: ArrowExpr,
    paramNames: Set<string>,
    captures: Map<string, TopazType>,
  ): void {
    const locals = new Set<string>(paramNames);
    const outerOnIdent = (name: string): void => {
      if (captures.has(name)) return;
      const b = this.scope.lookupAcrossBarrier(name);
      if (b !== undefined) captures.set(name, b.type);
    };
    const outerOnArrow = (inner: ArrowExpr): void => {
      this.collectCapturesNestedArrow(inner, locals, captures);
    };

    const body = arrow.body;
    if (body.kind === "arrow_block_body") {
      for (const s of body.stmts) this.collectCapturesWalkStmt(s, locals, outerOnIdent, outerOnArrow);
    } else {
      this.collectCapturesWalkExpr(body.expr, locals, outerOnIdent, outerOnArrow);
    }
  }

  // Walk an arrow body's statements / expressions, tracking new local bindings
  // in `localSet` (flat, matching the old tsc walk) and reporting free
  // identifier references through callbacks. Nested arrows are function
  // boundaries and are handed to `onArrow`.
  private collectCapturesWalkStmt(
    s: Stmt,
    localSet: Set<string>,
    onIdent: (name: string) => void,
    onArrow: (a: ArrowExpr) => void,
  ): void {
    switch (s.kind) {
      case "expr_stmt":
        this.collectCapturesWalkExpr(s.expr, localSet, onIdent, onArrow);
        return;
      case "var_decl":
        localSet.add(s.name);
        const varDeclInit = s.init;
        if (varDeclInit !== undefined) this.collectCapturesWalkExpr(varDeclInit, localSet, onIdent, onArrow);
        return;
      case "var_destr_decl":
        for (const b of s.bindings) localSet.add(b.name);
        this.collectCapturesWalkExpr(s.init, localSet, onIdent, onArrow);
        return;
      case "block_stmt":
        for (const st of s.stmts) this.collectCapturesWalkStmt(st, localSet, onIdent, onArrow);
        return;
      case "if_stmt":
        this.collectCapturesWalkExpr(s.cond, localSet, onIdent, onArrow);
        this.collectCapturesWalkStmt(s.thenBranch, localSet, onIdent, onArrow);
        const ifElseBranch = s.elseBranch;
        if (ifElseBranch !== undefined) this.collectCapturesWalkStmt(ifElseBranch, localSet, onIdent, onArrow);
        return;
      case "while_stmt":
        this.collectCapturesWalkExpr(s.cond, localSet, onIdent, onArrow);
        this.collectCapturesWalkStmt(s.body, localSet, onIdent, onArrow);
        return;
      case "do_while_stmt":
        this.collectCapturesWalkStmt(s.body, localSet, onIdent, onArrow);
        this.collectCapturesWalkExpr(s.cond, localSet, onIdent, onArrow);
        return;
      case "for_stmt":
        const forInit = s.init;
        if (forInit !== undefined) {
          if (forInit.kind === "for_init_decl") {
            this.collectCapturesWalkStmt(forInit.decl, localSet, onIdent, onArrow);
          } else {
            this.collectCapturesWalkExpr(forInit.expr, localSet, onIdent, onArrow);
          }
        }
        const forCond = s.cond;
        if (forCond !== undefined) this.collectCapturesWalkExpr(forCond, localSet, onIdent, onArrow);
        const forUpdate = s.update;
        if (forUpdate !== undefined) this.collectCapturesWalkExpr(forUpdate, localSet, onIdent, onArrow);
        this.collectCapturesWalkStmt(s.body, localSet, onIdent, onArrow);
        return;
      case "for_of_stmt":
        const forOfBinding = s.binding;
        switch (forOfBinding.kind) {
          case "for_of_single":
            localSet.add(forOfBinding.name);
            break;
          case "for_of_pair":
            localSet.add(forOfBinding.first);
            localSet.add(forOfBinding.second);
            break;
        }
        this.collectCapturesWalkExpr(s.source, localSet, onIdent, onArrow);
        this.collectCapturesWalkStmt(s.body, localSet, onIdent, onArrow);
        return;
      case "switch_stmt":
        this.collectCapturesWalkExpr(s.discriminant, localSet, onIdent, onArrow);
        for (const c of s.cases) {
          const test = c.test;
          if (test !== undefined) this.collectCapturesWalkExpr(test, localSet, onIdent, onArrow);
          for (const st of c.stmts) this.collectCapturesWalkStmt(st, localSet, onIdent, onArrow);
        }
        return;
      case "try_stmt":
        for (const st of s.tryBlock.stmts) this.collectCapturesWalkStmt(st, localSet, onIdent, onArrow);
        const tryCatchClause = s.catchClause;
        if (tryCatchClause !== undefined) {
          const catchBindingName = tryCatchClause.bindingName;
          if (catchBindingName !== undefined) localSet.add(catchBindingName);
          for (const st of tryCatchClause.body.stmts) this.collectCapturesWalkStmt(st, localSet, onIdent, onArrow);
        }
        const tryFinallyBlock = s.finallyBlock;
        if (tryFinallyBlock !== undefined) {
          for (const st of tryFinallyBlock.stmts) this.collectCapturesWalkStmt(st, localSet, onIdent, onArrow);
        }
        return;
      case "return_stmt":
        const returnValue = s.value;
        if (returnValue !== undefined) this.collectCapturesWalkExpr(returnValue, localSet, onIdent, onArrow);
        return;
      case "throw_stmt":
        this.collectCapturesWalkExpr(s.value, localSet, onIdent, onArrow);
        return;
      case "break_stmt":
      case "continue_stmt":
      case "empty_stmt":
        return;
    }
  }

  private collectCapturesWalkExpr(
    e: Expr,
    localSet: Set<string>,
    onIdent: (name: string) => void,
    onArrow: (a: ArrowExpr) => void,
  ): void {
    switch (e.kind) {
      case "ident":
        if (!localSet.has(e.name) && !isBuiltinName(e.name)) onIdent(e.name);
        return;
      case "num_lit":
      case "str_lit":
      case "bool_lit":
      case "null_lit":
      case "undefined_lit":
      case "this_expr":
      case "import_meta_url":
        return;
      case "template_lit":
        for (const sub of e.subs) this.collectCapturesWalkExpr(sub.expr, localSet, onIdent, onArrow);
        return;
      case "array_lit":
        for (const el of e.elems) this.collectCapturesWalkExpr(el.expr, localSet, onIdent, onArrow);
        return;
      case "object_lit":
        for (const m of e.props) {
          switch (m.kind) {
            case "prop_kv":
              this.collectCapturesWalkExpr(m.value, localSet, onIdent, onArrow);
              break;
            case "prop_spread":
              this.collectCapturesWalkExpr(m.expr, localSet, onIdent, onArrow);
              break;
            case "prop_shorthand":
              if (!localSet.has(m.name) && !isBuiltinName(m.name)) onIdent(m.name);
              break;
          }
        }
        return;
      case "paren_expr":
        this.collectCapturesWalkExpr(e.inner, localSet, onIdent, onArrow);
        return;
      case "call_expr":
        this.collectCapturesWalkExpr(e.callee, localSet, onIdent, onArrow);
        for (const a of e.args) this.collectCapturesWalkExpr(a, localSet, onIdent, onArrow);
        return;
      case "new_expr":
        this.collectCapturesWalkExpr(e.callee, localSet, onIdent, onArrow);
        for (const a of e.args) this.collectCapturesWalkExpr(a, localSet, onIdent, onArrow);
        return;
      case "prop_access":
        this.collectCapturesWalkExpr(e.receiver, localSet, onIdent, onArrow);
        return;
      case "elem_access":
        this.collectCapturesWalkExpr(e.receiver, localSet, onIdent, onArrow);
        this.collectCapturesWalkExpr(e.index, localSet, onIdent, onArrow);
        return;
      case "prefix_op":
        this.collectCapturesWalkExpr(e.operand, localSet, onIdent, onArrow);
        return;
      case "postfix_op":
        this.collectCapturesWalkExpr(e.operand, localSet, onIdent, onArrow);
        return;
      case "bin_op":
        this.collectCapturesWalkExpr(e.lhs, localSet, onIdent, onArrow);
        this.collectCapturesWalkExpr(e.rhs, localSet, onIdent, onArrow);
        return;
      case "instanceof_expr":
        this.collectCapturesWalkExpr(e.lhs, localSet, onIdent, onArrow);
        this.collectCapturesWalkExpr(e.rhs, localSet, onIdent, onArrow);
        return;
      case "typeof_expr":
        this.collectCapturesWalkExpr(e.operand, localSet, onIdent, onArrow);
        return;
      case "ternary_expr":
        this.collectCapturesWalkExpr(e.cond, localSet, onIdent, onArrow);
        this.collectCapturesWalkExpr(e.thenBranch, localSet, onIdent, onArrow);
        this.collectCapturesWalkExpr(e.elseBranch, localSet, onIdent, onArrow);
        return;
      case "assign_expr":
        this.collectCapturesWalkExpr(e.target, localSet, onIdent, onArrow);
        this.collectCapturesWalkExpr(e.value, localSet, onIdent, onArrow);
        return;
      case "non_null":
        this.collectCapturesWalkExpr(e.operand, localSet, onIdent, onArrow);
        return;
      case "spread_expr":
        this.collectCapturesWalkExpr(e.operand, localSet, onIdent, onArrow);
        return;
      case "arrow_expr":
        onArrow(e);
        return;
    }
  }

  private collectCapturesNestedArrow(
    inner: ArrowExpr,
    outerLocals: Set<string>,
    captures: Map<string, TopazType>,
  ): void {
    const innerCaps = new Map<string, TopazType>();
    const innerOnIdent = (name: string): void => {
      const b = this.scope.lookupAcrossBarrier(name);
      if (b !== undefined) innerCaps.set(name, b.type);
    };
    const emptyParentLocals = new Set<string>();
    this.collectCapturesWalkNestedArrow(inner, emptyParentLocals, innerOnIdent);
    for (const name of innerCaps.keys()) {
      if (outerLocals.has(name)) continue;
      if (captures.has(name)) continue;
      const b = this.scope.lookupAcrossBarrier(name);
      if (b !== undefined) captures.set(name, b.type);
    }
  }

  private collectCapturesWalkNestedArrow(
    arrow: ArrowExpr,
    parentLocalSet: Set<string>,
    onIdent: (name: string) => void,
  ): void {
    const localSet = new Set<string>(parentLocalSet);
    for (const p of arrow.params) localSet.add(p.name);
    const onArrow = (a: ArrowExpr): void => {
      this.collectCapturesWalkNestedArrow(a, localSet, onIdent);
    };
    const body = arrow.body;
    if (body.kind === "arrow_block_body") {
      for (const st of body.stmts) this.collectCapturesWalkStmt(st, localSet, onIdent, onArrow);
    } else {
      this.collectCapturesWalkExpr(body.expr, localSet, onIdent, onArrow);
    }
  }

  // Phase 1.4c-2: resolve a call to a generic function. Returns the mangled
  // name and the substituted FunctionSig; registers the monomorph (and adds
  // it to the worklist) on first observation. Returns undefined if `callee`
  // doesn't name a generic function — caller falls back to concrete dispatch.
  private resolveGenericCall(
    callee: IdentExpr,
    expr: CallExpr,
  ): { mangled: string; sig: FunctionSig } | undefined {
    const genericMaybe = this.genericFunctions.get(callee.name);
    if (genericMaybe === undefined) return undefined;
    const generic: GenericFunctionInfo = genericMaybe;
    const callAnchor: { pos: number } = { pos: expr.pos };

    const subs = new Map<string, TopazType>();

    if (expr.typeArgs.length > 0) {
      if (expr.typeArgs.length !== generic.typeParams.length) {
        throw new CodegenError(
          callAnchor,
          `${callee.name} expects ${generic.typeParams.length} type argument(s), got ${expr.typeArgs.length}`,
        );
      }
      for (let i = 0; i < generic.typeParams.length; i++) {
        // Type arguments can themselves reference the surrounding scope's
        // type parameters (when a generic body calls another generic), so
        // typeFromAnnotation must run with the outer typeParamScope still
        // active. We don't swap it here.
        const typeArg = expr.typeArgs[i];
        const typeParam = generic.typeParams[i];
        const t = this.typeFromAnnotation(typeArg, callAnchor, g_currentModule!);
        subs.set(typeParam, t);
      }
    } else {
      // Best-effort inference: walk each parameter type node against the
      // corresponding argument's inferred type, binding type parameters as
      // we go. Concrete portions don't contribute. After the walk, every
      // declared type parameter must be bound. Phase 1.5-6e-3: `generic.decl`
      // is the Topaz `FunctionDecl`; its `params[i].type` is a Topaz `TypeNode`
      // that `unifyTypeParam` walks.
      if (expr.args.length !== generic.decl.params.length) {
        throw new CodegenError(
          callAnchor,
          `${callee.name}() expects ${generic.decl.params.length} argument(s), got ${expr.args.length}`,
        );
      }
      for (let i = 0; i < generic.decl.params.length; i++) {
        const param = generic.decl.params[i];
        const arg = expr.args[i];
        const argType = this.inferType(arg);
        this.unifyTypeParam(param.type, argType, generic.typeParams, subs, callAnchor);
      }
      for (const tp of generic.typeParams) {
        if (!subs.has(tp)) {
          throw new CodegenError(
            callAnchor,
            `cannot infer type parameter '${tp}' for ${callee.name}; provide explicit type arguments`,
          );
        }
      }
    }

    const typeArgs: Array<TopazType> = [];
    for (const tp of generic.typeParams) {
      const tMaybe = subs.get(tp);
      if (tMaybe !== undefined) {
        const t: TopazType = tMaybe;
        typeArgs.push(t);
      } else {
        throwInternalCodegenError("resolveGenericCall: missing type argument substitution");
      }
    }
    const mangled = mangleMonomorph(generic.name, typeArgs);

    const existing = this.genericMonomorphs.get(mangled);
    if (existing !== undefined) {
      return { mangled, sig: existing.sig };
    }

    // First time we've seen this (function, typeArgs) tuple — resolve the
    // signature under the new substitution and queue body emission. The
    // signature types live in the generic's module, so set its ambient sf.
    const prevScope = this.typeParamScope;
    this.typeParamScope = subs;
    const genericAnchor: { pos: number } = { pos: generic.decl.pos };
    const sig = this.withSfFunctionSig(generic.sf, (): FunctionSig => {
      const returnType = this.typeFromAnnotation(generic.decl.returnType, genericAnchor, generic.sf);
      const params = this.collectParams(generic.decl.params, generic.sf);
      return { params, returnType };
    });
    this.typeParamScope = prevScope;

    const mono: MonomorphInfo = {
      mangled,
      origName: generic.name,
      typeArgs,
      subs,
      sig,
      decl: generic.decl,
      sf: generic.sf,
    };
    this.genericMonomorphs.set(mangled, mono);
    this.genericWorklist.push(mangled);
    return { mangled, sig };
  }

  // Phase 1.4c-3: realize `Box<number>`-style references. The mangled name
  // (e.g. "Box__number") is registered in `this.classes` with substituted
  // fields/methods; future references see the cache and return immediately.
  // Throws if `refName` isn't a generic class (callers gate on
  // `this.genericClasses.has(refName)` before invoking).
  private instantiateGenericClass(
    refName: string,
    typeArgNodes: Array<TypeNode> | undefined,
    anchor: { pos: number },
    sf: SourceModule,
  ): TopazType {
    const genericMaybe = this.genericClasses.get(refName);
    if (genericMaybe === undefined) {
      throw new CodegenError(anchor, `internal error: missing generic class '${refName}'`);
    }
    const generic: GenericClassInfo = genericMaybe;
    let providedTypeArgCount = 0;
    if (typeArgNodes !== undefined) {
      providedTypeArgCount = typeArgNodes.length;
    }
    if (typeArgNodes === undefined || providedTypeArgCount !== generic.typeParams.length) {
      throw this.typeErr(
        anchor,
        `${refName} expects ${generic.typeParams.length} type argument(s), got ${providedTypeArgCount}`,
      );
    }
    const concreteTypeArgNodes: Array<TypeNode> = typeArgNodes;
    // Type args can themselves reference the surrounding type-param scope
    // (e.g. a generic class field of type `Box<T>`), so resolve under the
    // current scope without swapping.
    const subs = new Map<string, TopazType>();
    for (let i = 0; i < generic.typeParams.length; i++) {
      if (i < concreteTypeArgNodes.length && i < generic.typeParams.length) {
        const typeArgNode = concreteTypeArgNodes[i];
        const typeParam = generic.typeParams[i];
        const t = this.typeFromAnnotation(typeArgNode, anchor, sf);
        subs.set(typeParam, t);
      } else {
        throwInternalCodegenError("instantiateGenericClass: missing type argument");
      }
    }
    const typeArgs: Array<TopazType> = [];
    for (const tp of generic.typeParams) {
      const tMaybe = subs.get(tp);
      if (tMaybe !== undefined) {
        const t: TopazType = tMaybe;
        typeArgs.push(t);
      } else {
        throwInternalCodegenError("instantiateGenericClass: missing type argument substitution");
      }
    }
    const mangled = mangleMonomorph(generic.name, typeArgs);
    if (this.classMonomorphs.has(mangled)) {
      return classOf(mangled);
    }
    // Pre-register the ClassInfo so a recursive reference (e.g.
    // `class Node<T> { next: Node<T>; }` instantiated as `Node<number>`)
    // sees the in-progress entry instead of recursing forever.
    const info: ClassInfo = {
      name: mangled,
      fields: new Map(),
      fieldOrder: [],
      fieldInits: new Map(),
      ctor: undefined,
      methods: new Map(),
      implements: [],
      optionalFields: new Set(),
      decl: generic.decl,
      sf: generic.sf,
    };
    this.classes.set(mangled, info);
    this.classMonomorphs.set(mangled, { mangled, origName: generic.name, typeArgs, subs });
    this.classMonomorphWorklist.push(mangled);
    // Collect fields/methods under the substitution. typeParamScope is the
    // same channel generic functions use; typeFromAnnotation already
    // consults it before falling through to class/interface lookups. Members
    // resolve in the generic class's module (collectClassMembers sets it).
    const prevScope = this.typeParamScope;
    this.typeParamScope = subs;
    this.collectClassMembers(generic.decl, generic.sf, info);
    this.typeParamScope = prevScope;
    return classOf(mangled);
  }

  // Structural unifier: matches a parameter's TypeNode against an argument's
  // concrete TopazType, binding type parameters where it can. Anything it
  // can't decompose (mismatched shapes, type forms we don't introspect) is
  // silently skipped — the caller checks at the end that every parameter was
  // bound, and the per-argument coercion at emitCall surfaces any real
  // mismatches with a type-error message.
  // Phase 1.5-6e-3: walks the Topaz `TypeNode`. `T[]` arrives as `type_array`,
  // `Array<T>` / `Map<K,V>` / `Set<T>` / generic-class refs as `type_ref` with
  // `typeArgs`; parenthesized types were unwrapped by convert. Forms it can't
  // decompose fall through silently (caller verifies every param bound).
  private unifyTypeParam(
    paramTypeNode: TypeNode,
    argType: TopazType,
    params: string[],
    subs: Map<string, TopazType>,
    anchor: { pos: number },
  ): void {
    const paramTypeAnchor: { pos: number } = { pos: paramTypeNode.pos };
    if (paramTypeNode.kind === "type_array") {
      if (!isArrayType(argType)) return;
      const elem = arrayElem(argType);
      if (elem === undefined) return;
      this.unifyTypeParam(paramTypeNode.elem, elem, params, subs, anchor);
      return;
    }
    if (paramTypeNode.kind === "type_ref") {
      const refName = paramTypeNode.name;
      const typeArgs = paramTypeNode.typeArgs;
      if (params.includes(refName)) {
        if (typeArgs.length > 0) {
          throw new CodegenError(
            paramTypeAnchor,
            `type parameter '${refName}' cannot have type arguments`,
          );
        }
        const existing = subs.get(refName);
        if (existing !== undefined && !typeEq(existing, argType)) {
          throw new CodegenError(
            anchor,
            `type parameter '${refName}' inferred as both ${typeIdent(existing)} and ${typeIdent(argType)}`,
          );
        }
        subs.set(refName, argType);
        return;
      }
      if (refName === "Array" && typeArgs.length === 1) {
        if (!isArrayType(argType)) return;
        const elem = arrayElem(argType);
        if (elem === undefined) return;
        const firstTypeArg: TypeNode | undefined = typeArgs[0];
        if (firstTypeArg !== undefined) {
          this.unifyTypeParam(firstTypeArg, elem, params, subs, anchor);
        } else {
          throwInternalCodegenError("unifyTypeParam: missing Array type argument");
        }
        return;
      }
      if (refName === "Map" && typeArgs.length === 2) {
        if (!isMapType(argType)) return;
        const k = mapKey(argType);
        const v = mapValue(argType);
        if (k !== undefined) {
          if (v !== undefined) {
            const keyTypeArg: TypeNode | undefined = typeArgs[0];
            const valueTypeArg: TypeNode | undefined = typeArgs[1];
            if (keyTypeArg !== undefined) {
              if (valueTypeArg !== undefined) {
                this.unifyTypeParam(keyTypeArg, k, params, subs, anchor);
                this.unifyTypeParam(valueTypeArg, v, params, subs, anchor);
              } else {
                throwInternalCodegenError("unifyTypeParam: missing Map type argument");
              }
            } else {
              throwInternalCodegenError("unifyTypeParam: missing Map type argument");
            }
          } else {
            return;
          }
        } else {
          return;
        }
        return;
      }
      if (refName === "Set" && typeArgs.length === 1) {
        if (!isSetType(argType)) return;
        const elem = setElem(argType);
        if (elem === undefined) return;
        const firstTypeArg: TypeNode | undefined = typeArgs[0];
        if (firstTypeArg !== undefined) {
          this.unifyTypeParam(firstTypeArg, elem, params, subs, anchor);
        } else {
          throwInternalCodegenError("unifyTypeParam: missing Set type argument");
        }
        return;
      }
      // Phase 1.4c-3: generic class on the parameter side. The argument's
      // TopazType is a regular class type whose name is the mangled monomorph;
      // we recover the original generic + per-position type args from
      // `classMonomorphs` and unify pairwise.
      if (this.genericClasses.has(refName) && typeArgs.length > 0) {
        if (!isClassType(argType)) return;
        const argClassNameMaybe = classNameOf(argType);
        if (argClassNameMaybe === undefined) return;
        const argClassName: string = argClassNameMaybe;
        const argMonoMaybe = this.classMonomorphs.get(argClassName);
        if (argMonoMaybe === undefined) return;
        const argMono: ClassMonomorphInfo = argMonoMaybe;
        if (argMono.origName !== refName) return;
        if (argMono.typeArgs.length !== typeArgs.length) return;
        for (let i = 0; i < typeArgs.length; i++) {
          const paramTypeArg: TypeNode | undefined = typeArgs[i];
          const argMonoTypeArg: TopazType | undefined = argMono.typeArgs[i];
          if (paramTypeArg !== undefined) {
            if (argMonoTypeArg !== undefined) {
              this.unifyTypeParam(paramTypeArg, argMonoTypeArg, params, subs, anchor);
            } else {
              throwInternalCodegenError("unifyTypeParam: missing generic class type argument");
            }
          } else {
            throwInternalCodegenError("unifyTypeParam: missing generic class type argument");
          }
        }
        return;
      }
      // Concrete class/interface/scalar reference — nothing to bind.
    }
  }

  private emitBlock(block: BlockStmt, indent: number): string {
    const pad = "  ".repeat(indent);
    const lines: string[] = [];
    for (const s of block.stmts) {
      lines.push(this.emitStatement(s, indent + 1));
      // Phase 1.5-3d: early-exit narrowing. If `s` is `if (cond) { exits }`
      // (and optionally an else that does not exit), the rest of this block
      // sees `cond`'s opposite polarity narrowing.
      this.applyCarryNarrowing(s);
    }
    return `${pad}{\n${lines.join("\n")}\n${pad}}`;
  }

  // Phase 1.5-3d: when an `if` (without continuation) always exits one branch,
  // any narrowing implied by the opposite polarity carries forward in the
  // enclosing block.
  private applyCarryNarrowing(stmt: Stmt): void {
    if (stmt.kind !== "if_stmt") return;
    const thenExits = this.alwaysExits(stmt.thenBranch);
    const elseBranchMaybe = stmt.elseBranch;
    let elseExits = false;
    if (elseBranchMaybe !== undefined) {
      elseExits = this.alwaysExits(elseBranchMaybe);
    }
    const hasElseBranch = elseBranchMaybe !== undefined;
    if (thenExits && !hasElseBranch) {
      const n = this.extractNarrowing(stmt.cond, false);
      if (n !== undefined) this.scope.narrow(n.name, n.type);
      return;
    }
    if (thenExits && !elseExits) {
      const n = this.extractNarrowing(stmt.cond, false);
      if (n !== undefined) this.scope.narrow(n.name, n.type);
      return;
    }
    if (!thenExits && elseExits) {
      const n = this.extractNarrowing(stmt.cond, true);
      if (n !== undefined) this.scope.narrow(n.name, n.type);
      return;
    }
  }

  // Phase 1.5-3d: conservative "this statement always exits the enclosing
  // function/loop" predicate. Used for early-return narrowing only — false
  // negatives just disable narrowing, never produce wrong code.
  private alwaysExits(stmt: Stmt): boolean {
    if (stmt.kind === "return_stmt") return true;
    if (stmt.kind === "throw_stmt") return true;
    if (stmt.kind === "break_stmt") return true;
    if (stmt.kind === "continue_stmt") return true;
    if (stmt.kind === "block_stmt") {
      if (stmt.stmts.length === 0) return false;
      const lastIndex = stmt.stmts.length - 1;
      const lastStmt: Stmt | undefined = stmt.stmts[lastIndex];
      if (lastStmt !== undefined) {
        return this.alwaysExits(lastStmt);
      }
      throwInternalCodegenError("alwaysExits: missing last block statement");
    }
    if (stmt.kind === "if_stmt") {
      const elseBranchMaybe = stmt.elseBranch;
      if (elseBranchMaybe !== undefined) {
        return this.alwaysExits(stmt.thenBranch) && this.alwaysExits(elseBranchMaybe);
      }
    }
    return false;
  }

  // Phase 1.5-3d: parse `x !== undefined` / `x === undefined` (either argument
  // order) into a single-identifier narrowing. `polarity = true` means the
  // expression is true (then-branch); `false` is else-branch / inverted carry.
  // Returns undefined when no narrowing can be inferred.
  private extractNarrowing(
    cond: Expr,
    polarity: boolean,
  ): { name: string; type: TopazType } | undefined {
    // Phase 1.5-3f: `<id> instanceof ClassName` narrows id from `unknown` to
    // the concrete class on the positive branch. The negative branch can't
    // narrow (id could still be any other class), so we only return for
    // polarity === true. `instanceof` is its own Topaz node kind.
    if (cond.kind === "instanceof_expr") {
      if (!polarity) return undefined;
      const lhs = cond.lhs;
      const rhs = cond.rhs;
      let lhsName = "";
      switch (lhs.kind) {
        case "ident":
          lhsName = lhs.name;
          break;
        default:
          return undefined;
      }
      let rhsName = "";
      switch (rhs.kind) {
        case "ident":
          rhsName = rhs.name;
          break;
        default:
          return undefined;
      }
      const bMaybe = this.scope.lookup(lhsName);
      if (bMaybe === undefined) return undefined;
      const b = bMaybe;
      if (b.type.kind !== "unknown") return undefined;
      if (!this.classes.has(rhsName)) return undefined;
      return { name: lhsName, type: classOf(rhsName) };
    }
    if (cond.kind !== "bin_op") return undefined;
    const op = cond.op;
    // Phase 1.5-6 prep #20: De Morgan carry for compound conditions. `A && B`
    // is true only when both A and B hold, so a polarity-true narrowing can be
    // read off either operand (positive); `A || B` is false only when both
    // fail, so a polarity-false narrowing reads off either (negative). We try
    // the left operand first and fall back to the right. The opposite polarity
    // is indeterminate — `!(A && B)` is `!A || !B`, neither forced — so we bail.
    // This lets an early-exit guard like
    // `if (t.kind !== "punct" || t.op !== op) throw ...` carry `t`'s
    // discriminator narrowing onto the statements that follow the `if`.
    if (op === "&&") {
      if (!polarity) return undefined;
      return this.extractNarrowing(cond.lhs, true) ?? this.extractNarrowing(cond.rhs, true);
    }
    if (op === "||") {
      if (polarity) return undefined;
      return this.extractNarrowing(cond.lhs, false) ?? this.extractNarrowing(cond.rhs, false);
    }
    if (op !== "===" && op !== "!==") {
      return undefined;
    }
    // Phase 1.5-6 prep #19: `<id>.<disc> === "lit"` narrows a dunion-typed id
    // to the matching variant (the same scope.narrow path `switch` uses). The
    // undefined check below requires both sides to be identifiers, so this
    // property-access form never collides with it.
    const dn = this.extractDiscriminatorNarrowing(cond, op, polarity);
    if (dn !== undefined) return dn;
    const leftIsUndef = cond.lhs.kind === "undefined_lit";
    const rightIsUndef = cond.rhs.kind === "undefined_lit";
    if (leftIsUndef === rightIsUndef) return undefined;
    const varNode = leftIsUndef ? cond.rhs : cond.lhs;
    let varName = "";
    switch (varNode.kind) {
      case "ident":
        varName = varNode.name;
        break;
      default:
        return undefined;
    }
    const bMaybe = this.scope.lookup(varName);
    if (bMaybe === undefined) return undefined;
    const b = bMaybe;
    if (!containsUndefined(b.type)) return undefined;
    // Strip-undefined when `(x !== undefined)` is true, or `(x === undefined)` is false.
    const stripUndef = (op === "!==") === polarity;
    if (stripUndef) {
      const inner = withoutUndefined(b.type);
      if (inner === undefined) return undefined;
      return { name: varName, type: inner };
    }
    return { name: varName, type: T_UNDEFINED };
  }

  // Phase 1.5-6 prep #19: interpret `<id>.<disc> === "lit"` (either argument
  // order) as a discriminated-union narrowing. One operand must be a property
  // access `id.disc` where id is a dunion identifier and disc its
  // discriminator; the other a string literal naming a unique variant. `===`
  // true (or `!==` false) selects that variant; the complement narrows only
  // when exactly one other variant remains (2-variant dunion). Returns the
  // narrowing valid when `cond` evaluates to `polarity`, else undefined.
  private extractDiscriminatorNarrowing(
    cond: BinOpExpr,
    op: string,
    polarity: boolean,
  ): { name: string; type: TopazType } | undefined {
    let idName = "";
    let propName = "";
    let litText = "";
    let foundMatch = false;
    const leftLit = stringLitText(cond.lhs);
    const rightLit = stringLitText(cond.rhs);
    const lhs = cond.lhs;
    switch (lhs.kind) {
      case "prop_access":
        if (!lhs.optional && rightLit !== undefined) {
          const lhsReceiver = lhs.receiver;
          switch (lhsReceiver.kind) {
            case "ident":
              idName = lhsReceiver.name;
              propName = lhs.name;
              litText = rightLit;
              foundMatch = true;
              break;
          }
        }
        break;
    }
    if (!foundMatch) {
      const rhs = cond.rhs;
      switch (rhs.kind) {
        case "prop_access":
          if (!rhs.optional && leftLit !== undefined) {
            const rhsReceiver = rhs.receiver;
            switch (rhsReceiver.kind) {
              case "ident":
                idName = rhsReceiver.name;
                propName = rhs.name;
                litText = leftLit;
                foundMatch = true;
                break;
            }
          }
          break;
      }
    }
    if (!foundMatch) return undefined;
    const bMaybe = this.scope.lookup(idName);
    if (bMaybe === undefined) return undefined;
    const b = bMaybe;
    const bType = b.type;
    switch (bType.kind) {
      case "dunion":
        if (propName !== bType.discriminator) return undefined;
        let matchCls = "";
        let foundClass = false;
        for (const cname of bType.variants) {
          if (this.dunionLiteralFor(bType, cname) === litText) {
            matchCls = cname;
            foundClass = true;
            break;
          }
        }
        if (!foundClass) return undefined;
        const selectsMatch = (op === "===") === polarity;
        if (selectsMatch) return { name: idName, type: classOf(matchCls) };
        if (bType.variants.length === 2) {
          let other = "";
          let foundOther = false;
          for (const cname of bType.variants) {
            if (cname !== matchCls) {
              other = cname;
              foundOther = true;
              break;
            }
          }
          if (!foundOther) return undefined;
          return { name: idName, type: classOf(other) };
        }
        return undefined;
      default:
        return undefined;
    }
  }

  private emitStatement(stmt: Stmt, indent: number): string {
    const pad = "  ".repeat(indent);

    if (stmt.kind === "return_stmt") {
      const stmtAnchor: { pos: number } = { pos: stmt.pos };
      const currentReturnTypeMaybe = this.currentReturnType;
      if (currentReturnTypeMaybe === undefined) {
        throw new CodegenError(stmtAnchor, "`return` outside of a function or method");
      }
      const currentReturnType: TopazType = currentReturnTypeMaybe;
      const returnValueMaybe = stmt.value;
      if (returnValueMaybe === undefined) {
        if (currentReturnType.kind !== "void") {
          throw new CodegenError(
            stmtAnchor,
            `\`return;\` is only allowed in a void-returning function (current return type is ${typeIdent(currentReturnType)})`,
          );
        }
        if (this.liveTryFrames > 0) {
          return `${pad}{ ${this.popFrames()}return; }`;
        }
        return `${pad}return;`;
      }
      if (currentReturnType.kind === "void") {
        throw new CodegenError(
          stmtAnchor,
          "`return <expr>;` is not allowed in a void-returning function (use a bare `return;` or remove it)",
        );
      }
      const returnValue = returnValueMaybe;
      const retExpr = this.emitWithExpected(returnValue, currentReturnType);
      if (this.liveTryFrames > 0) {
        // Phase 1.5-X: evaluate the value into a temp while the frame is still
        // live (so a throw inside the expression is still caught here), then
        // pop the frame(s) and return. Popping first would route a throw in the
        // expression to the wrong handler.
        const rv = `__topaz_ret_${this.tmpCounter++}`;
        const ct = cTypeName(currentReturnType);
        return `${pad}{ ${ct} ${rv} = ${retExpr}; ${this.popFrames()}return ${rv}; }`;
      }
      return `${pad}return ${retExpr};`;
    }

    if (stmt.kind === "expr_stmt") {
      return `${pad}${this.emitExpression(stmt.expr)};`;
    }

    if (stmt.kind === "var_decl") {
      const declaredVar = this.declareVar(stmt, stmt.declKind === "const");
      return `${pad}${cTypeName(declaredVar.type)} ${declaredVar.cName}${declaredVar.initStr};`;
    }

    if (stmt.kind === "var_destr_decl") {
      return this.emitObjectDestructuringDecl(stmt, stmt.declKind === "const", indent);
    }

    if (stmt.kind === "if_stmt") {
      this.expectType(stmt.cond, T_BOOLEAN);
      const cond = this.emitExpression(stmt.cond);
      // Phase 1.5-3d: extract narrowings BEFORE emitting branches so each
      // side sees the right narrowed view of the variable.
      const thenN = this.extractNarrowing(stmt.cond, true);
      const elseN = this.extractNarrowing(stmt.cond, false);
      const thenStr = this.emitStatementAsBlock(stmt.thenBranch, indent, thenN);
      let out = `${pad}if (${cond}) ${thenStr.trimStart()}`;
      const elseBranchMaybe = stmt.elseBranch;
      if (elseBranchMaybe !== undefined) {
        const elseStr = this.emitStatementAsBlock(elseBranchMaybe, indent, elseN);
        out += ` else ${elseStr.trimStart()}`;
      }
      return out;
    }

    if (stmt.kind === "while_stmt") {
      this.expectType(stmt.cond, T_BOOLEAN);
      const cond = this.emitExpression(stmt.cond);
      this.pushLoopCtx("loop");
      const body = this.emitStatementAsBlock(stmt.body, indent);
      this.popLoopCtx();
      return `${pad}while (${cond}) ${body.trimStart()}`;
    }

    if (stmt.kind === "do_while_stmt") {
      this.expectType(stmt.cond, T_BOOLEAN);
      const cond = this.emitExpression(stmt.cond);
      this.pushLoopCtx("loop");
      const body = this.emitStatementAsBlock(stmt.body, indent);
      this.popLoopCtx();
      return `${pad}do ${body.trimStart()} while (${cond});`;
    }

    if (stmt.kind === "for_stmt") {
      return this.emitForStatement(stmt, indent);
    }

    if (stmt.kind === "for_of_stmt") {
      return this.emitForOfStatement(stmt, indent);
    }

    if (stmt.kind === "switch_stmt") {
      return this.emitSwitchStatement(stmt, indent);
    }

    if (stmt.kind === "break_stmt") {
      return `${pad}break;`;
    }

    if (stmt.kind === "continue_stmt") {
      this.checkContinueAllowed(stmt);
      return `${pad}continue;`;
    }

    if (stmt.kind === "block_stmt") {
      this.scope.push();
      const out = this.emitBlock(stmt, indent);
      this.scope.pop();
      return out;
    }

    if (stmt.kind === "throw_stmt") {
      return this.emitThrowStatement(stmt, indent);
    }

    if (stmt.kind === "try_stmt") {
      return this.emitTryStatement(stmt, indent);
    }

    const stmtAnchor: { pos: number } = { pos: stmt.pos };
    throw new CodegenError(stmtAnchor, `unsupported statement (${stmt.kind})`);
  }

  // Phase 1.5-1: throw a class instance. The runtime helper expects `void *`
  // (implicit conversion from any object pointer), so no explicit cast on the
  // emitting side. We require the thrown value to be a class type so the
  // catch site has a single C type to cast back to.
  private emitThrowStatement(stmt: ThrowStmt, indent: number): string {
    const pad = "  ".repeat(indent);
    const t = this.inferType(stmt.value);
    const valueAnchor: { pos: number } = { pos: stmt.value.pos };
    if (!isClassType(t)) {
      throw new CodegenError(
        valueAnchor,
        `throw value must be a class instance (got ${typeIdent(t)})`,
      );
    }
    return `${pad}topaz_throw(${this.emitExpression(stmt.value)});`;
  }

  // Phase 1.5-1: try/catch. setjmp returns 0 on the initial call (run body
  // then pop the frame), nonzero after a longjmp from topaz_throw (frame is
  // already popped by topaz_throw; catch body just rebinds the global
  // throw_value to the annotated class type). finally and bare-binding catch
  // are deferred; return/break/continue inside the try body are rejected
  // because they would skip the pop.
  // Phase 1.5-X: a run of `topaz_try_pop()` calls (one per live try frame)
  // prepended to a `return` that escapes one or more try bodies.
  private popFrames(): string {
    return "topaz_try_pop(); ".repeat(this.liveTryFrames);
  }

  private emitTryStatement(stmt: TryStmt, indent: number): string {
    const pad = "  ".repeat(indent);
    const finallyBlockMaybe = stmt.finallyBlock;
    if (finallyBlockMaybe !== undefined) {
      const finallyAnchor: { pos: number } = { pos: finallyBlockMaybe.pos };
      throw new CodegenError(finallyAnchor, "`finally` is unsupported (Phase 1.5-1)");
    }
    const catchClauseMaybe = stmt.catchClause;
    if (catchClauseMaybe === undefined) {
      const stmtAnchor: { pos: number } = { pos: stmt.pos };
      throw new CodegenError(stmtAnchor, "`try` without a `catch` clause is unsupported");
    }
    const catchClause = catchClauseMaybe;
    const catchAnchor: { pos: number } = { pos: catchClause.pos };
    const bindingNameMaybe = catchClause.bindingName;
    if (bindingNameMaybe === undefined) {
      throw new CodegenError(
        catchAnchor,
        "`catch` clause requires a binding (e.g. `catch (e: ClassName)`)",
      );
    }
    const eName = bindingNameMaybe;
    // Phase 1.5-3f: missing annotation defaults to `unknown`, matching TS's
    // strict-mode `catch (e)` type. `: unknown` is also accepted explicitly.
    // The user must then narrow with `if (e instanceof ClassName)` before
    // touching fields/methods.
    let errType: TopazType = T_UNKNOWN;
    const bindingTypeMaybe = catchClause.bindingType;
    if (bindingTypeMaybe !== undefined) {
      const bindingType = bindingTypeMaybe;
      const bindingTypeAnchor: { pos: number } = { pos: bindingType.pos };
      errType = this.typeFromAnnotation(bindingType, bindingTypeAnchor, g_currentModule!);
      if (errType.kind !== "unknown" && !isClassType(errType)) {
        throw new CodegenError(
          bindingTypeAnchor,
          `\`catch\` binding type must be a class or \`unknown\` (got ${typeIdent(errType)})`,
        );
      }
    }
    this.checkTryBodyNoEscape(stmt.tryBlock);

    const id = this.tmpCounter++;
    const frame = `__topaz_try_${id}`;

    this.scope.push();
    // Phase 1.5-X: the frame is live for the duration of the try body, so a
    // `return` emitted within sees liveTryFrames bumped by one (and pops it).
    this.liveTryFrames++;
    const tryBodyLines = stmt.tryBlock.stmts.map((s) => this.emitStatement(s, indent + 2));
    this.liveTryFrames--;
    this.scope.pop();

    this.scope.push();
    this.scope.declareBinding(eName, errType, /* isConst */ false, catchAnchor);
    const catchBodyLines = catchClause.body.stmts.map((s) =>
      this.emitStatement(s, indent + 2),
    );
    const catchBodyStr = catchBodyLines.join("\n");
    this.scope.pop();

    const lines: string[] = [];
    lines.push(`${pad}{`);
    lines.push(`${pad}  topaz_try_frame ${frame};`);
    lines.push(`${pad}  topaz_try_push(&${frame});`);
    lines.push(`${pad}  if (setjmp(${frame}.env) == 0) {`);
    if (tryBodyLines.length > 0) lines.push(tryBodyLines.join("\n"));
    lines.push(`${pad}    topaz_try_pop();`);
    lines.push(`${pad}  } else {`);
    if (errType.kind === "unknown") {
      lines.push(`${pad}    void *${eName} = topaz_throw_value;`);
    } else {
      const errClass = classNameOf(errType)!;
      lines.push(
        `${pad}    topaz_class_${errClass} *${eName} = (topaz_class_${errClass} *)topaz_throw_value;`,
      );
    }
    if (catchBodyStr.length > 0) lines.push(catchBodyStr);
    lines.push(`${pad}  }`);
    lines.push(`${pad}}`);
    return lines.join("\n");
  }

  // Reject break/continue inside the try body — those exit the surrounding C
  // block before `topaz_try_pop()` runs, which would leave the frame on the
  // stack pointing at a dead jmp_buf. (Phase 1.5-X: `return` is now handled by
  // emitting the right number of `topaz_try_pop()` before the C return, so it
  // is no longer rejected here.) Skips into nested functions/classes/methods
  // since their control flow doesn't cross the try boundary. Lazy/conservative:
  // doesn't try to distinguish break/continue confined to a loop *inside* the
  // try body — those are technically safe, but we forbid them uniformly to keep
  // the rule one sentence long.
  private checkTryBodyNoEscape(block: BlockStmt): void {
    for (const s of block.stmts) this.checkTryBodyNoEscapeStmt(s);
  }

  // Recursive visitor over the Topaz statement / expression tree. Descent stops
  // at function boundaries (`arrow_expr`); the subset forbids nested function /
  // class declarations inside blocks (convert rejects them), so arrows are the
  // only barrier to honor.
  private checkTryBodyNoEscapeStmt(s: Stmt): void {
    switch (s.kind) {
      case "break_stmt":
        throw new CodegenError(
          { pos: s.pos },
          "`break` inside a `try` body is unsupported (would skip topaz_try_pop); lift the loop out of the try",
        );
      case "continue_stmt":
        throw new CodegenError(
          { pos: s.pos },
          "`continue` inside a `try` body is unsupported (would skip topaz_try_pop); lift the loop out of the try",
        );
      case "expr_stmt":
        this.checkTryBodyNoEscapeExpr(s.expr);
        return;
      case "var_decl":
        const varDeclInit = s.init;
        if (varDeclInit !== undefined) this.checkTryBodyNoEscapeExpr(varDeclInit);
        return;
      case "var_destr_decl":
        this.checkTryBodyNoEscapeExpr(s.init);
        return;
      case "block_stmt":
        for (const st of s.stmts) this.checkTryBodyNoEscapeStmt(st);
        return;
      case "if_stmt":
        this.checkTryBodyNoEscapeExpr(s.cond);
        this.checkTryBodyNoEscapeStmt(s.thenBranch);
        const ifElseBranch = s.elseBranch;
        if (ifElseBranch !== undefined) this.checkTryBodyNoEscapeStmt(ifElseBranch);
        return;
      case "while_stmt":
        this.checkTryBodyNoEscapeExpr(s.cond);
        this.checkTryBodyNoEscapeStmt(s.body);
        return;
      case "do_while_stmt":
        this.checkTryBodyNoEscapeStmt(s.body);
        this.checkTryBodyNoEscapeExpr(s.cond);
        return;
      case "for_stmt":
        const forInit = s.init;
        if (forInit !== undefined) {
          if (forInit.kind === "for_init_decl") this.checkTryBodyNoEscapeStmt(forInit.decl);
          else this.checkTryBodyNoEscapeExpr(forInit.expr);
        }
        const forCond = s.cond;
        if (forCond !== undefined) this.checkTryBodyNoEscapeExpr(forCond);
        const forUpdate = s.update;
        if (forUpdate !== undefined) this.checkTryBodyNoEscapeExpr(forUpdate);
        this.checkTryBodyNoEscapeStmt(s.body);
        return;
      case "for_of_stmt":
        this.checkTryBodyNoEscapeExpr(s.source);
        this.checkTryBodyNoEscapeStmt(s.body);
        return;
      case "switch_stmt":
        this.checkTryBodyNoEscapeExpr(s.discriminant);
        for (const c of s.cases) {
          const switchCaseTest = c.test;
          if (switchCaseTest !== undefined) this.checkTryBodyNoEscapeExpr(switchCaseTest);
          for (const st of c.stmts) this.checkTryBodyNoEscapeStmt(st);
        }
        return;
      case "try_stmt":
        for (const st of s.tryBlock.stmts) this.checkTryBodyNoEscapeStmt(st);
        const nestedCatchClause = s.catchClause;
        if (nestedCatchClause !== undefined) {
          for (const st of nestedCatchClause.body.stmts) this.checkTryBodyNoEscapeStmt(st);
        }
        const nestedFinallyBlock = s.finallyBlock;
        if (nestedFinallyBlock !== undefined) {
          for (const st of nestedFinallyBlock.stmts) this.checkTryBodyNoEscapeStmt(st);
        }
        return;
      case "return_stmt":
        const returnValue = s.value;
        if (returnValue !== undefined) this.checkTryBodyNoEscapeExpr(returnValue);
        return;
      case "throw_stmt":
        this.checkTryBodyNoEscapeExpr(s.value);
        return;
      case "empty_stmt":
        return;
    }
  }

  private checkTryBodyNoEscapeExpr(e: Expr): void {
    switch (e.kind) {
      case "ident":
      case "num_lit":
      case "str_lit":
      case "bool_lit":
      case "null_lit":
      case "undefined_lit":
      case "this_expr":
      case "import_meta_url":
        return;
      case "template_lit":
        for (const sub of e.subs) this.checkTryBodyNoEscapeExpr(sub.expr);
        return;
      case "array_lit":
        for (const el of e.elems) this.checkTryBodyNoEscapeExpr(el.expr);
        return;
      case "object_lit":
        for (const m of e.props) {
          if (m.kind === "prop_kv") this.checkTryBodyNoEscapeExpr(m.value);
          else if (m.kind === "prop_spread") this.checkTryBodyNoEscapeExpr(m.expr);
        }
        return;
      case "paren_expr":
        this.checkTryBodyNoEscapeExpr(e.inner);
        return;
      case "call_expr":
        this.checkTryBodyNoEscapeExpr(e.callee);
        for (const a of e.args) this.checkTryBodyNoEscapeExpr(a);
        return;
      case "new_expr":
        this.checkTryBodyNoEscapeExpr(e.callee);
        for (const a of e.args) this.checkTryBodyNoEscapeExpr(a);
        return;
      case "prop_access":
        this.checkTryBodyNoEscapeExpr(e.receiver);
        return;
      case "elem_access":
        this.checkTryBodyNoEscapeExpr(e.receiver);
        this.checkTryBodyNoEscapeExpr(e.index);
        return;
      case "prefix_op":
        this.checkTryBodyNoEscapeExpr(e.operand);
        return;
      case "postfix_op":
        this.checkTryBodyNoEscapeExpr(e.operand);
        return;
      case "bin_op":
        this.checkTryBodyNoEscapeExpr(e.lhs);
        this.checkTryBodyNoEscapeExpr(e.rhs);
        return;
      case "instanceof_expr":
        this.checkTryBodyNoEscapeExpr(e.lhs);
        this.checkTryBodyNoEscapeExpr(e.rhs);
        return;
      case "typeof_expr":
        this.checkTryBodyNoEscapeExpr(e.operand);
        return;
      case "ternary_expr":
        this.checkTryBodyNoEscapeExpr(e.cond);
        this.checkTryBodyNoEscapeExpr(e.thenBranch);
        this.checkTryBodyNoEscapeExpr(e.elseBranch);
        return;
      case "assign_expr":
        this.checkTryBodyNoEscapeExpr(e.target);
        this.checkTryBodyNoEscapeExpr(e.value);
        return;
      case "non_null":
        this.checkTryBodyNoEscapeExpr(e.operand);
        return;
      case "spread_expr":
        this.checkTryBodyNoEscapeExpr(e.operand);
        return;
      case "arrow_expr":
        return;
    }
  }

  private emitStatementAsBlock(
    stmt: Stmt,
    indent: number,
    narrow?: { name: string; type: TopazType },
  ): string {
    const pad = "  ".repeat(indent);
    const narrowMaybe = narrow;
    if (stmt.kind === "block_stmt") {
      this.scope.push();
      if (narrowMaybe !== undefined) {
        this.scope.narrow(narrowMaybe.name, narrowMaybe.type);
      }
      const out = this.emitBlock(stmt, indent);
      this.scope.pop();
      return out;
    }
    this.scope.push();
    if (narrowMaybe !== undefined) {
      this.scope.narrow(narrowMaybe.name, narrowMaybe.type);
    }
    const inner = this.emitStatement(stmt, indent + 1);
    this.scope.pop();
    return `${pad}{\n${inner}\n${pad}}`;
  }

  // Phase 1.5-6 prep #13: pure check used during pass 1 to decide whether
  // a non-root module's `const NAME: T = LIT;` qualifies for hoisting. The
  // side-effectful registration (scope.declare) happens later inside
  // `tryHoistModuleConst`, so this lookup is safe to call without producing
  // a "redeclaration" error on the second pass.
  // Phase 1.5-6e-3: consumes the Topaz `Stmt`. A hoistable module const is a
  // single-binding `const NAME[: T] = LIT;` whose initializer is a scalar
  // literal (convert already split multi-decls and rejected destructuring).
  // `sf` positions the (side-effect-free) annotation resolution.
  private canHoistModuleConst(stmt: Stmt, sf: SourceModule): boolean {
    if (stmt.kind !== "var_decl") return false;
    if (stmt.declKind !== "const") return false;
    const initMaybe = stmt.init;
    if (initMaybe === undefined) return false;
    const init = initMaybe;
    const lit = this.tryScalarLiteralInit(init);
    if (lit === undefined) return false;
    const typeMaybe = stmt.type;
    if (typeMaybe !== undefined) {
      // Only scalar annotations (number / boolean) can match a scalar literal
      // init, so `typeFromAnnotation` is side-effect-free here.
      const typeAnchor: { pos: number } = { pos: typeMaybe.pos };
      const annotated = this.typeFromAnnotation(typeMaybe, typeAnchor, sf);
      if (!typeEq(annotated, lit.type)) return false;
    }
    return true;
  }

  private canModuleGlobalVar(stmt: Stmt): boolean {
    if (stmt.kind !== "var_decl") return false;
    if (stmt.init === undefined) return false;
    return stmt.type !== undefined;
  }

  // Phase 1.5-6 prep #9: try to hoist a top-level `const NAME: T = LIT;` to
  // a file-static `static const T NAME = LIT;`. Returns the C declaration
  // line on success (and registers the binding in scope.stack[0] as a
  // side effect); returns undefined for any decl that doesn't qualify
  // (let, no initializer, non-scalar literal initializer, type-annotation
  // mismatch, etc.) — those fall through to the regular emitVarDecls path
  // inside main() body.
  private tryHoistModuleConst(stmt: Stmt, sf: SourceModule): string | undefined {
    if (!this.canHoistModuleConst(stmt, sf)) return undefined;
    if (stmt.kind !== "var_decl") return undefined;
    const d = stmt;
    const initMaybe = d.init;
    if (initMaybe === undefined) return undefined;
    const init = initMaybe;
    const lit = this.tryScalarLiteralInit(init);
    if (lit === undefined) return undefined;
    let varType: TopazType = lit.type;
    const typeMaybe = d.type;
    if (typeMaybe !== undefined) {
      const typeAnchor: { pos: number } = { pos: typeMaybe.pos };
      varType = this.typeFromAnnotation(typeMaybe, typeAnchor, sf);
    }
    const bindingAnchor: { pos: number } = { pos: d.pos };
    this.scope.declareBinding(d.name, varType, /* isConst */ true, bindingAnchor);
    return `static const ${cTypeName(varType)} ${d.name} = ${lit.cExpr};`;
  }

  private tryEmitModuleGlobalDecl(stmt: Stmt, sf: SourceModule): string | undefined {
    if (!this.canModuleGlobalVar(stmt)) return undefined;
    if (stmt.kind !== "var_decl") return undefined;
    const d = stmt;
    const typeMaybe = d.type;
    if (typeMaybe === undefined) return undefined;
    const typeAnchor: { pos: number } = { pos: typeMaybe.pos };
    const varType = this.typeFromAnnotation(typeMaybe, typeAnchor, sf);
    const declAnchor: { pos: number } = { pos: d.pos };
    this.assertNotVoid(varType, declAnchor, "module global type");
    const bindingAnchor: { pos: number } = { pos: d.pos };
    this.scope.declareBinding(d.name, varType, d.declKind === "const", bindingAnchor);
    this.moduleGlobalTypes.set(d.name, varType);
    return `static ${cTypeName(varType)} ${d.name};`;
  }

  private emitModuleGlobalInit(stmt: Stmt, sf: SourceModule, indent: number): string {
    const savedG = g_currentModule;
    const savedT = this.currentTypeModule;
    g_currentModule = sf;
    this.currentTypeModule = sf;
    switch (stmt.kind) {
      case "var_decl":
        const d = stmt;
        const initMaybe = d.init;
        if (initMaybe !== undefined) {
          const init = initMaybe;
          const varTypeMaybe = this.moduleGlobalTypes.get(d.name);
          if (varTypeMaybe !== undefined) {
            const varType = varTypeMaybe;
            const pad = "  ".repeat(indent);
            const out = `${pad}${d.name} = ${this.emitWithExpected(init, varType)};`;
            g_currentModule = savedG;
            this.currentTypeModule = savedT;
            return out;
          }
          throwInternalCodegenError("emitModuleGlobalInit: missing module global type");
          return "";
        }
        throwInternalCodegenError("emitModuleGlobalInit: expected initialized var_decl");
        return "";
      default:
        throwInternalCodegenError("emitModuleGlobalInit: expected initialized var_decl");
        return "";
    }
  }

  // Phase 1.5-6 prep #9: recognize the set of initializers that are
  // representable as a C compile-time constant expression of scalar type.
  // Only number / boolean literals (with optional unary +/- on number)
  // qualify; string literals are kept in main() body for now because the
  // `topaz_string` struct literal form needs separate accommodation. The
  // num-literal text is the raw source spelling (Topaz `num_lit.text`),
  // matching the SCC's number emission.
  private tryScalarLiteralInit(
    expr: Expr,
  ): { type: TopazType; cExpr: string } | undefined {
    switch (expr.kind) {
      case "num_lit":
        const t = expr.text;
        return { type: T_NUMBER, cExpr: hasDecimalOrExponent(t) ? t : `${t}.0` };
      case "bool_lit":
        return { type: T_BOOLEAN, cExpr: expr.value ? "true" : "false" };
      case "prefix_op":
        if (expr.op !== "-" && expr.op !== "+") {
          return undefined;
        }
        const operand = expr.operand;
        switch (operand.kind) {
          case "num_lit":
            const operandText = operand.text;
            const num = hasDecimalOrExponent(operandText) ? operandText : `${operandText}.0`;
            return { type: T_NUMBER, cExpr: `${expr.op}${num}` };
          default:
            return undefined;
        }
        return undefined;
      default:
        return undefined;
    }
  }

  // Phase 1.5-6 prep-destructuring: lower `const { a, b } = expr;` to
  //   <recv-ty> __topaz_destr_<N> = <init>;
  //   <T_a> a = __topaz_destr_<N>-><a>;        // for class receiver
  //   <T_b> b = __topaz_destr_<N>.vt->get_<b>(__topaz_destr_<N>.data); // for iface
  // The receiver is evaluated exactly once. Each binding registers in the
  // current scope with `isConst` of the surrounding declaration.
  //
  // Strict subset: simple-identifier bindings only. property rename, default
  // value, rest element, nested pattern, and a pattern-level type annotation
  // are all rejected up front so the surface stays small (self-hosting only
  // needs the bare form). Empty pattern `const {} = ...` is also rejected as
  // likely a typo.
  private emitObjectDestructuringDecl(
    decl: VarDestrDeclStmt,
    isConst: boolean,
    indent: number,
  ): string {
    const pad = "  ".repeat(indent);
    // Phase 1.5-6e-2: the syntactic rejects (pattern-level type annotation,
    // missing initializer, rest / default / property rename / nested pattern)
    // now live in convert (`convertVarDeclList`). The empty-pattern check and
    // the receiver-shape / field-existence semantic checks stay here.
    const declAnchor: { pos: number } = { pos: decl.pos };
    const initAnchor: { pos: number } = { pos: decl.init.pos };
    if (decl.bindings.length === 0) {
      throw new CodegenError(declAnchor, "empty object destructuring pattern is unsupported");
    }

    const recvType = this.inferType(decl.init);
    this.assertNotVoid(
      recvType,
      initAnchor,
      "destructuring initializer (void-returning call cannot be destructured)",
    );

    // Receiver must be a class (anonymous / named / generic monomorph) or an
    // interface. Anything else cannot expose named fields uniformly. Helpful
    // hints are surfaced for the closest near-misses (T | undefined, dunion).
    let receiverInfo: {
      fields: Map<string, TopazType>;
      methods: Set<string>;
      receiverKind: string;
      receiverName: string;
    } = {
      fields: new Map<string, TopazType>(),
      methods: new Set<string>(),
      receiverKind: "class",
      receiverName: "",
    };
    if (isClassType(recvType)) {
      const classNameMaybe = classNameOf(recvType);
      if (classNameMaybe === undefined) {
        throw new CodegenError(declAnchor, "internal: class '<unknown>' not registered");
      }
      const className = classNameMaybe;
      const cls = this.classes.get(className);
      if (cls === undefined) {
        throw new CodegenError(declAnchor, `internal: class '${className}' not registered`);
      }
      const methods = new Set<string>();
      for (const methodName of cls.methods.keys()) {
        methods.add(methodName);
      }
      receiverInfo = {
        fields: cls.fields,
        methods,
        receiverKind: "class",
        receiverName: cls.name,
      };
    } else if (isInterfaceType(recvType)) {
      const interfaceNameMaybe = interfaceNameOf(recvType);
      if (interfaceNameMaybe === undefined) {
        throw new CodegenError(declAnchor, "internal: interface '<unknown>' not registered");
      }
      const interfaceName = interfaceNameMaybe;
      const iface = this.interfaces.get(interfaceName);
      if (iface === undefined) {
        throw new CodegenError(declAnchor, `internal: interface '${interfaceName}' not registered`);
      }
      const methods = new Set<string>();
      for (const methodName of iface.methods.keys()) {
        methods.add(methodName);
      }
      receiverInfo = {
        fields: iface.fields,
        methods,
        receiverKind: "iface",
        receiverName: iface.name,
      };
    } else if (recvType.kind === "union") {
      throw new CodegenError(
        initAnchor,
        `object destructuring on \`${typeIdent(recvType)}\` requires narrowing first (e.g. \`if (x !== undefined)\` or \`x!\`)`,
      );
    } else if (recvType.kind === "dunion") {
      throw new CodegenError(
        initAnchor,
        "object destructuring on a discriminated union is unsupported (narrow with `switch (x.kind)` first)",
      );
    } else {
      throw new CodegenError(
        initAnchor,
        `object destructuring requires a class or interface receiver; got ${typeIdent(recvType)}`,
      );
    }

    for (const b of decl.bindings) {
      const fname = b.name;
      const fieldAnchor: { pos: number } = { pos: b.pos };
      if (!receiverInfo.fields.has(fname)) {
        if (receiverInfo.methods.has(fname)) {
          throw new CodegenError(
            fieldAnchor,
            `'${fname}' is a method of '${receiverInfo.receiverName}', not a field - methods cannot be destructured (method-as-value is unsupported)`,
          );
        }
        throw new CodegenError(
          fieldAnchor,
          `${receiverInfo.receiverKind} '${receiverInfo.receiverName}' has no field '${fname}'`,
        );
      }
    }

    // Emit the receiver expression once into a tmp, then per-binding reads.
    // For class receivers the tmp is a pointer; for iface receivers it is the
    // fat-pointer struct passed by value (cTypeName handles both spellings).
    const tmpId = this.tmpCounter++;
    const tmp = `__topaz_destr_${tmpId}`;
    const initExpr = this.emitExpression(decl.init);

    const lines: string[] = [];
    lines.push(`${pad}${cTypeName(recvType)} ${tmp} = ${initExpr};`);
    for (const b of decl.bindings) {
      const fname = b.name;
      const fty = receiverInfo.fields.get(fname)!;
      const accessor = receiverInfo.receiverKind === "class"
        ? `${tmp}->${fname}`
        : `${tmp}.vt->get_${fname}(${tmp}.data)`;
      lines.push(`${pad}${cTypeName(fty)} ${fname} = ${accessor};`);
      const bindingAnchor: { pos: number } = { pos: b.pos };
      this.scope.declareBinding(fname, fty, isConst, bindingAnchor);
    }
    return lines.join("\n");
  }

  private declareVar(
    decl: VarDeclStmt,
    isConst: boolean,
  ): { type: TopazType; cName: string; initStr: string } {
    // Phase 1.5-6e-2: convert guarantees a simple-identifier name. A `var_decl`
    // with no initializer is rejected here (let / const require an initializer
    // in this subset).
    const declAnchor: { pos: number } = { pos: decl.pos };
    const initMaybe = decl.init;
    if (initMaybe === undefined) {
      throw new CodegenError(declAnchor, "variable declaration must have an initializer");
    }
    const name = decl.name;
    const init = initMaybe;

    const typeMaybe = decl.type;
    if (typeMaybe !== undefined) {
      const typeAnchor: { pos: number } = { pos: typeMaybe.pos };
      const varType = this.typeFromAnnotation(typeMaybe, typeAnchor, g_currentModule!);
      this.assertNotVoid(varType, declAnchor, "variable type");
      // emitWithExpected threads `varType` through ArrayLiteral / NewExpression
      // context typing and applies class -> interface coercion when needed.
      const initExpr = this.emitWithExpected(init, varType);
      // Phase 1.5-6 prep: initializer narrowing. `const x: U = init` where U is
      // a discriminated union and init's static type is a concrete variant
      // keeps the narrowed variant for subsequent reads (tsc CFA narrows the
      // declared type at the assignment point). The C variable still holds the
      // dunion fat pointer (initExpr already coerced into it), so reads route
      // through the existing dunion -> variant `.data` cast in the identifier /
      // property-access emit paths. Restricted to `const`: a `let` reassignment
      // to a different variant would leave the narrowing stale (there is no
      // narrowing-invalidation hook on plain assignment yet).
      // Object / array literals and arrows are contextually typed — inferType
      // rejects them without an expected type — and an object literal in a
      // dunion slot stays unnarrowed by design (the common-field write check
      // depends on it). Only initializers that type on their own (calls, `new`,
      // identifiers, member reads) feed the narrowing.
      const initBareTypeable =
        init.kind !== "object_lit" &&
        init.kind !== "array_lit" &&
        init.kind !== "arrow_expr";
      if (isConst && varType.kind === "dunion" && initBareTypeable) {
        const initType = this.inferType(init);
        if (isClassType(initType)) {
          const classNameMaybe = classNameOf(initType);
          if (classNameMaybe !== undefined && varType.variants.includes(classNameMaybe)) {
            this.scope.declareBinding(name, varType, isConst, declAnchor);
            this.scope.narrow(name, initType);
            return { type: varType, cName: name, initStr: ` = ${initExpr}` };
          }
        }
      }
      this.scope.declareBinding(name, varType, isConst, declAnchor);
      return { type: varType, cName: name, initStr: ` = ${initExpr}` };
    } else {
      if (init.kind === "new_expr") {
        const callee = init.callee;
        if (callee.kind === "ident") {
          if ((callee.name === "Map" || callee.name === "Set") && init.typeArgs.length === 0) {
            const initAnchor: { pos: number } = { pos: init.pos };
            throw new CodegenError(
              initAnchor,
              "cannot infer constructor type arguments; write `new Map<K, V>()` / `new Set<T>()` or annotate the binding",
            );
          }
        }
      }
      const varType = this.inferType(init);
      this.assertNotVoid(varType, declAnchor, "variable initializer (void-returning call cannot be stored)");
      if (init.kind === "array_lit") {
        const initExpr = this.emitArrayLiteral(init, varType);
        this.scope.declareBinding(name, varType, isConst, declAnchor);
        return { type: varType, cName: name, initStr: ` = ${initExpr}` };
      }
      if (init.kind === "new_expr") {
        const initExpr = this.emitNewExpression(init, varType);
        this.scope.declareBinding(name, varType, isConst, declAnchor);
        return { type: varType, cName: name, initStr: ` = ${initExpr}` };
      }
      const initExpr = this.emitExpression(init);
      this.scope.declareBinding(name, varType, isConst, declAnchor);
      return { type: varType, cName: name, initStr: ` = ${initExpr}` };
    }
  }

  private emitForStatement(stmt: ForStmt, indent: number): string {
    const pad = "  ".repeat(indent);
    this.scope.push();
    let initStr = "";
    const initMaybe = stmt.init;
    if (initMaybe !== undefined) {
      if (initMaybe.kind === "for_init_decl") {
        // `for_init_decl.decl` is a single `var_decl`; convert already split
        // out / rejected destructuring and multi-decl for-init.
        const d = initMaybe.decl;
        const declaredVar = this.declareVar(d, d.declKind === "const");
        initStr = `${cTypeName(declaredVar.type)} ${declaredVar.cName}${declaredVar.initStr}`;
      } else {
        initStr = this.emitExpression(initMaybe.expr);
      }
    }
    // A missing condition (`for (;;)`) is an infinite loop — C accepts an
    // empty middle clause natively, so emit it verbatim (the body is expected
    // to `break` / `return` / `throw` out). init / incrementor are already
    // optional above (initStr / incrStr stay empty when omitted).
    let condStr = "";
    const condMaybe = stmt.cond;
    if (condMaybe !== undefined) {
      this.expectType(condMaybe, T_BOOLEAN);
      condStr = this.emitExpression(condMaybe);
    }
    let incrStr = "";
    const updateMaybe = stmt.update;
    if (updateMaybe !== undefined) {
      incrStr = this.emitExpression(updateMaybe);
    }

    this.pushLoopCtx("loop");
    const bodyStr = this.emitStatementAsBlock(stmt.body, indent);
    this.popLoopCtx();
    this.scope.pop();
    return `${pad}for (${initStr}; ${condStr}; ${incrStr}) ${bodyStr.trimStart()}`;
  }

  // Phase 1.5-3.5b: for-of over Array<T>. Lower to an index-based C for-loop
  // that snapshots the array reference into a tmp (so RHS is evaluated once
  // even when it's a call like `getItems()`), then walks `__arr->data[i]`
  // directly — bounds are guaranteed by `i < __arr->len`, so the per-element
  // `topaz_array_*_at` bounds-check is skipped. for-await is rejected (no
  // async support exists yet).
  //
  // Phase 1.5-3.5g: extended to Map.values() / Map.keys() / Set / Set.values()
  // / Set.keys(). Hash-table walks iterate `slots[0..cap)` and skip slots
  // whose `state != OCCUPIED` (empty / tombstone) — the user's `continue` /
  // `break` retain their plain semantics because the OCCUPIED filter shares
  // the same `for` loop.
  //
  // Phase 1.5-3.5h-entries: `.entries()` over Map / Set in for-of position
  // accepts `for (const [k, v] of m.entries())`. The destructuring is treated
  // as a syntactic special form — both names bind directly off the same hash
  // slot (no synthetic [K, V] tuple type, no Iterator<[K, V]>). Set.entries()
  // yields [elem, elem] pairs (matches JS).
  //
  // Loop-var lifetime note: the C variable is reused across iterations, so
  // capturing it from a closure (1.5-3.5e) sees the post-loop value (scalar)
  // or the same reference (class / iface). Arrow closures sidestep that by
  // arena-allocating a fresh env per iteration — by-value capture snapshots
  // the loop var at env construction time.
  private emitForOfBlockBodyLines(body: BlockStmt, indent: number): string[] {
    const lines: string[] = [];
    for (const s of body.stmts) {
      lines.push(this.emitStatement(s, indent));
      this.applyCarryNarrowing(s);
    }
    return lines;
  }

  private emitForOfSingleBodyLine(body: Stmt, indent: number): string[] {
    const lines: string[] = [];
    lines.push(this.emitStatement(body, indent));
    this.applyCarryNarrowing(body);
    return lines;
  }

  private emitForOfBodyLines(body: Stmt, indent: number): string[] {
    switch (body.kind) {
      case "block_stmt":
        return this.emitForOfBlockBodyLines(body, indent);
      default:
        return this.emitForOfSingleBodyLine(body, indent);
    }
  }

  private emitForOfStatement(stmt: ForOfStmt, indent: number): string {
    // Phase 1.5-6e-2: `for await`, non-decl bindings, multi-decl, `var`, and an
    // initializer on the binding are all rejected in convert. The binding is
    // already parsed into `for_of_single` / `for_of_pair`.
    const stmtAnchor: { pos: number } = { pos: stmt.pos };
    const sourceAnchor: { pos: number } = { pos: stmt.source.pos };
    const binding = stmt.binding;
    const isConst = binding.declKind === "const";
    const bindingType =
      binding.kind === "for_of_single" ? binding.type : undefined;

    // Phase 1.5-3.5g: detect Map.values() / Map.keys() / Set.values() /
    // Set.keys() as a syntactic special form *before* the regular inferType
    // dispatch — `.values()` is rejected in expression position, so the
    // generic infer path would surface a less helpful error.
    //
    // Phase 1.5-3.5h-entries: `.entries()` also goes through this special form
    // path; pair binding lowers to two declarations off the same slot.
    const source = stmt.source;
    if (source.kind === "call_expr") {
      const callExpr = source;
      if (callExpr.optional === false) {
        const callee = callExpr.callee;
        if (callee.kind === "prop_access" && callee.optional === false) {
          const methodName = callee.name;
          if (methodName === "values" || methodName === "keys" || methodName === "entries") {
            const baseType = this.inferType(callee.receiver);
            if (isMapType(baseType) || isSetType(baseType)) {
              if (callExpr.args.length !== 0) {
                throw new CodegenError({ pos: callExpr.pos }, `.${methodName}() takes no arguments`);
              }
              if (methodName === "entries") {
                if (binding.kind !== "for_of_pair") {
                  throw new CodegenError(
                    { pos: stmt.pos },
                    "for-of over .entries() requires destructuring binding `for (const [k, v] of ...)`",
                  );
                }
                if (isMapType(baseType)) {
                  this.recordMapMonomorph(baseType);
                  const keyTypeMaybe = mapKey(baseType);
                  if (keyTypeMaybe === undefined) {
                    throw new CodegenError({ pos: callExpr.pos }, "internal error: Map.entries() missing key type");
                  }
                  const valueTypeMaybe = mapValue(baseType);
                  if (valueTypeMaybe === undefined) {
                    throw new CodegenError({ pos: callExpr.pos }, "internal error: Map.entries() missing value type");
                  }
                  const pairInfo: {
                    keyType: TopazType;
                    valueType: TopazType;
                    secondField: "value";
                  } = { keyType: keyTypeMaybe, valueType: valueTypeMaybe, secondField: "value" };
                  const bindSpec: {
                    kind: "pair";
                    firstName: string; firstField: string; firstType: TopazType;
                    secondName: string; secondField: string; secondType: TopazType;
                  } = {
                    kind: "pair",
                    firstName: binding.first, firstField: "key", firstType: pairInfo.keyType,
                    secondName: binding.second, secondField: "value", secondType: pairInfo.valueType,
                  };
                  return this.emitForOfHashLowering(
                    stmt, indent, baseType, callee.receiver,
                    bindSpec,
                    undefined, isConst,
                  );
                }
                // Set.entries() yields [elem, elem] pairs (matches JS).
                this.recordSetMonomorph(baseType);
                const elemTypeMaybe = setElem(baseType);
                if (elemTypeMaybe === undefined) {
                  throw new CodegenError({ pos: callExpr.pos }, "internal error: Set.entries() missing element type");
                }
                const pairInfo: {
                  keyType: TopazType;
                  valueType: TopazType;
                  secondField: "key";
                } = { keyType: elemTypeMaybe, valueType: elemTypeMaybe, secondField: "key" };
                const bindSpec: {
                  kind: "pair";
                  firstName: string; firstField: string; firstType: TopazType;
                  secondName: string; secondField: string; secondType: TopazType;
                } = {
                  kind: "pair",
                  firstName: binding.first, firstField: "key", firstType: pairInfo.keyType,
                  secondName: binding.second, secondField: "key", secondType: pairInfo.valueType,
                };
                return this.emitForOfHashLowering(
                  stmt, indent, baseType, callee.receiver,
                  bindSpec,
                  undefined, isConst,
                );
              }
              // .values() / .keys() — single binding required.
              if (binding.kind !== "for_of_single") {
                throw new CodegenError(
                  { pos: stmt.pos },
                  `for-of over .${methodName}() takes a single binding, not destructuring`,
                );
              }
              if (isMapType(baseType)) {
                this.recordMapMonomorph(baseType);
                if (methodName === "values") {
                  const bindTypeMaybe = mapValue(baseType);
                  if (bindTypeMaybe === undefined) {
                    throw new CodegenError({ pos: callExpr.pos }, "internal error: Map.values() missing value type");
                  }
                  const singleInfo: { bindType: TopazType; field: "value" } =
                    { bindType: bindTypeMaybe, field: "value" };
                  const bindSpec: { kind: "single"; name: string; field: string; type: TopazType } =
                    { kind: "single", name: binding.name, field: "value", type: singleInfo.bindType };
                  return this.emitForOfHashLowering(
                    stmt, indent, baseType, callee.receiver,
                    bindSpec,
                    bindingType, isConst,
                  );
                }
                const bindTypeMaybe = mapKey(baseType);
                if (bindTypeMaybe === undefined) {
                  throw new CodegenError({ pos: callExpr.pos }, "internal error: Map.keys() missing key type");
                }
                const singleInfo: { bindType: TopazType; field: "key" } =
                  { bindType: bindTypeMaybe, field: "key" };
                const bindSpec: { kind: "single"; name: string; field: string; type: TopazType } =
                  { kind: "single", name: binding.name, field: "key", type: singleInfo.bindType };
                return this.emitForOfHashLowering(
                  stmt, indent, baseType, callee.receiver,
                  bindSpec,
                  bindingType, isConst,
                );
              }
              // Set: both .values() and .keys() yield the element (matches JS).
              this.recordSetMonomorph(baseType);
              const bindTypeMaybe = setElem(baseType);
              if (bindTypeMaybe === undefined) {
                throw new CodegenError({ pos: callExpr.pos }, "internal error: Set values/keys missing element type");
              }
              const singleInfo: { bindType: TopazType; field: "key" } =
                { bindType: bindTypeMaybe, field: "key" };
              const bindSpec: { kind: "single"; name: string; field: string; type: TopazType } =
                { kind: "single", name: binding.name, field: "key", type: singleInfo.bindType };
              return this.emitForOfHashLowering(
                stmt, indent, baseType, callee.receiver,
                bindSpec,
                bindingType, isConst,
              );
            }
          }
        }
      }
    }

    // Non-special-form paths only accept single binding (no destructuring
    // for plain Array / Set / Iterator iteration — we have no tuple type
    // and `[a, b] = arr` on an Array<T> would require T|undefined semantics
    // for missing elements which we don't want to leak in for-of binding).
    if (binding.kind === "for_of_pair") {
      throw new CodegenError(
        stmtAnchor,
        "destructuring binding in for-of is only supported for .entries() on Map / Set",
      );
    }
    const bindName = binding.name;

    const rhsType = this.inferType(stmt.source);

    // Phase 1.5-3.5g: plain Set RHS iterates over elements (JS treats Set as
    // its own iterable; `[...set]` and `for (const x of set)` both yield
    // values). Uses the same hash-walk helper as Set.values().
    if (isSetType(rhsType)) {
      this.recordSetMonomorph(rhsType);
      const elemType = setElem(rhsType)!;
      return this.emitForOfHashLowering(
        stmt, indent, rhsType, stmt.source,
        { kind: "single", name: bindName, field: "key", type: elemType },
        bindingType, isConst,
      );
    }

    // Phase 1.5-3.5g-iterator: arbitrary Iterator<T> RHS (e.g. a bound iter,
    // a function-returned iter, or a chained .values() left in a tmp) lowers
    // to a while-loop driven by the iter's `next(state, &done)` callback. The
    // hash-form lowering above stays as a fast-path optimization for direct
    // .values() / .keys() / Set RHS — both forms are observationally equal.
    if (rhsType.kind === "iter") {
      return this.emitForOfIteratorLowering(
        stmt, indent, rhsType, stmt.source,
        bindName, bindingType, isConst,
      );
    }

    if (!isArrayType(rhsType)) {
      let hint = "";
      if (isMapType(rhsType)) {
        hint = " (use `.values()` / `.keys()` / `.entries()`)";
      } else if (rhsType.kind === "string") {
        hint = " (string iteration is unsupported; index with `[i]` instead)";
      }
      throw new CodegenError(
        sourceAnchor,
        `for-of requires an Array<T>, Set<T>, Iterator<T>, Map.values(), Map.keys(), or Map.entries() (got ${typeIdent(rhsType)})${hint}`,
      );
    }
    this.recordArrayMonomorph(rhsType);
    const elemTypeMaybe = arrayElem(rhsType);
    if (elemTypeMaybe === undefined) {
      throw new CodegenError(sourceAnchor, "internal error: Array for-of missing element type");
    }
    const elemType = elemTypeMaybe;

    if (bindingType !== undefined) {
      const bindingTypeAnchor: { pos: number } = { pos: bindingType.pos };
      const declared = this.typeFromAnnotation(bindingType, bindingTypeAnchor, g_currentModule!);
      if (!typeEq(declared, elemType)) {
        throw new CodegenError(
          bindingTypeAnchor,
          `for-of binding type ${typeIdent(declared)} does not match array element type ${typeIdent(elemType)}`,
        );
      }
    }

    const pad = "  ".repeat(indent);
    const id = this.tmpCounter++;
    const arrTmp = `__topaz_for_arr_${id}`;
    const idxTmp = `__topaz_for_idx_${id}`;
    const arrCType = cTypeName(rhsType);
    const elemCType = cTypeName(elemType);
    const rhsExpr = this.emitExpression(stmt.source);
    const innerPad = "  ".repeat(indent + 2);

    // Outer Topaz scope holds the binding so the body's inferType / scope
    // lookups see the right element type. We also push a second frame for
    // the body itself so any narrowing inside the loop pops cleanly.
    this.scope.push();
    this.scope.declareBinding(bindName, elemType, isConst, stmtAnchor);
    this.scope.push();
    this.pushLoopCtx("loop");

    const stmtLines = this.emitForOfBodyLines(stmt.body, indent + 2);

    const lines: string[] = [];
    lines.push(`${pad}{`);
    lines.push(`${pad}  ${arrCType} ${arrTmp} = ${rhsExpr};`);
    lines.push(
      `${pad}  for (size_t ${idxTmp} = 0; ${idxTmp} < ${arrTmp}->len; ${idxTmp}++) {`,
    );
    lines.push(`${innerPad}${elemCType} ${bindName} = ${arrTmp}->data[${idxTmp}];`);
    if (stmtLines.length > 0) lines.push(stmtLines.join("\n"));
    lines.push(`${pad}  }`);
    lines.push(`${pad}}`);

    this.popLoopCtx();
    this.scope.pop();
    this.scope.pop();
    return lines.join("\n");
  }


  // Phase 1.5-3.5g: walk a Map / Set's open-addressing slot array, skipping
  // empty / tombstone slots. The user's `continue` / `break` refer to the
  // same C `for` loop the OCCUPIED filter uses, so they behave naturally
  // (continue → next slot, break → exit). `cap == 0` is safe: the loop
  // condition `i < 0` is false, slots is never read.
  //
  // Phase 1.5-3.5h-entries: bindSpec carries either a single binding (the
  // .values() / .keys() / plain-Set case) or a pair (the .entries() case).
  // For the pair case, both names bind off the same slot in a single C loop
  // iteration — no synthetic tuple type involved.
  private emitForOfHashLowering(
    stmt: ForOfStmt,
    indent: number,
    containerType: TopazType,
    recvExpr: Expr,
    bindSpec:
      | { kind: "single"; name: string; field: string; type: TopazType }
      | {
          kind: "pair";
          firstName: string; firstField: string; firstType: TopazType;
          secondName: string; secondField: string; secondType: TopazType;
        },
    bindingType: TypeNode | undefined,
    isConst: boolean,
  ): string {
    const pad = "  ".repeat(indent);

    if (bindSpec.kind === "single") {
      if (bindingType !== undefined) {
        const bindingTypeNode = bindingType;
        const bindingTypeAnchor: { pos: number } = { pos: bindingTypeNode.pos };
        const declared = this.typeFromAnnotation(bindingTypeNode, bindingTypeAnchor, g_currentModule!);
        if (!typeEq(declared, bindSpec.type)) {
          const what =
            bindSpec.field === "value" ? "value" : (isMapType(containerType) ? "key" : "element");
          throw new CodegenError(
            bindingTypeAnchor,
            `for-of binding type ${typeIdent(declared)} does not match ${what} type ${typeIdent(bindSpec.type)}`,
          );
        }
      }
    }

    const id = this.tmpCounter++;
    const htTmp = `__topaz_for_ht_${id}`;
    const idxTmp = `__topaz_for_idx_${id}`;
    const htCType = cTypeName(containerType);
    const recvStr = this.emitExpression(recvExpr);
    const innerPad = "  ".repeat(indent + 2);

    this.scope.push();
    const bindingAnchor: { pos: number } = { pos: stmt.pos };
    if (bindSpec.kind === "single") {
      this.scope.declareBinding(bindSpec.name, bindSpec.type, isConst, bindingAnchor);
    } else {
      this.scope.declareBinding(bindSpec.firstName, bindSpec.firstType, isConst, bindingAnchor);
      this.scope.declareBinding(bindSpec.secondName, bindSpec.secondType, isConst, bindingAnchor);
    }
    this.scope.push();
    this.pushLoopCtx("loop");

    const stmtLines = this.emitForOfBodyLines(stmt.body, indent + 2);

    const lines: string[] = [];
    lines.push(`${pad}{`);
    lines.push(`${pad}  ${htCType} ${htTmp} = ${recvStr};`);
    lines.push(
      `${pad}  for (size_t ${idxTmp} = 0; ${idxTmp} < ${htTmp}->cap; ${idxTmp}++) {`,
    );
    lines.push(
      `${innerPad}if (${htTmp}->slots[${idxTmp}].state != TOPAZ_HASH_SLOT_OCCUPIED) continue;`,
    );
    if (bindSpec.kind === "single") {
      lines.push(
        `${innerPad}${cTypeName(bindSpec.type)} ${bindSpec.name} = ${htTmp}->slots[${idxTmp}].${bindSpec.field};`,
      );
    } else {
      lines.push(
        `${innerPad}${cTypeName(bindSpec.firstType)} ${bindSpec.firstName} = ${htTmp}->slots[${idxTmp}].${bindSpec.firstField};`,
      );
      lines.push(
        `${innerPad}${cTypeName(bindSpec.secondType)} ${bindSpec.secondName} = ${htTmp}->slots[${idxTmp}].${bindSpec.secondField};`,
      );
    }
    if (stmtLines.length > 0) lines.push(stmtLines.join("\n"));
    lines.push(`${pad}  }`);
    lines.push(`${pad}}`);

    this.popLoopCtx();
    this.scope.pop();
    this.scope.pop();
    return lines.join("\n");
  }

  // Phase 1.5-3.5g-iterator: drive an arbitrary Iterator<T> via its `next`
  // callback in a while-loop. The iter is snapshotted into a tmp so the RHS is
  // evaluated once; each iteration calls `it.next(it.state, &done)` and stops
  // when done. The return value when done is undefined-ish but ignored.
  private emitForOfIteratorLowering(
    stmt: ForOfStmt,
    indent: number,
    iterType: IterType,
    recvExpr: Expr,
    bindName: string,
    bindingType: TypeNode | undefined,
    isConst: boolean,
  ): string {
    const pad = "  ".repeat(indent);
    const bindType = iterType.elem;

    if (bindingType !== undefined) {
      const bindingTypeNode = bindingType;
      const bindingTypeAnchor: { pos: number } = { pos: bindingTypeNode.pos };
      const declared = this.typeFromAnnotation(bindingTypeNode, bindingTypeAnchor, g_currentModule!);
      if (!typeEq(declared, bindType)) {
        throw new CodegenError(
          bindingTypeAnchor,
          `for-of binding type ${typeIdent(declared)} does not match iterator element type ${typeIdent(bindType)}`,
        );
      }
    }

    const id = this.tmpCounter++;
    const iterTmp = `__topaz_for_iter_${id}`;
    const doneTmp = `__topaz_for_done_${id}`;
    const valTmp = `__topaz_for_val_${id}`;
    const iterCType = cTypeName(iterType);
    const bindCType = cTypeName(bindType);
    const recvStr = this.emitExpression(recvExpr);
    const innerPad = "  ".repeat(indent + 2);

    this.scope.push();
    const bindingAnchor: { pos: number } = { pos: stmt.pos };
    this.scope.declareBinding(bindName, bindType, isConst, bindingAnchor);
    this.scope.push();
    this.pushLoopCtx("loop");

    const stmtLines = this.emitForOfBodyLines(stmt.body, indent + 2);

    const lines: string[] = [];
    lines.push(`${pad}{`);
    lines.push(`${pad}  ${iterCType} ${iterTmp} = ${recvStr};`);
    lines.push(`${pad}  for (;;) {`);
    lines.push(`${innerPad}bool ${doneTmp} = false;`);
    lines.push(
      `${innerPad}${bindCType} ${valTmp} = ${iterTmp}.next(${iterTmp}.state, &${doneTmp});`,
    );
    lines.push(`${innerPad}if (${doneTmp}) break;`);
    lines.push(`${innerPad}${bindCType} ${bindName} = ${valTmp};`);
    if (stmtLines.length > 0) lines.push(stmtLines.join("\n"));
    lines.push(`${pad}  }`);
    lines.push(`${pad}}`);

    this.popLoopCtx();
    this.scope.pop();
    this.scope.pop();
    return lines.join("\n");
  }

  private emitSwitchStatement(stmt: SwitchStmt, indent: number): string {
    const pad = "  ".repeat(indent);
    const discType = this.inferType(stmt.discriminant);
    const clauses = stmt.cases;

    // Phase 1.5-3e: detect `switch (<id>.<discriminator>)` on a dunion-typed
    // identifier. When matched, each case body sees `<id>` narrowed to the
    // class whose discriminator literal equals the case label. Reuses the
    // ordinary scope.narrow path so identifier emit casts via `.data`.
    let dunionTarget: { name: string; dunion: DunionType } | undefined = undefined;
    const disc = stmt.discriminant;
    if (disc.kind === "prop_access") {
      if (disc.optional === false) {
        const receiver = disc.receiver;
        if (receiver.kind === "ident") {
          const idName = receiver.name;
          const b = this.scope.lookup(idName);
          if (b !== undefined) {
            const bindingType = b.type;
            if (bindingType.kind === "dunion" && disc.name === bindingType.discriminator) {
              dunionTarget = { name: idName, dunion: bindingType };
            }
          }
        }
      }
    }

    let defaultClause: SwitchCase | undefined = undefined;
    let clauseIndex = 0;
    for (const c of clauses) {
      if (c.test === undefined) {
        if (clauseIndex !== clauses.length - 1) {
          const defaultAnchor: { pos: number } = { pos: c.pos };
          throw new CodegenError(defaultAnchor, "`default` must be the last clause of `switch`");
        }
        defaultClause = c;
      }
      clauseIndex = clauseIndex + 1;
    }

    const groups: SwitchGroup[] = [];
    let pending: Expr[] = [];
    for (const c of clauses) {
      const testExpr = c.test;
      if (testExpr !== undefined) {
        this.expectType(testExpr, discType);
        pending.push(testExpr);
        if (c.stmts.length > 0) {
          groups.push({ conds: pending, body: c.stmts });
          const nextPending: Expr[] = [];
          pending = nextPending;
        }
      }
    }
    if (pending.length > 0) {
      groups.push({ conds: pending, body: [] });
    }

    const isTerminator = (s: Stmt): boolean =>
      s.kind === "break_stmt" ||
      s.kind === "return_stmt" ||
      s.kind === "throw_stmt" ||
      s.kind === "continue_stmt";
    for (const g of groups) {
      if (g.body.length > 0) {
        const lastIndex = g.body.length - 1;
        const lastStmt: Stmt | undefined = g.body[lastIndex];
        if (lastStmt !== undefined) {
          if (isTerminator(lastStmt) === false) {
            const lastAnchor: { pos: number } = { pos: lastStmt.pos };
            throw new CodegenError(
              lastAnchor,
              "case body must end with `break` or `return` (implicit fall-through is unsupported)",
            );
          }
        } else {
          throwInternalCodegenError("emitSwitchStatement: missing last case statement");
        }
      }
    }

    // Phase 1.5-3e: pre-compute, for a dunion switch, which class each case
    // narrows to. A case label that matches multiple variants (impossible
    // under tryMakeDiscriminatedUnion's uniqueness check) or none falls back
    // to no narrowing. Multi-label fall-through groups only narrow if every
    // label points at the same class.
    const groupHasNarrowClass: boolean[] = [];
    const groupNarrowClassNames: string[] = [];
    if (dunionTarget !== undefined) {
      const literalToClass = new Map<string, string>();
      for (const cname of dunionTarget.dunion.variants) {
        literalToClass.set(this.dunionLiteralFor(dunionTarget.dunion, cname), cname);
      }
      for (const g of groups) {
        let acc = "";
        let hasAcc = false;
        let agree = true;
        for (const c of g.conds) {
          const litText = stringLitText(c);
          if (litText === undefined) {
            agree = false;
            break;
          }
          const cls = literalToClass.get(litText);
          if (cls === undefined) { agree = false; break; }
          if (hasAcc === false) { acc = cls; hasAcc = true; }
          else if (acc !== cls) { agree = false; break; }
        }
        if (agree === true && hasAcc === true) {
          groupHasNarrowClass.push(true);
          groupNarrowClassNames.push(acc);
        } else {
          groupHasNarrowClass.push(false);
          groupNarrowClassNames.push("");
        }
      }
    }

    const id = this.switchCounter++;
    const tmp = `__topaz_sw_${id}`;
    const discExpr = this.emitExpression(stmt.discriminant);

    const out: string[] = [];
    out.push(`${pad}{`);
    out.push(`${pad}  ${cTypeName(discType)} ${tmp} = ${discExpr};`);
    out.push(`${pad}  do {`);

    this.scope.push();
    // Phase 1.5-6e-2: a switch lowers to do/while(0); a `continue` inside a
    // case body must be rejected (it would `continue` the synthetic loop). Push
    // a "switch" context around the case-body emission so checkContinueAllowed
    // sees it on top.
    this.pushLoopCtx("switch");
    const cmp = (rhs: string): string =>
      discType.kind === "string"
        ? `topaz_string_eq(${tmp}, ${rhs})`
        : `${tmp} == ${rhs}`;
    let first = true;
    let groupIndex = 0;
    for (const g of groups) {
      const conds = g.conds.map((c) => cmp(this.emitExpression(c))).join(" || ");
      const head = first ? "if" : "else if";
      if (g.body.length === 0) {
        out.push(`${pad}    ${head} (${conds}) { break; }`);
      } else {
        out.push(`${pad}    ${head} (${conds}) {`);
        this.scope.push();
        if (dunionTarget !== undefined) {
          const hasNarrowCls = groupHasNarrowClass[groupIndex];
          if (hasNarrowCls === true) {
            const narrowCls = groupNarrowClassNames[groupIndex];
            this.scope.narrow(dunionTarget.name, classOf(narrowCls));
          }
        }
        for (const s of g.body) {
          out.push(this.emitStatement(s, indent + 3));
        }
        this.scope.pop();
        out.push(`${pad}    }`);
      }
      first = false;
      groupIndex = groupIndex + 1;
    }
    if (defaultClause !== undefined) {
      const defaultCase = defaultClause;
      const head = first ? "if (1)" : "else";
      if (defaultCase.stmts.length === 0) {
        out.push(`${pad}    ${head} { break; }`);
      } else {
        out.push(`${pad}    ${head} {`);
        for (const s of defaultCase.stmts) {
          out.push(this.emitStatement(s, indent + 3));
        }
        out.push(`${pad}    }`);
      }
    }
    this.popLoopCtx();
    this.scope.pop();

    out.push(`${pad}  } while (0);`);
    out.push(`${pad}}`);
    return out.join("\n");
  }

  private checkContinueAllowed(stmt: ContinueStmt): void {
    // Phase 1.5-6e-2: Topaz nodes have no `.parent`, so consult the instance
    // `loopCtx` stack maintained while emitting. The top frame is the nearest
    // enclosing loop / switch (matching the old parent walk's nearest-first
    // semantics).
    const stmtAnchor: { pos: number } = { pos: stmt.pos };
    const top = this.loopCtx;
    if (top === undefined) {
      throw new CodegenError(stmtAnchor, "`continue` outside of a loop");
    }
    if (top.kind === "switch") {
      throw new CodegenError(
        stmtAnchor,
        "`continue` inside `switch` is unsupported (switch lowers to do/while(0))",
      );
    }
  }

  private emitExpression(expr: Expr): string {
    if (expr.kind === "num_lit") {
      const t = expr.text;
      return hasDecimalOrExponent(t) ? t : `${t}.0`;
    }
    if (expr.kind === "bool_lit") return expr.value ? "true" : "false";
    if (expr.kind === "null_lit") {
      throw new CodegenError({ pos: expr.pos }, "unsupported expression (null_lit)");
    }
    if (expr.kind === "this_expr") {
      const currentClass = this.currentClass;
      if (currentClass === undefined) {
        throw new CodegenError(
          { pos: expr.pos },
          "`this` is only valid inside class methods or constructors",
        );
      }
      return TOPAZ_THIS;
    }
    if (expr.kind === "str_lit") {
      return this.emitStringLiteralText(expr.value, { pos: expr.pos });
    }
    if (expr.kind === "template_lit") {
      return this.emitTemplateExpression(expr);
    }
    if (expr.kind === "import_meta_url") {
      // Phase 1.5-6e-2: `import.meta.url` lowers to the runtime helper that
      // resolves the running executable path as a `file://` URL.
      return `topaz_runtime_module_url()`;
    }
    if (expr.kind === "ident") {
      // Phase 1.5-3.5e: inside an arrow body, lookup is barriered. If the
      // identifier resolves only via captureContext, rewrite the read to go
      // through the env struct.
      const local = this.scope.lookup(expr.name);
      const captureContext = this.captureContext;
      if (local === undefined) {
        if (captureContext !== undefined) {
          if (captureContext.captures.has(expr.name)) {
            const envType = captureContext.envType;
            return `(((${envType} *)__topaz_env)->${expr.name})`;
          }
        }
      }
      const b = local;
      if (b === undefined) {
        const sig = this.resolveFunctionSig(expr.name, { pos: expr.pos });
        if (sig !== undefined) return this.emitTopLevelFunctionValue(sig);
        throw new CodegenError({ pos: expr.pos }, `unknown identifier '${expr.name}'`);
      }
      // Phase 1.5-3c: when the binding's C representation is the scalar opt
      // struct (`topaz_opt_<scalar>`) but narrowing has stripped the
      // `undefined` variant, reads must reach through `.value`. Reference /
      // interface T | undefined share T's C type, so no accessor is needed.
      const baseMaybe = this.scope.lookupBase(expr.name);
      if (baseMaybe === undefined) {
        throw new CodegenError({ pos: expr.pos }, `identifier '${expr.name}' has no base binding`);
      }
      const base = baseMaybe;
      if (isScalarOptUnion(base.type) && !typeEq(base.type, b.type)) {
        return `(${expr.name}).value`;
      }
      // Phase 1.5-3e: narrowed dunion -> class. The fat struct's `data` slot
      // holds the underlying class instance pointer; cast it back to the
      // concrete class type for downstream uses.
      // Phase 1.5-6 prep #15: also fire when base is `dunion | undefined`
      // (after an `!== undefined` narrow followed by a switch narrow). The C
      // representation is still the dunion struct, so the `.data` cast works
      // identically.
      if (isClassType(b.type)) {
        const baseInner = base.type.kind === "union" ? withoutUndefined(base.type) : base.type;
        if (baseInner !== undefined) {
          if (baseInner.kind === "dunion") {
            const cname = classNameOf(b.type)!;
            return `((topaz_class_${cname} *)(${expr.name}).data)`;
          }
        }
      }
      // Phase 1.5-3f: narrowed unknown -> class. The base C type is `void *`
      // (the catch payload); cast to the concrete class pointer so field /
      // method access type-checks at the C level.
      if (base.type.kind === "unknown" && isClassType(b.type)) {
        const cname = classNameOf(b.type)!;
        return `((topaz_class_${cname} *)(${expr.name}))`;
      }
      return expr.name;
    }
    if (expr.kind === "paren_expr") {
      return `(${this.emitExpression(expr.inner)})`;
    }
    // Phase 1.5-3.5e: arrow expressions in non-contextual positions need
    // explicit param + return annotations (no expected type to source them
    // from). emitWithExpected provides the contextual path with an expected
    // fn type for the four assignment sites.
    if (expr.kind === "arrow_expr") {
      return this.emitArrowFunction(expr, undefined);
    }
    if (expr.kind === "prop_access" && expr.optional) {
      return this.emitOptionalPropertyAccess(expr);
    }
    if (expr.kind === "elem_access" && expr.optional) {
      return this.emitOptionalElementAccess(expr);
    }
    // Phase 1.5-6 prep #26: `process.argv` -> Array<string>. The `process`
    // identifier is synthetic (no real binding), so short-circuit before
    // inferType(expr.receiver) would trip on "unknown identifier". Other
    // `process.<member>` value reads are rejected (exit / stdout / stderr are
    // call-only).
    if (expr.kind === "prop_access") {
      const receiver = expr.receiver;
      if (receiver.kind === "ident") {
        if (receiver.name === "process") {
          if (expr.name === "argv") {
            return `topaz_process_argv()`;
          }
          throw new CodegenError(
            { pos: expr.pos },
            `unsupported \`process.${expr.name}\` as a value (only \`process.argv\`; \`process.exit\` / \`process.stdout.write\` / \`process.stderr.write\` are call-only)`,
          );
        }
      }
    }
    if (expr.kind === "prop_access") {
      const exprAnchor: { pos: number } = { pos: expr.pos };
      const baseType = this.inferType(expr.receiver);
      // Phase 1.5-3e: `dunion.kind` reads the discriminator string from the
      // fat struct. inferType already enforced that only the discriminator
      // field is accessible.
      if (baseType.kind === "dunion") {
        if (expr.name === baseType.discriminator) {
          return `((${this.emitExpression(expr.receiver)}).${baseType.discriminator})`;
        }
        // Phase 1.5-6 prep #18: common-field read — dispatch on the variant
        // tag (offset 0 of every class struct) and cast `.data` to the
        // matching variant before reading the field. inferType validated it.
        return this.emitDunionCommonFieldAccess(expr, baseType);
      }
      if (baseType.kind === "string" && expr.name === "length") {
        return `((topaz_number)(${this.emitExpression(expr.receiver)}).len)`;
      }
      if (isArrayType(baseType) && expr.name === "length") {
        return `((topaz_number)(${this.emitExpression(expr.receiver)})->len)`;
      }
      if ((isMapType(baseType) || isSetType(baseType)) && expr.name === "size") {
        return `((topaz_number)(${this.emitExpression(expr.receiver)})->size)`;
      }
      if (isClassType(baseType)) {
        const cls = this.classes.get(classNameOf(baseType)!)!;
        if (cls.fields.has(expr.name)) {
          return `((${this.emitExpression(expr.receiver)})->${expr.name})`;
        }
        if (cls.methods.has(expr.name)) {
          throw new CodegenError(
            exprAnchor,
            `method '${expr.name}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          exprAnchor,
          `class '${cls.name}' has no member '${expr.name}'`,
        );
      }
      if (isInterfaceType(baseType)) {
        const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
        const fname = expr.name;
        if (iface.fields.has(fname)) {
          const id = this.tmpCounter++;
          const tmp = `__topaz_ib_${id}`;
          const baseStr = this.emitExpression(expr.receiver);
          return `({ ${cTypeName(baseType)} ${tmp} = ${baseStr}; ${tmp}.vt->get_${fname}(${tmp}.data); })`;
        }
        if (iface.methods.has(fname)) {
          throw new CodegenError(
            exprAnchor,
            `method '${fname}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          exprAnchor,
          `interface '${iface.name}' has no member '${fname}'`,
        );
      }
      throw new CodegenError(
        exprAnchor,
        `unsupported property access '.${expr.name}' on ${typeIdent(baseType)}`,
      );
    }
    if (expr.kind === "elem_access") {
      const baseType = this.inferType(expr.receiver);
      const elem = arrayElem(baseType);
      if (elem === undefined) {
        const exprAnchor: { pos: number } = { pos: expr.pos };
        throw new CodegenError(exprAnchor, `index access is only supported on Array (got ${typeIdent(baseType)})`);
      }
      this.expectType(expr.index, T_NUMBER);
      const name = arrayShortName(baseType);
      return `topaz_array_${name}_at(${this.emitExpression(expr.receiver)}, ${this.emitExpression(expr.index)})`;
    }
    if (expr.kind === "array_lit") {
      return this.emitArrayLiteral(expr, /* expected */ undefined);
    }
    if (expr.kind === "non_null") {
      // Phase 1.5-3.5c: stmt-expression around a single evaluation of the
      // operand, runtime check on the sentinel slot, then yield the unwrapped
      // value. Scalar T | undefined uses the `topaz_opt_<scalar>` struct
      // (.present / .value); reference T uses NULL pointer sentinel; iface T
      // uses fat-pointer .data == NULL sentinel.
      const inner = this.inferType(expr.operand); // verifies T | undefined
      const stripped = withoutUndefined(inner)!;
      const valStr = this.emitExpression(expr.operand);
      const id = this.tmpCounter++;
      const tmp = `__topaz_nn_${id}`;
      const ct = cTypeName(inner);
      const panic = `fputs("topaz: non-null assertion failed\\n", stderr); abort();`;
      if (isScalarType(stripped)) {
        return `({ ${ct} ${tmp} = ${valStr}; if (!${tmp}.present) { ${panic} } ${tmp}.value; })`;
      }
      // Phase 1.5-6 prep #15: dunion shares iface's `.data == NULL` sentinel.
      if (isInterfaceType(stripped) || stripped.kind === "dunion") {
        return `({ ${ct} ${tmp} = ${valStr}; if (${tmp}.data == NULL) { ${panic} } ${tmp}; })`;
      }
      return `({ ${ct} ${tmp} = ${valStr}; if (${tmp} == NULL) { ${panic} } ${tmp}; })`;
    }
    if (expr.kind === "prefix_op") {
      this.inferType(expr); // type-check
      const op = this.prefixOp(expr);
      return `(${op}${this.emitExpression(expr.operand)})`;
    }
    if (expr.kind === "postfix_op") {
      this.inferType(expr);
      const op = this.postfixOp(expr);
      return `(${this.emitExpression(expr.operand)}${op})`;
    }
    if (expr.kind === "instanceof_expr") {
      // Phase 1.5-3f: `x instanceof ClassName` lowers to a tag-pointer
      // comparison. Every class struct carries `__topaz_class_tag` at offset
      // 0, set by the constructor to a per-class sentinel address; the check
      // dereferences the void* payload through that field.
      this.inferType(expr); // type-check
      const rhs = expr.rhs;
      let rhsName: string | undefined = undefined;
      if (rhs.kind === "ident") {
        rhsName = rhs.name;
      }
      if (rhsName === undefined) {
        throw new CodegenError({ pos: rhs.pos }, "`instanceof` right-hand side must be a concrete class name");
      }
      const cls = rhsName;
      const id = this.tmpCounter++;
      const tmp = `__topaz_io_${id}`;
      const left = this.emitExpression(expr.lhs);
      return `({ void *${tmp} = (void *)(${left}); ${tmp} != NULL && *((const char * const *)${tmp}) == &topaz_class_${cls}_tag; })`;
    }
    if (expr.kind === "assign_expr") {
      const op = expr.op;
      const assignAnchor: { pos: number } = { pos: expr.pos };
      // Phase 1.5-6 prep #11: object literal RHS has no standalone type, so
      // the generic inferType(expr) pre-check below would recurse into the
      // literal and throw. Route plain assignment with an object-literal RHS
      // through emitWithExpected with the LHS type up-front, which fires the
      // anon-class / dunion contextual narrowing.
      if (op === "=" && expr.value.kind === "object_lit") {
        this.checkAssignTarget(expr.target, assignAnchor);
        const lt = this.inferType(expr.target);
        const lhsStr = this.emitExpression(expr.target);
        const rhsStr = this.emitWithExpected(expr.value, lt);
        return `(${lhsStr} = ${rhsStr})`;
      }
      this.inferType(expr); // type-check + const-check
      // Element-access assignment lowers to topaz_array_X_set; compound
      // assignment on a[i] is unsupported because we'd evaluate the index twice.
      const assignTarget = expr.target;
      if (assignTarget.kind === "elem_access") {
        const target = assignTarget;
        if (op !== "=") {
          throw new CodegenError(assignAnchor, "compound assignment on array element is unsupported; use a[i] = ...");
        }
        const baseType = this.inferType(target.receiver);
        const name = arrayShortName(baseType);
        const elem = arrayElem(baseType);
        if (elem === undefined) {
          throw new CodegenError(assignAnchor, "internal error: validated array assignment target missing element type");
        }
        const base = this.emitExpression(target.receiver);
        const idx = this.emitExpression(target.index);
        // Use emitWithExpected so class -> interface coercion fires when the
        // array is Array<Interface> and the RHS is a class instance.
        const val = this.emitWithExpected(expr.value, elem);
        return `topaz_array_${name}_set(${base}, ${idx}, ${val})`;
      }
      // Interface property assignment goes through the vtable's setter; no
      // C lvalue exists for the underlying field. Compound forms would need
      // to evaluate the base twice, so reject them.
      if (assignTarget.kind === "prop_access") {
        const target = assignTarget;
        const baseT = this.inferType(target.receiver);
        if (isInterfaceType(baseT)) {
          if (op !== "=") {
            throw new CodegenError(
              assignAnchor,
              "compound assignment on interface field is unsupported; use iface.field = ...",
            );
          }
          const iname = interfaceNameOf(baseT);
          if (iname === undefined) {
            throw new CodegenError(assignAnchor, "internal error: validated interface assignment target missing interface name");
          }
          const iface = this.interfaces.get(iname);
          if (iface === undefined) {
            throw new CodegenError(assignAnchor, `internal error: interface '${iname}' not registered`);
          }
          const fname = target.name;
          const ftype = iface.fields.get(fname);
          if (ftype === undefined) {
            throw new CodegenError(assignAnchor, `internal error: validated interface assignment target missing field '${fname}'`);
          }
          const id = this.tmpCounter++;
          const tmp = `__topaz_ib_${id}`;
          const baseStr = this.emitExpression(target.receiver);
          const rhsStr = this.emitWithExpected(expr.value, ftype);
          // The vtable setter returns void, so this expression's value is
          // void. Chained assignment (`x = (iface.field = v)`) is therefore
          // unsupported — acceptable for now since it's a rare pattern.
          return `({ ${cTypeName(baseT)} ${tmp} = ${baseStr}; ${tmp}.vt->set_${fname}(${tmp}.data, ${rhsStr}); })`;
        }
      }
      // Plain assignment with rhs coercion (covers `let a: Shape = ...; a = new Circle(...)`
      // as well as `obj.field = new Circle(...)` when field is an interface).
      if (op === "=") {
        const lt = this.inferType(expr.target);
        const rt = this.inferType(expr.value);
        if (!typeEq(lt, rt) && this.isAssignableTo(rt, lt)) {
          const lhsStr = this.emitExpression(expr.target);
          const rhsStr = this.emitWithExpected(expr.value, lt);
          return `(${lhsStr} = ${rhsStr})`;
        }
      }
      if (op === "%=") {
        const lhs = this.emitExpression(expr.target);
        return `(${lhs} = topaz_fmod(${lhs}, ${this.emitExpression(expr.value)}))`;
      }
      if (op === "+=" && this.inferType(expr.target).kind === "string") {
        const lhs = this.emitExpression(expr.target);
        return `(${lhs} = topaz_string_concat(${lhs}, ${this.emitExpression(expr.value)}))`;
      }
      const cop = this.assignOp(expr);
      const lhs = this.emitExpression(expr.target);
      const rhs = this.emitExpression(expr.value);
      return `(${lhs} ${cop} ${rhs})`;
    }
    if (expr.kind === "bin_op") {
      const tok = expr.op;
      this.inferType(expr); // type-check + const-check
      // JS `%` is fmod for number; C's `%` rejects double, so always lower.
      if (tok === "%") {
        return `topaz_fmod(${this.emitExpression(expr.lhs)}, ${this.emitExpression(expr.rhs)})`;
      }
      if (tok === "+" && this.inferType(expr.lhs).kind === "string") {
        return `topaz_string_concat(${this.emitExpression(expr.lhs)}, ${this.emitExpression(expr.rhs)})`;
      }
      if (
        (tok === "===" || tok === "!==") &&
        this.inferType(expr.lhs).kind === "string"
      ) {
        const inner = `topaz_string_eq(${this.emitExpression(expr.lhs)}, ${this.emitExpression(expr.rhs)})`;
        return tok === "===" ? inner : `(!${inner})`;
      }
      // Phase 1.5-3.5c: `a ?? b` lowers to a stmt-expression that snapshots
      // `a` into a tmp, checks the sentinel slot, and yields either the
      // unwrapped value or the fallback `b`. inferType has already verified
      // that `a: T | undefined` and `b` is either T (result T) or T |
      // undefined (result T | undefined, for `a ?? b ?? c` chaining). For
      // scalar T, when the result is T | undefined we keep the whole opt
      // struct so the C ternary's branches share a type; reference / iface
      // T have the same C representation either way, so no branch needed.
      if (tok === "??") {
        const lt = this.inferType(expr.lhs);
        const inner = withoutUndefined(lt)!;
        const rt = this.inferType(expr.rhs);
        const rhsIsOptional = !this.isAssignableTo(rt, inner) && this.isAssignableTo(rt, lt);
        const expected = rhsIsOptional ? lt : inner;
        const lhsStr = this.emitExpression(expr.lhs);
        const rhsStr = this.emitWithExpected(expr.rhs, expected);
        const id = this.tmpCounter++;
        const tmp = `__topaz_nc_${id}`;
        const lct = cTypeName(lt);
        if (isScalarType(inner)) {
          const presentBranch = rhsIsOptional ? tmp : `${tmp}.value`;
          return `({ ${lct} ${tmp} = ${lhsStr}; ${tmp}.present ? ${presentBranch} : (${rhsStr}); })`;
        }
        // Phase 1.5-6 prep #15: dunion shares iface's `.data == NULL` sentinel.
        if (isInterfaceType(inner) || inner.kind === "dunion") {
          return `({ ${lct} ${tmp} = ${lhsStr}; ${tmp}.data != NULL ? ${tmp} : (${rhsStr}); })`;
        }
        return `({ ${lct} ${tmp} = ${lhsStr}; ${tmp} != NULL ? ${tmp} : (${rhsStr}); })`;
      }
      // Phase 1.5-3b: `x === undefined` / `x !== undefined` on `T | undefined`.
      // For interface | undefined the fat pointer's .data is the sentinel;
      // for reference T | undefined the pointer itself is.
      // Phase 1.5-3c: scalar `T | undefined` is an opt struct whose `.present`
      // bit carries the sentinel — `x === undefined` lowers to
      // `.present == false`. The check only fires on unnarrowed values
      // (narrowing strips the undefined variant first, after which the
      // typesOverlap guard in inferType rejects the comparison), so
      // emitExpression on an identifier always yields the bare struct.
      if (tok === "===" || tok === "!==") {
        const leftIsUndef = expr.lhs.kind === "undefined_lit";
        const rightIsUndef = expr.rhs.kind === "undefined_lit";
        if (leftIsUndef !== rightIsUndef) {
          const valueExpr = leftIsUndef ? expr.rhs : expr.lhs;
          const t = this.inferType(valueExpr);
          const inner = withoutUndefined(t);
          const op = tok === "===" ? "==" : "!=";
          const valStr = this.emitExpression(valueExpr);
          if (inner && isScalarType(inner)) {
            const want = tok === "===" ? "false" : "true";
            return `${valStr}.present == ${want}`;
          }
          // Phase 1.5-6 prep #15: dunion uses the same fat-struct shape as
          // iface; `.data == NULL` distinguishes the absent sentinel from any
          // wrapped variant (variant ctors always store a non-NULL class ptr).
          if (inner && (isInterfaceType(inner) || inner.kind === "dunion")) {
            return `${valStr}.data ${op} NULL`;
          }
          return `${valStr} ${op} NULL`;
        }
      }
      // Phase 1.5-6 prep #19: emit `&&` / `||` with compound-condition
      // narrowing. The right operand is emitted under the narrowing implied by
      // the left (positive for `&&`, negative for `||`) so a dunion narrowed by
      // `x.kind === "lit"` on the left is accessible on the right. inferType
      // (above) already type-checked the right under the same narrowing.
      if (tok === "&&" || tok === "||") {
        const polarity = tok === "&&";
        const lhs = this.emitExpression(expr.lhs);
        const n = this.extractNarrowing(expr.lhs, polarity);
        let rhs: string;
        if (n) {
          this.scope.push();
          try {
            this.scope.narrow(n.name, n.type);
            rhs = this.emitExpression(expr.rhs);
          } finally {
            this.scope.pop();
          }
        } else {
          rhs = this.emitExpression(expr.rhs);
        }
        return `(${lhs} ${polarity ? "&&" : "||"} ${rhs})`;
      }
      const op = this.binaryOp(expr);
      const lhs = this.emitExpression(expr.lhs);
      const rhs = this.emitExpression(expr.rhs);
      // `==` / `!=` carry the same precedence in C as `===` / `!==` in TS, and
      // TS precedence guarantees an equality is never an unparenthesized
      // operand of a higher-precedence op (explicit source parens arrive as a
      // ParenthesizedExpression and re-wrap at the paren branch). So the outer
      // parens the generic wrap would add are always redundant for equality —
      // dropping them avoids clang's -Wparentheses-equality on `if ((a == b))`
      // (the operands keep their own wraps, so nested forms stay correct).
      if (op === "==" || op === "!=") return `${lhs} ${op} ${rhs}`;
      return `(${lhs} ${op} ${rhs})`;
    }
    if (expr.kind === "call_expr") {
      return this.emitCall(expr);
    }
    if (expr.kind === "new_expr") {
      return this.emitNewExpression(expr, /* expected */ undefined);
    }
    if (expr.kind === "ternary_expr") {
      return this.emitConditional(expr, /* expected */ undefined);
    }
    unsupported(expr, "expression");
  }

  // Phase 1.5-6 prep #25: run `fn` with `n`'s narrowing installed on a fresh
  // scope frame (no-op when `n` is undefined). Mirrors the push / narrow / pop
  // dance the `if` / `&&` / `||` handlers do, factored out so the ternary's
  // two branches can each be inferred / emitted under the polarity-correct
  // narrowing read off the condition.
  private underNarrowingString(
    n: { name: string; type: TopazType } | undefined,
    fn: () => string,
  ): string {
    if (!n) return fn();
    this.scope.push();
    try {
      this.scope.narrow(n.name, n.type);
      return fn();
    } finally {
      this.scope.pop();
    }
  }

  private underNarrowingType(
    n: { name: string; type: TopazType } | undefined,
    fn: () => TopazType,
  ): TopazType {
    if (!n) return fn();
    this.scope.push();
    try {
      this.scope.narrow(n.name, n.type);
      return fn();
    } finally {
      this.scope.pop();
    }
  }

  // Phase 1.5-6 prep #25: conditional (ternary) `cond ? a : b`. The condition
  // is strict boolean (same divergence as `if` / `while`). Each branch is
  // emitted under the narrowing the condition implies (positive for the true
  // arm, negative for the false arm), so `x !== undefined ? x.f : ...` reads
  // the narrowed `x` — the same `extractNarrowing` path `if` uses. Both arms go
  // through `emitWithExpected(_, target)` so they coerce to one shared C type
  // (the C ternary requires both operands type-compatible); `target` is the
  // contextual expected type when present, else the common branch type.
  private emitConditional(
    expr: TernaryExpr,
    expected: TopazType | undefined,
  ): string {
    this.expectType(expr.cond, T_BOOLEAN);
    const nTrue = this.extractNarrowing(expr.cond, true);
    const nFalse = this.extractNarrowing(expr.cond, false);
    const cond = this.emitExpression(expr.cond);
    const target = expected ?? this.conditionalResultType(expr, nTrue, nFalse);
    const a = this.underNarrowingString(nTrue, () => this.emitWithExpected(expr.thenBranch, target));
    const b = this.underNarrowingString(nFalse, () => this.emitWithExpected(expr.elseBranch, target));
    return `(${cond} ? (${a}) : (${b}))`;
  }

  // Phase 1.5-6 prep #25: the result type of a ternary with no contextual
  // expected type. If the branches share a type (or one is assignable to the
  // other — class -> interface / class -> dunion / dunion widening) the wider
  // wins; a bare-`undefined` branch lifts the other to `T | undefined`. Two
  // genuinely unrelated types are rejected (annotate the target to pick one) —
  // we never synthesize an arbitrary multi-member union (unsupported type).
  private conditionalResultType(
    expr: TernaryExpr,
    nTrue: { name: string; type: TopazType } | undefined,
    nFalse: { name: string; type: TopazType } | undefined,
  ): TopazType {
    const tt = this.underNarrowingType(nTrue, () => this.inferType(expr.thenBranch));
    const tf = this.underNarrowingType(nFalse, () => this.inferType(expr.elseBranch));
    if (typeEq(tt, tf)) return tt;
    if (this.isAssignableTo(tf, tt)) return tt;
    if (this.isAssignableTo(tt, tf)) return tf;
    if (tt.kind === "undefined") return makeUnion([tf, T_UNDEFINED]);
    if (tf.kind === "undefined") return makeUnion([tt, T_UNDEFINED]);
    throw new CodegenError(
      expr,
      `conditional (?:) branches have incompatible types: ${typeIdent(tt)} vs ${typeIdent(tf)} (annotate the target to pick one)`,
    );
  }

  private emitArrayLiteral(
    expr: ArrayLitExpr,
    expected: TopazType | undefined,
  ): string {
    // Phase 1.5-3.5h-spread: spread (`...x`) is allowed when the source is an
    // Array<T> whose elem type matches the destination's elem type EXACTLY.
    // Set / Iterator sources stay rejected here (tracked in future sub-steps).
    // Holes in array literals are rejected in convert.
    let hasSpread = false;
    for (const elem of expr.elems) {
      if (elem.kind === "spread") {
        hasSpread = true;
        break;
      }
    }
    let arrType: TopazType;
    if (expr.elems.length === 0) {
      if (!expected || !isArrayType(expected)) {
        throw new CodegenError(
          expr,
          "cannot infer element type of empty array literal; add an `Array<T>` annotation",
        );
      }
      arrType = expected;
    } else if (expected && isArrayType(expected)) {
      // With a known expected Array<T>, use T as the element type so each
      // fixed element can coerce to it (class -> interface). Spread sources
      // still require EXACT elem match (no per-element coercion through spread).
      arrType = expected;
    } else {
      // Infer from the first element: spread -> source's elem, fixed -> its type.
      const first = expr.elems[0]!;
      let elem: TopazType;
      if (first.kind === "spread") {
        const srcType = this.inferType(first.expr);
        if (!isArrayType(srcType)) {
          throw new CodegenError(
            first.expr,
            `spread source in array literal must be an Array<T>, got ${typeIdent(srcType)}`,
          );
        }
        elem = arrayElem(srcType)!;
      } else {
        elem = this.inferType(first.expr);
      }
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(expr, `no Array monomorph for element type ${typeIdent(elem)}`);
      }
      arrType = arr;
      this.recordArrayMonomorph(arrType);
    }
    const elemType = arrayElem(arrType)!;
    const name = arrayShortName(arrType);
    const id = this.tmpCounter++;
    const tmp = `__topaz_arr_${id}`;
    // GCC/clang statement-expression: build, fill, yield the pointer.
    const parts: string[] = [];
    parts.push(`topaz_array_${name} *${tmp} = topaz_array_${name}_new();`);
    if (!hasSpread) {
      if (expr.elems.length > 0) {
        parts.push(`topaz_array_${name}_reserve(${tmp}, ${expr.elems.length});`);
      }
      for (const e of expr.elems) {
        parts.push(`topaz_array_${name}_push(${tmp}, ${this.emitWithExpected(e.expr, elemType)});`);
      }
    } else {
      // Snapshot every spread source first so the reserve sum / push loop see
      // a stable .len and .data, and each source expression evaluates once.
      const spreadTmps: string[] = [];
      const fixedCount = expr.elems.filter((e) => e.kind !== "spread").length;
      for (const e of expr.elems) {
        if (e.kind !== "spread") continue;
        const srcType = this.inferType(e.expr);
        if (!isArrayType(srcType)) {
          throw new CodegenError(
            e.expr,
            `spread source in array literal must be an Array<T>, got ${typeIdent(srcType)}`,
          );
        }
        const srcElem = arrayElem(srcType)!;
        if (!typeEq(srcElem, elemType)) {
          throw new CodegenError(
            e.expr,
            `spread element type ${typeIdent(srcElem)} does not match destination element type ${typeIdent(elemType)}`,
          );
        }
        const spId = this.tmpCounter++;
        const spTmp = `__topaz_sp_${spId}`;
        const spName = arrayShortName(srcType);
        parts.push(`topaz_array_${spName} *${spTmp} = ${this.emitExpression(e.expr)};`);
        spreadTmps.push(spTmp);
      }
      const reserveSum = [String(fixedCount), ...spreadTmps.map((t) => `${t}->len`)].join(" + ");
      parts.push(`topaz_array_${name}_reserve(${tmp}, ${reserveSum});`);
      let spIdx = 0;
      for (const e of expr.elems) {
        if (e.kind === "spread") {
          const spTmp = spreadTmps[spIdx++]!;
          const iterId = this.tmpCounter++;
          const iVar = `__topaz_si_${iterId}`;
          parts.push(
            `for (size_t ${iVar} = 0; ${iVar} < ${spTmp}->len; ${iVar}++) topaz_array_${name}_push(${tmp}, ${spTmp}->data[${iVar}]);`,
          );
        } else {
          parts.push(`topaz_array_${name}_push(${tmp}, ${this.emitWithExpected(e.expr, elemType)});`);
        }
      }
    }
    return `({ ${parts.join(" ")} ${tmp}; })`;
  }

  private emitNewExpression(
    expr: NewExpr,
    expected: TopazType | undefined,
  ): string {
    if (expr.callee.kind !== "ident") {
      throw new CodegenError(expr, "only `new Map<K, V>()`, `new Set<T>()`, and class instantiation are supported");
    }
    // Phase 1.5-3.5h-spread: same positional-arguments invariant as emitCall.
    for (const a of expr.args) {
      if (a.kind === "spread_expr") {
        throw new CodegenError(
          a,
          "spread in `new` arguments is unsupported",
        );
      }
    }
    const name = expr.callee.name;
    if (name === "Array") {
      throw new CodegenError(
        expr,
        "use array literal syntax (`[...]` or `[]`) instead of `new Array()`",
      );
    }
    if (name === "Map" && expr.args.length > 0) {
      throw new CodegenError(
        expr,
        "Map() constructor arguments are unsupported",
      );
    }
    if (name === "Map") {
      let mapType: TopazType;
      if (expr.typeArgs.length === 2) {
        const k = this.typeFromAnnotation(expr.typeArgs[0]!, expr, g_currentModule!);
        const v = this.typeFromAnnotation(expr.typeArgs[1]!, expr, g_currentModule!);
        const t = mapOf(k, v);
        if (!t) {
          throw new CodegenError(expr, `no Map monomorph for key=${typeIdent(k)}, value=${typeIdent(v)}`);
        }
        if (expected && !typeEq(expected, t)) {
          throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(t)}`);
        }
        mapType = t;
      } else if (expr.typeArgs.length !== 0) {
        throw new CodegenError(expr, "Map<K, V> requires exactly two type arguments");
      } else {
        if (!expected || !isMapType(expected)) {
          throw new CodegenError(
            expr,
            "cannot infer Map type arguments; write `new Map<K, V>()` or annotate the binding",
          );
        }
        mapType = expected;
      }
      this.recordMapMonomorph(mapType);
      return `topaz_map_${mapShortName(mapType)}_new()`;
    }
    if (name === "Set") {
      const setType = this.resolveSetConstructorType(expr, expected);
      if (expr.args.length === 0) {
        return `topaz_set_${setShortName(setType)}_new()`;
      }
      return this.emitSetIterableConstructor(expr, setType);
    }
    if (this.interfaces.has(name)) {
      throw new CodegenError(expr, `cannot \`new\` an interface '${name}'; instantiate an implementing class instead`);
    }
    // Phase 1.4c-3: `new Box<number>()` mangles to the substituted class
    // name and dispatches through the same path as concrete classes.
    let className = name;
    if (this.genericClasses.has(name)) {
      const t = this.instantiateGenericClass(name, expr.typeArgs, expr, g_currentModule!);
      className = classNameOf(t)!;
    } else if (expr.typeArgs.length > 0) {
      if (this.classes.has(name)) {
        throw new CodegenError(expr, `class '${name}' takes no type arguments`);
      }
    }
    if (this.classes.has(className)) {
      const cls = this.classes.get(className)!;
      const args = expr.args;
      const t = classOf(className);
      // Class -> interface coercion happens at the caller's site (the
      // surrounding emitWithExpected); here we only need to confirm the new
      // expression isn't being asked to produce a different concrete type.
      if (expected && !typeEq(expected, t) && !this.isAssignableTo(t, expected)) {
        throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(t)}`);
      }
      if (!cls.ctor) {
        // Reachable only when a class has no fields (we require a ctor when
        // fields exist), so this is a structurally empty class.
        if (args.length !== 0) {
          throw new CodegenError(expr, `${cls.name}() takes no arguments`);
        }
        return `topaz_class_${className}_new()`;
      }
      const params = cls.ctor.params;
      const argStr = this.emitCallArgs(args, params, `${cls.name}()`, expr).join(", ");
      return `topaz_class_${className}_new(${argStr})`;
    }
    throw new CodegenError(expr, `\`new ${name}\` is unsupported`);
  }

  private setConstructorSourceType(source: Expr, elem: TopazType): TopazType {
    const sourceType = this.inferType(source);
    let sourceElem: TopazType | undefined = undefined;
    if (isArrayType(sourceType)) {
      sourceElem = arrayElem(sourceType);
    } else if (isSetType(sourceType)) {
      sourceElem = setElem(sourceType);
    } else if (sourceType.kind === "iter") {
      sourceElem = sourceType.elem;
    }
    if (sourceElem === undefined) {
      throw new CodegenError(
        source,
        `Set() constructor source must be an Array<T>, Set<T>, or Iterator<T> (got ${typeIdent(sourceType)})`,
      );
    }
    if (!typeEq(sourceElem, elem)) {
      throw new CodegenError(
        source,
        `Set() constructor element type mismatch: expected ${typeIdent(elem)}, got ${typeIdent(sourceElem)}`,
      );
    }
    return sourceType;
  }

  private resolveSetConstructorType(
    expr: NewExpr,
    expected: TopazType | undefined,
  ): TopazType {
    if (expr.args.length > 1) {
      throw new CodegenError(expr, "Set() constructor expects at most one argument");
    }

    let setType: TopazType;
    if (expr.typeArgs.length === 1) {
      const elem = this.typeFromAnnotation(expr.typeArgs[0]!, expr, g_currentModule!);
      const t = setOf(elem);
      if (!t) {
        throw new CodegenError(expr, `no Set monomorph for element type ${typeIdent(elem)}`);
      }
      if (expected && !typeEq(expected, t)) {
        throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(t)}`);
      }
      setType = t;
    } else if (expr.typeArgs.length !== 0) {
      throw new CodegenError(expr, "Set<T> requires exactly one type argument");
    } else {
      if (!expected || !isSetType(expected)) {
        throw new CodegenError(
          expr,
          "cannot infer Set type argument; write `new Set<T>()` or annotate the binding",
        );
      }
      setType = expected;
    }

    const elem = setElem(setType)!;
    if (expr.args.length === 1) {
      this.setConstructorSourceType(expr.args[0]!, elem);
    }
    this.recordSetMonomorph(setType);
    return setType;
  }

  private emitSetIterableConstructor(
    expr: NewExpr,
    setType: TopazType,
  ): string {
    const source = expr.args[0]!;
    const elem = setElem(setType)!;
    const sourceType = this.setConstructorSourceType(source, elem);
    const setName = setShortName(setType);
    const setCType = cTypeName(setType);
    const elemCType = cTypeName(elem);
    const sourceCType = cTypeName(sourceType);
    const id = this.tmpCounter++;
    const setTmp = `__topaz_set_ctor_${id}`;
    const sourceTmp = `__topaz_set_src_${id}`;
    const idxTmp = `__topaz_set_idx_${id}`;
    const valTmp = `__topaz_set_val_${id}`;
    const doneTmp = `__topaz_set_done_${id}`;
    const sourceExpr = this.emitExpression(source);

    if (isArrayType(sourceType)) {
      this.recordArrayMonomorph(sourceType);
      return `({ ${setCType} ${setTmp} = topaz_set_${setName}_new(); ${sourceCType} ${sourceTmp} = ${sourceExpr}; for (size_t ${idxTmp} = 0; ${idxTmp} < ${sourceTmp}->len; ${idxTmp}++) { topaz_set_${setName}_add(${setTmp}, ${sourceTmp}->data[${idxTmp}]); } ${setTmp}; })`;
    }

    if (isSetType(sourceType)) {
      this.recordSetMonomorph(sourceType);
      return `({ ${setCType} ${setTmp} = topaz_set_${setName}_new(); ${sourceCType} ${sourceTmp} = ${sourceExpr}; for (size_t ${idxTmp} = 0; ${idxTmp} < ${sourceTmp}->cap; ${idxTmp}++) { if (${sourceTmp}->slots[${idxTmp}].state != TOPAZ_HASH_SLOT_OCCUPIED) continue; topaz_set_${setName}_add(${setTmp}, ${sourceTmp}->slots[${idxTmp}].key); } ${setTmp}; })`;
    }

    if (sourceType.kind === "iter") {
      return `({ ${setCType} ${setTmp} = topaz_set_${setName}_new(); ${sourceCType} ${sourceTmp} = ${sourceExpr}; for (;;) { bool ${doneTmp} = false; ${elemCType} ${valTmp} = ${sourceTmp}.next(${sourceTmp}.state, &${doneTmp}); if (${doneTmp}) break; topaz_set_${setName}_add(${setTmp}, ${valTmp}); } ${setTmp}; })`;
    }

    throwInternalCodegenError("emitSetIterableConstructor: unexpected validated source type");
  }

  // Phase 1.5-6e-2: core string-literal encoder. Takes the cooked JS string and
  // a Topaz anchor `{ pos }` for the non-ASCII error. Called for `str_lit`
  // values, `template_lit` heads, and each `template_sub.cookedAfter`.
  private emitStringLiteralText(cooked: string, anchor: { pos: number }): string {
    let escaped = '"';
    let byteLen = 0;
    for (let i = 0; i < cooked.length; i++) {
      const c = cooked.charCodeAt(i);
      if (c >= 0x80) {
        throw new CodegenError(
          anchor,
          "non-ASCII characters in string literals are unsupported (UTF-16 length divergence)",
        );
      }
      if (c === 0x22) escaped += '\\"';
      else if (c === 0x5c) escaped += "\\\\";
      else if (c === 0x0a) escaped += "\\n";
      else if (c === 0x0d) escaped += "\\r";
      else if (c === 0x09) escaped += "\\t";
      else if (c === 0x00) escaped += "\\0";
      else if (c < 0x20 || c === 0x7f) {
        escaped += `\\x${lowerHexByte2(c)}`;
      } else {
        escaped += String.fromCharCode(c);
      }
      byteLen++;
    }
    escaped += '"';
    return `((topaz_string){ ${escaped}, ${byteLen} })`;
  }

  // Phase 1.5-3.5: template literal -> left-associative `topaz_string_concat`
  // chain. ${} substitutions go through `topaz_number_to_string` /
  // `topaz_boolean_to_string` / identity (for string) so that arena alloc cost
  // matches the leak budget we already absorb for `+` on string operands.
  // Empty literal fragments (e.g. between adjacent `${a}${b}`) are skipped so
  // we don't burn one arena alloc per gap. A no-substitution template
  // (`template_lit` with empty subs) yields the head as a plain string literal,
  // matching the pre-migration NoSubstitutionTemplateLiteral path.
  private emitTemplateExpression(expr: TemplateLitExpr): string {
    const stringify = (sub: Expr): string => {
      const t = this.inferType(sub);
      const inner = this.emitExpression(sub);
      if (t.kind === "string") return inner;
      if (t.kind === "number") return `topaz_number_to_string(${inner})`;
      if (t.kind === "boolean") return `topaz_boolean_to_string(${inner})`;
      // inferType's TemplateLit branch already vets each span; this arm is
      // defensive in case stringify gets reused later.
      throw new CodegenError(
        sub,
        `template literal substitution must be number / boolean / string, got ${typeIdent(t)}`,
      );
    };

    let acc: string | undefined = undefined;
    const append = (piece: string): void => {
      acc = acc === undefined ? piece : `topaz_string_concat(${acc}, ${piece})`;
    };

    if (expr.head !== "") append(this.emitStringLiteralText(expr.head, expr));
    for (const sub of expr.subs) {
      append(stringify(sub.expr));
      if (sub.cookedAfter !== "") append(this.emitStringLiteralText(sub.cookedAfter, expr));
    }
    // All-empty template (`${a}` with empty head + empty tail) still needs to
    // yield a `topaz_string` value; fall back to the first substitution which
    // is already stringified.
    if (acc === undefined) {
      // Unreachable: templateSpans is non-empty for TemplateExpression and
      // we've already appended at least one stringified span above. Defensive
      // return keeps the type signature honest.
      return `((topaz_string){ "", 0 })`;
    }
    return acc;
  }

  private prefixOp(expr: PrefixOpExpr): string {
    switch (expr.op) {
      case "-": return "-";
      case "+": return "+";
      case "!": return "!";
      case "++": return "++";
      case "--": return "--";
      default: unsupported(expr, "prefix unary operator");
    }
  }

  private postfixOp(expr: PostfixOpExpr): string {
    switch (expr.op) {
      case "++": return "++";
      case "--": return "--";
      default: unsupported(expr, "postfix unary operator");
    }
  }

  // Phase 1.5-6e-2: compound assignment operators ("=", "+=", "-=", "*=", "/=";
  // "%=" and string "+=" are handled before reaching here). Mirrors the
  // pre-migration binaryOp's assignment cases.
  private assignOp(expr: AssignExpr): string {
    switch (expr.op) {
      case "=": return "=";
      case "+=": return "+=";
      case "-=": return "-=";
      case "*=": return "*=";
      case "/=": return "/=";
      case "%=": return "%=";
      default:
        unsupported(expr, "assignment operator");
    }
  }

  private binaryOp(expr: BinOpExpr): string {
    switch (expr.op) {
      case "+": return "+";
      case "-": return "-";
      case "*": return "*";
      case "/": return "/";
      case "%": return "%";
      case "<": return "<";
      case "<=": return "<=";
      case ">": return ">";
      case ">=": return ">=";
      case "===": return "==";
      case "!==": return "!=";
      case "&&": return "&&";
      case "||": return "||";
      case "==":
      case "!=":
        throw new CodegenError(expr, "loose equality (== / !=) is unsupported; use === / !==");
      default:
        unsupported(expr, "binary operator");
    }
  }

  private checkConsoleCallArgs(expr: CallExpr, method: string): void {
    if (expr.args.length !== 1) {
      throw new CodegenError({ pos: expr.pos }, `console.${method} expects exactly one argument`);
    }
    const arg = expr.args[0];
    const t = this.inferType(arg);
    if (t.kind === "undefined" || t.kind === "union") {
      throw new CodegenError(
        arg,
        `console.${method} on ${typeIdent(t)} is unsupported (narrow it with \`if (x !== undefined)\` first)`,
      );
    }
    if (t.kind === "unknown") {
      throw new CodegenError(
        arg,
        `console.${method} on \`unknown\` is unsupported (narrow it with \`if (x instanceof ClassName)\` first)`,
      );
    }
    if (isReferenceType(t) || isInterfaceType(t)) {
      throw new CodegenError(arg, `console.${method} on ${typeIdent(t)} is unsupported`);
    }
  }

  private emitCall(expr: CallExpr): string {
    const callee = expr.callee;

    // Phase 1.5-3.5d: optional method call `a?.b()`. The `?.` sits on the inner
    // property access; the call itself is regular. `a?.()` (optional call) is
    // rejected separately below.
    if (callee.kind === "prop_access" && callee.optional) {
      return this.emitOptionalMethodCall(expr, callee);
    }
    if (expr.optional) {
      throw new CodegenError(
        expr,
        "optional call `f?.()` is unsupported (only `a?.b`, `a?.b()`, and `a?.[i]` are supported)",
      );
    }
    // Phase 1.5-3.5h-spread: spread in call arguments is rejected up-front so
    // every downstream callee can iterate `expr.args` positionally. Spread in
    // array literals is supported separately by emitArrayLiteral.
    for (const a of expr.args) {
      if (a.kind === "spread_expr") {
        throw new CodegenError(
          a,
          "spread in call arguments is unsupported (rewrite as a loop, e.g. `for (const x of xs) f(x)`)",
        );
      }
    }

    if (
      callee.kind === "prop_access" &&
      callee.receiver.kind === "ident" &&
      callee.receiver.name === "console" &&
      // Phase 1.5-6 prep #26: console.error shares console.log's one-argument
      // scalar lowering, differing only in the runtime stream (stderr).
      (callee.name === "log" || callee.name === "error")
    ) {
      const method = callee.name;
      this.checkConsoleCallArgs(expr, method);
      const arg = expr.args[0]!;
      const t = this.inferType(arg);
      const family = method === "log" ? "log" : "error";
      const fn =
        t.kind === "boolean" ? `topaz_console_${family}_boolean`
        : t.kind === "string" ? `topaz_console_${family}_string`
        : `topaz_console_${family}_number`;
      return `${fn}(${this.emitExpression(arg)})`;
    }

    // Phase 1.5-6 prep #26: process.exit(code?) -> never. Lowered to the
    // runtime exit wrapper; arity 0 defaults to 0 (Node's default code). The
    // `process` identifier is synthetic (no real binding), same model as
    // `console` above.
    if (
      callee.kind === "prop_access" &&
      callee.receiver.kind === "ident" &&
      callee.receiver.name === "process" &&
      callee.name === "exit"
    ) {
      return this.emitProcessExit(expr);
    }

    // Phase 1.5-6 prep #26: process.stdout.write(s) / process.stderr.write(s)
    // -> void. Recognized syntactically (the `process.stdout` receiver is never
    // evaluated as a value).
    if (
      callee.kind === "prop_access" &&
      callee.receiver.kind === "prop_access" &&
      callee.receiver.receiver.kind === "ident" &&
      callee.receiver.receiver.name === "process" &&
      (callee.receiver.name === "stdout" || callee.receiver.name === "stderr") &&
      callee.name === "write"
    ) {
      return this.emitProcessStreamWrite(expr, callee.receiver.name);
    }

    // Phase 1.5-6 prep #12: `String.fromCharCode(n)` is recognized
    // syntactically (the `String` identifier is not a real binding — we don't
    // model a `String` global namespace, only this single static method).
    if (
      callee.kind === "prop_access" &&
      callee.receiver.kind === "ident" &&
      callee.receiver.name === "String"
    ) {
      return this.emitStringStaticCall(expr, callee);
    }

    if (callee.kind === "prop_access") {
      const baseType = this.inferType(callee.receiver);
      if (isArrayType(baseType)) {
        return this.emitArrayMethodCall(expr, callee, baseType);
      }
      if (isMapType(baseType)) {
        return this.emitMapMethodCall(expr, callee, baseType);
      }
      if (isSetType(baseType)) {
        return this.emitSetMethodCall(expr, callee, baseType);
      }
      if (baseType.kind === "string") {
        return this.emitStringMethodCall(expr, callee);
      }
      if (isClassType(baseType)) {
        return this.emitClassMethodCall(expr, callee, baseType);
      }
      if (isInterfaceType(baseType)) {
        return this.emitInterfaceMethodCall(expr, callee, baseType);
      }
      throw new CodegenError(callee, `unsupported method '.${callee.name}' on ${typeIdent(baseType)}`);
    }

    if (callee.kind === "ident") {
      // Phase 1.5-6 prep #13: `readFileSync(path, "utf8")` の syntactic
      // shortcut。loader 側で `node:fs` specifier を受理し、`readFileSync`
      // 識別子は scope に登録されない (String.fromCharCode と同方針)。
      // bare 利用 (`let f = readFileSync;`) は scope lookup が「unknown
      // identifier」で fall するので、ここの call-site 経路だけ受理する。
      if (callee.name === "readFileSync") {
        return this.emitNodeFsReadFileSync(expr);
      }
      // Phase 1.5-6 prep #17: `existsSync(path)` -> bool, same syntactic
      // shortcut path as readFileSync (loader accepts the `node:fs` specifier).
      if (callee.name === "existsSync") {
        return this.emitNodeFsExistsSync(expr);
      }
      // Phase 1.5-6 prep #19: `writeFileSync(path, content)` -> void, same
      // syntactic shortcut path as readFileSync. Encoding is implicit utf8.
      if (callee.name === "writeFileSync") {
        return this.emitNodeFsWriteFileSync(expr);
      }
      // Phase 1.5-6 prep #20: `mkdirSync(path, { recursive: true })` -> void.
      // Recursive-only: the options literal is the only accepted second arg.
      if (callee.name === "mkdirSync") {
        return this.emitNodeFsMkdirSync(expr);
      }
      // Phase 1.5-6 prep #18: node:path.dirname / resolve, same call-site
      // shortcut (loader accepts the `node:path` specifier). bare value use
      // falls to "unknown identifier" like the node:fs builtins.
      if (callee.name === "dirname") {
        return this.emitNodePathDirname(expr);
      }
      if (callee.name === "resolve") {
        return this.emitNodePathResolve(expr);
      }
      // Phase 1.5-6 prep #21: node:path.basename(p, ext?), same call-site
      // shortcut. arity 1/2 dispatch to distinct runtime entries.
      if (callee.name === "basename") {
        return this.emitNodePathBasename(expr);
      }
      // Phase 1.5-6 prep #22: node:path.extname(p), same call-site shortcut.
      if (callee.name === "extname") {
        return this.emitNodePathExtname(expr);
      }
      // Phase 1.5-6 prep #23: node:path.join(...segments) は variadic + posix
      // normalize。resolve と同じ variadic lowering で `topaz_path_join(n,
      // seg0, seg1, ...)` に降ろす。
      if (callee.name === "join") {
        return this.emitNodePathJoin(expr);
      }
      // Phase 1.5-6 prep #24: node:child_process.execFileSync(cmd, args,
      // { stdio: "inherit" }) -> void。stdio inherit 固定の call-site shortcut。
      if (callee.name === "execFileSync") {
        return this.emitNodeChildProcessExecFileSync(expr);
      }
      // Phase 1.5-6 prep #25: node:url.fileURLToPath(url) -> string。
      // `file://...` URL を local path に変換するだけの 1 引数 string 関数。
      if (callee.name === "fileURLToPath") {
        return this.emitNodeUrlFileURLToPath(expr);
      }
      // Phase 1.5-6 prep #16: global parseInt(s, radix) / parseFloat(s). Like
      // String.fromCharCode / readFileSync these are recognized only at the
      // call site — `let f = parseInt;` still falls to "unknown identifier".
      if (callee.name === "parseInt") {
        return this.emitParseInt(expr);
      }
      if (callee.name === "parseFloat") {
        return this.emitParseFloat(expr);
      }
      if (this.genericFunctions.has(callee.name)) {
        const resolved = this.resolveGenericCall(callee, expr)!;
        const args = this.emitCallArgs(
          expr.args,
          resolved.sig.params,
          `${callee.name}()`,
          expr,
        ).join(", ");
        return `${resolved.mangled}(${args})`;
      }
      const sig = this.resolveFunctionSig(callee.name, callee);
      if (sig) {
        const args = this.emitCallArgs(expr.args, sig.params, `${callee.name}()`, expr).join(", ");
        return `${sig.cName}(${args})`;
      }
      // Phase 1.5-3.5e: fn-typed local (a binding holding an arrow / fn
      // value). Resolve the fn type from the scope (or captureContext) and
      // dispatch through the fat pointer.
      const calleeType = this.inferType(callee);
      if (calleeType.kind === "fn") {
        return this.emitFnValueCall(expr, callee, calleeType);
      }
      throw new CodegenError(callee, `unknown function '${callee.name}'`);
    }

    // Phase 1.5-3.5e: any other expression that types as a fn value (e.g.
    // `obj.callback()` once class fields can hold fn values, or parenthesized
    // arrow IIFE `((n) => n + 1)(42)`). For 1.5-3.5e we only support the
    // identifier path and parenthesized arrow IIFEs.
    const calleeType = this.inferType(callee);
    if (calleeType.kind === "fn") {
      return this.emitFnValueCall(expr, callee, calleeType);
    }

    unsupported(callee, "call target");
  }

  // Phase 1.5-3.5e: lower a call `f(args)` where `f` types as a fn fat
  // pointer. The dispatch is `({ <fn type> __t = f; __t.fn(__t.env, args); })`
  // so the callee is evaluated once even when it's a complex expression.
  private emitFnValueCall(
    expr: CallExpr,
    callee: Expr,
    fnType: TopazType,
  ): string {
    if (fnType.kind === "fn") {
      const fnValueType = fnType;
      if (expr.args.length !== fnValueType.params.length) {
        throw new CodegenError(
          expr,
          `fn value expects ${fnValueType.params.length} argument(s), got ${expr.args.length}`,
        );
      }
      const argParts: string[] = [];
      for (let i = 0; i < expr.args.length; i++) {
        const a = expr.args[i];
        const p = fnValueType.params[i];
        argParts.push(this.emitWithExpected(a, p.type));
      }
      const args = argParts.join(", ");
      const tmp = `__topaz_fc_${this.tmpCounter++}`;
      const calleeStr = this.emitExpression(callee);
      const fnTypeName = typeIdent(fnValueType);
      const callArgs = args.length > 0 ? `${tmp}.env, ${args}` : `${tmp}.env`;
      return `({ ${fnTypeName} ${tmp} = ${calleeStr}; ${tmp}.fn(${callArgs}); })`;
    }
    throwInternalCodegenError("emitFnValueCall: not fn");
  }

  // Phase 1.5-6 prep: lower an IIFE `(arrow)(args)` where the arrow has no
  // return annotation, using the call-site `expected` type as the arrow's
  // contextual return type. Params come from the inferred argument types
  // (annotated arrow params override them, mirroring inferArrowType /
  // emitArrowFunction), so an unannotated `() => { ... }` block body emits its
  // returns coerced to `expected`. Dispatch reuses the same fat-pointer call
  // form as emitFnValueCall (callee evaluated once into a temp).
  private emitContextualIIFE(
    expr: CallExpr,
    arrow: ArrowExpr,
    expected: TopazType,
  ): string {
    for (const a of expr.args) {
      if (a.kind === "spread_expr") {
        throw new CodegenError(a, "spread in call arguments is unsupported");
      }
    }
    const expectedFn: TopazType = {
      kind: "fn",
      params: expr.args.map((a, i) => ({
        name: `__p${i}`,
        type: this.inferType(a),
        isOptional: false,
      })),
      returnType: expected,
    };
    const fnType = this.inferArrowType(arrow, expectedFn);
    if (fnType.kind === "fn") {
      const fnValueType = fnType;
      const arrowStr = this.emitArrowFunction(arrow, expectedFn);
      const argParts: string[] = [];
      for (let i = 0; i < expr.args.length; i++) {
        const a = expr.args[i];
        const p = fnValueType.params[i];
        argParts.push(this.emitWithExpected(a, p.type));
      }
      const args = argParts.join(", ");
      const tmp = `__topaz_fc_${this.tmpCounter++}`;
      const fnTypeName = typeIdent(fnValueType);
      const callArgs = args.length > 0 ? `${tmp}.env, ${args}` : `${tmp}.env`;
      return `({ ${fnTypeName} ${tmp} = ${arrowStr}; ${tmp}.fn(${callArgs}); })`;
    }
    throwInternalCodegenError("emitContextualIIFE: not fn");
  }

  private emitArrayMethodCall(
    expr: CallExpr,
    callee: PropAccessExpr,
    baseType: TopazType,
  ): string {
    const name = arrayShortName(baseType);
    const elem = arrayElem(baseType)!;
    const method = callee.name;
    const base = this.emitExpression(callee.receiver);
    if (method === "push") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "Array.push expects exactly one argument");
      }
      return `topaz_array_${name}_push(${base}, ${this.emitWithExpected(expr.args[0]!, elem)})`;
    }
    if (method === "pop") {
      if (expr.args.length !== 0) {
        throw new CodegenError(expr, "Array.pop expects no arguments");
      }
      return `topaz_array_${name}_pop(${base})`;
    }
    if (method === "map") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "Array.map expects exactly one argument");
      }
      const cb = expr.args[0]!;
      const fnType = this.inferCallbackFn(cb, [elem], "Array.map");
      const u = fnType.returnType;
      if (u.kind === "void") {
        throw new CodegenError(cb, "Array.map callback cannot return `void` (no Array<void> monomorph)");
      }
      // The result Array<U> reuses the same monomorph machinery as any other
      // container. undefined / union element types still lack a monomorph;
      // fn return type is now accepted (Array<fn> uses the post-fn-typedef
      // slot — see recordArrayMonomorph for fn-elem routing).
      if (u.kind === "undefined" || (u.kind === "union" && containsUndefined(u))) {
        throw new CodegenError(
          cb,
          `Array.map callback returning ${typeIdent(u)} is unsupported (no Array<T | undefined> monomorph)`,
        );
      }
      const result = arrayOf(u);
      if (!result) {
        throw new CodegenError(expr, `Array.map: cannot form Array<${typeIdent(u)}> result`);
      }
      this.recordArrayMonomorph(result);
      this.recordFnMonomorph(fnType);
      const cbStr = this.emitWithExpected(cb, fnType);
      const dstShort = arrayShortName(result);
      const srcTy = cTypeName(baseType);
      const dstTy = cTypeName(result);
      const fnTy = typeIdent(fnType);
      const id = this.tmpCounter++;
      const srcVar = `__topaz_map_src_${id}`;
      const cbVar = `__topaz_map_cb_${id}`;
      const dstVar = `__topaz_map_dst_${id}`;
      const idxVar = `__topaz_map_i_${id}`;
      const callArgs = `${cbVar}.env, ${srcVar}->data[${idxVar}]`;
      return (
        `({ ${srcTy} ${srcVar} = ${base}; ` +
        `${fnTy} ${cbVar} = ${cbStr}; ` +
        `${dstTy} ${dstVar} = topaz_array_${dstShort}_new(); ` +
        `topaz_array_${dstShort}_reserve(${dstVar}, ${srcVar}->len); ` +
        `for (size_t ${idxVar} = 0; ${idxVar} < ${srcVar}->len; ${idxVar}++) { ` +
        `topaz_array_${dstShort}_push(${dstVar}, ${cbVar}.fn(${callArgs})); ` +
        `} ${dstVar}; })`
      );
    }
    if (method === "slice") {
      if (expr.args.length > 2) {
        throw new CodegenError(expr, "Array.slice expects at most two arguments");
      }
      // Type-check each present argument as `number` up-front so the error
      // surfaces here rather than as a cryptic C compile error inside the
      // stmt-expression.
      for (const arg of expr.args) {
        const at = this.inferType(arg);
        if (at.kind !== "number") {
          throw new CodegenError(
            arg,
            `Array.slice argument must be number, got ${typeIdent(at)}`,
          );
        }
      }
      const startExpr = expr.args.length >= 1
        ? `(double)(${this.emitWithExpected(expr.args[0]!, T_NUMBER)})`
        : "(double)NAN";
      const endExpr = expr.args.length >= 2
        ? `(double)(${this.emitWithExpected(expr.args[1]!, T_NUMBER)})`
        : "(double)NAN";
      const id = this.tmpCounter++;
      const srcVar = `__topaz_slice_src_${id}`;
      const rawStartVar = `__topaz_slice_rs_${id}`;
      const rawEndVar = `__topaz_slice_re_${id}`;
      const lenVar = `__topaz_slice_len_${id}`;
      const loVar = `__topaz_slice_lo_${id}`;
      const hiVar = `__topaz_slice_hi_${id}`;
      const dstVar = `__topaz_slice_dst_${id}`;
      const idxVar = `__topaz_slice_i_${id}`;
      const srcTy = cTypeName(baseType);
      return (
        `({ ${srcTy} ${srcVar} = ${base}; ` +
        `double ${rawStartVar} = ${startExpr}; ` +
        `double ${rawEndVar} = ${endExpr}; ` +
        `size_t ${lenVar} = ${srcVar}->len; ` +
        `size_t ${loVar} = topaz_slice_normalize(${rawStartVar}, ${lenVar}, 0); ` +
        `size_t ${hiVar} = topaz_slice_normalize(${rawEndVar}, ${lenVar}, ${lenVar}); ` +
        `if (${hiVar} < ${loVar}) ${hiVar} = ${loVar}; ` +
        `${srcTy} ${dstVar} = topaz_array_${name}_new(); ` +
        `topaz_array_${name}_reserve(${dstVar}, ${hiVar} - ${loVar}); ` +
        `for (size_t ${idxVar} = ${loVar}; ${idxVar} < ${hiVar}; ${idxVar}++) { ` +
        `topaz_array_${name}_push(${dstVar}, ${srcVar}->data[${idxVar}]); ` +
        `} ${dstVar}; })`
      );
    }
    if (method === "includes") {
      if (expr.args.length === 0) {
        throw new CodegenError(expr, "Array.includes expects exactly one argument");
      }
      if (expr.args.length > 1) {
        // Second `fromIndex` argument is unsupported (would need to negative-
        // index normalize via topaz_slice_normalize, which is not yet wired
        // up — defer to 1.5-3.5f-slice).
        throw new CodegenError(expr, "Array.includes `fromIndex` argument is unsupported");
      }
      // `target` must match elem exactly. emitWithExpected handles class -> iface
      // coercion automatically when elem is an interface.
      const tStr = this.emitWithExpected(expr.args[0]!, elem);
      const id = this.tmpCounter++;
      const srcVar = `__topaz_inc_src_${id}`;
      const tVar = `__topaz_inc_t_${id}`;
      const rVar = `__topaz_inc_r_${id}`;
      const idxVar = `__topaz_inc_i_${id}`;
      const srcTy = cTypeName(baseType);
      const elemTy = cTypeName(elem);
      const lhs = `${srcVar}->data[${idxVar}]`;
      // SameValueZero comparison: NaN === NaN for number (matches Map/Set
      // key equality), strict byte compare for string, scalar `==` for
      // boolean, reference identity for class (pointer compare) and iface
      // (fat pointer .data compare).
      let eqExpr: string;
      if (elem.kind === "number") {
        eqExpr = `((${lhs}) == (${tVar})) || ((${lhs}) != (${lhs}) && (${tVar}) != (${tVar}))`;
      } else if (elem.kind === "boolean") {
        eqExpr = `(${lhs}) == (${tVar})`;
      } else if (elem.kind === "string") {
        eqExpr = `topaz_string_eq((${lhs}), (${tVar}))`;
      } else if (isClassType(elem)) {
        eqExpr = `(${lhs}) == (${tVar})`;
      } else if (isInterfaceType(elem)) {
        eqExpr = `((${lhs}).data) == ((${tVar}).data)`;
      } else {
        throw new CodegenError(
          expr,
          `Array.includes is unsupported for element type ${typeIdent(elem)}`,
        );
      }
      return (
        `({ ${srcTy} ${srcVar} = ${base}; ` +
        `${elemTy} ${tVar} = ${tStr}; ` +
        `bool ${rVar} = false; ` +
        `for (size_t ${idxVar} = 0; ${idxVar} < ${srcVar}->len; ${idxVar}++) { ` +
        `if (${eqExpr}) { ${rVar} = true; break; } ` +
        `} ${rVar}; })`
      );
    }
    if (method === "filter") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "Array.filter expects exactly one argument");
      }
      const cb = expr.args[0]!;
      const fnType = this.inferCallbackFn(cb, [elem], "Array.filter");
      // Strict boolean — JS truthy/falsy coercion is not adopted (consistent
      // with `if` / `while` condition strictness).
      if (fnType.returnType.kind !== "boolean") {
        throw new CodegenError(
          cb,
          `Array.filter callback must return boolean, got ${typeIdent(fnType.returnType)}`,
        );
      }
      this.recordFnMonomorph(fnType);
      const cbStr = this.emitWithExpected(cb, fnType);
      const srcTy = cTypeName(baseType);
      const fnTy = typeIdent(fnType);
      const elemTy = cTypeName(elem);
      const id = this.tmpCounter++;
      const srcVar = `__topaz_filter_src_${id}`;
      const cbVar = `__topaz_filter_cb_${id}`;
      const dstVar = `__topaz_filter_dst_${id}`;
      const idxVar = `__topaz_filter_i_${id}`;
      const eVar = `__topaz_filter_e_${id}`;
      return (
        `({ ${srcTy} ${srcVar} = ${base}; ` +
        `${fnTy} ${cbVar} = ${cbStr}; ` +
        `${srcTy} ${dstVar} = topaz_array_${name}_new(); ` +
        `for (size_t ${idxVar} = 0; ${idxVar} < ${srcVar}->len; ${idxVar}++) { ` +
        `${elemTy} ${eVar} = ${srcVar}->data[${idxVar}]; ` +
        `if (${cbVar}.fn(${cbVar}.env, ${eVar})) topaz_array_${name}_push(${dstVar}, ${eVar}); ` +
        `} ${dstVar}; })`
      );
    }
    if (method === "join") {
      if (expr.args.length > 1) {
        throw new CodegenError(expr, "Array.join expects at most one argument");
      }
      // Elem type is restricted to scalar 3 (number / boolean / string).
      // class / iface / nested container / fn / optional / union: format
      // policy is undefined, reject up-front (user can `.map(x => ...)` to
      // a string array first).
      if (elem.kind !== "number" && elem.kind !== "boolean" && elem.kind !== "string") {
        throw new CodegenError(
          expr,
          `Array.join is unsupported for element type ${typeIdent(elem)}; only scalar (number / boolean / string) elements are supported`,
        );
      }
      // Separator must be `string`. Missing → default ",".
      let sepStr: string;
      if (expr.args.length === 1) {
        const sepType = this.inferType(expr.args[0]!);
        if (sepType.kind !== "string") {
          throw new CodegenError(
            expr.args[0]!,
            `Array.join separator must be string, got ${typeIdent(sepType)}`,
          );
        }
        sepStr = this.emitWithExpected(expr.args[0]!, T_STRING);
      } else {
        // `","` static literal as a `topaz_string` compound literal.
        sepStr = `((topaz_string){ ",", 1 })`;
      }
      this.recordArrayJoinMonomorph(baseType);
      return `topaz_array_${name}_join(${base}, ${sepStr})`;
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on ${typeIdent(baseType)}`);
  }

  // Phase 1.5-6 prep #10/#6f/#6i: String.prototype.charCodeAt / .slice /
  // .repeat / .trimStart / .startsWith / .endsWith. Arguments are exact Topaz
  // types (no JS coercion).
  // Missing slice args lower to `(double)NAN` so topaz_slice_normalize picks
  // the default. startsWith / endsWith intentionally accept only search.
  private emitStringMethodCall(
    expr: CallExpr,
    callee: PropAccessExpr,
  ): string {
    const method = callee.name;
    const base = this.emitExpression(callee.receiver);
    if (method === "charCodeAt") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "String.charCodeAt expects exactly one argument");
      }
      const argType = this.inferType(expr.args[0]!);
      if (argType.kind !== "number") {
        throw new CodegenError(
          expr.args[0]!,
          `String.charCodeAt argument must be number, got ${typeIdent(argType)}`,
        );
      }
      const idx = this.emitWithExpected(expr.args[0]!, T_NUMBER);
      return `topaz_string_char_code_at(${base}, ${idx})`;
    }
    if (method === "slice") {
      if (expr.args.length > 2) {
        throw new CodegenError(expr, "String.slice expects at most two arguments");
      }
      for (const arg of expr.args) {
        const at = this.inferType(arg);
        if (at.kind !== "number") {
          throw new CodegenError(
            arg,
            `String.slice argument must be number, got ${typeIdent(at)}`,
          );
        }
      }
      const startExpr = expr.args.length >= 1
        ? `(double)(${this.emitWithExpected(expr.args[0]!, T_NUMBER)})`
        : "(double)NAN";
      const endExpr = expr.args.length >= 2
        ? `(double)(${this.emitWithExpected(expr.args[1]!, T_NUMBER)})`
        : "(double)NAN";
      return `topaz_string_slice(${base}, ${startExpr}, ${endExpr})`;
    }
    if (method === "repeat") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "String.repeat expects exactly one argument");
      }
      const countArg = expr.args[0];
      if (countArg === undefined) {
        throw new CodegenError(expr, "String.repeat expects exactly one argument");
      }
      const countType = this.inferType(countArg);
      if (countType.kind !== "number") {
        throw new CodegenError(
          countArg,
          `String.repeat argument must be number, got ${typeIdent(countType)}`,
        );
      }
      const count = this.emitWithExpected(countArg, T_NUMBER);
      return `topaz_string_repeat(${base}, ${count})`;
    }
    if (method === "trimStart") {
      if (expr.args.length !== 0) {
        throw new CodegenError(expr, "String.trimStart expects no arguments");
      }
      return `topaz_string_trim_start(${base})`;
    }
    if (method === "startsWith" || method === "endsWith") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, `String.${method} expects exactly one argument`);
      }
      const argType = this.inferType(expr.args[0]!);
      if (argType.kind !== "string") {
        throw new CodegenError(
          expr.args[0]!,
          `String.${method} argument must be string, got ${typeIdent(argType)}`,
        );
      }
      const search = this.emitWithExpected(expr.args[0]!, T_STRING);
      return `topaz_string_${method === "startsWith" ? "starts_with" : "ends_with"}(${base}, ${search})`;
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on topaz_string`);
  }

  // Phase 1.5-6 prep #12: only `String.fromCharCode(n)` is supported; we
  // intentionally do not introduce a real `String` namespace binding. The
  // single-arg ASCII contract matches src/lexer.ts's `\xNN` escape decoder.
  private emitStringStaticCall(
    expr: CallExpr,
    callee: PropAccessExpr,
  ): string {
    const method = callee.name;
    if (method !== "fromCharCode") {
      throw new CodegenError(
        callee,
        `unsupported static method 'String.${method}' (only 'String.fromCharCode' is supported)`,
      );
    }
    if (expr.args.length !== 1) {
      throw new CodegenError(expr, "String.fromCharCode expects exactly one argument");
    }
    const argType = this.inferType(expr.args[0]!);
    if (argType.kind !== "number") {
      throw new CodegenError(
        expr.args[0]!,
        `String.fromCharCode argument must be number, got ${typeIdent(argType)}`,
      );
    }
    const code = this.emitWithExpected(expr.args[0]!, T_NUMBER);
    return `topaz_string_from_char_code(${code})`;
  }

  private inferStringStaticReturn(
    expr: CallExpr,
    callee: PropAccessExpr,
  ): TopazType {
    const method = callee.name;
    if (method !== "fromCharCode") {
      throw new CodegenError(
        callee,
        `unsupported static method 'String.${method}' (only 'String.fromCharCode' is supported)`,
      );
    }
    if (expr.args.length !== 1) {
      throw new CodegenError(expr, "String.fromCharCode expects exactly one argument");
    }
    const argType = this.inferType(expr.args[0]!);
    if (argType.kind !== "number") {
      throw new CodegenError(
        expr.args[0]!,
        `String.fromCharCode argument must be number, got ${typeIdent(argType)}`,
      );
    }
    return T_STRING;
  }

  // Phase 1.5-6 prep #13: `readFileSync(path, "utf8")` の引数検査。
  // 第 2 引数は `"utf8"` 限定 (binary 読み出しを Topaz は今のところ要らない、
  // それでも encoding argument を必須化することで「buffer 戻り value」が誤って
  // string 経路に乗ることを防ぐ)。
  private checkNodeFsReadFileSyncArgs(expr: CallExpr): void {
    if (expr.args.length !== 2) {
      throw new CodegenError(
        expr,
        "readFileSync expects exactly two arguments: (path: string, encoding: \"utf8\")",
      );
    }
    const pathArg = expr.args[0]!;
    const pathType = this.inferType(pathArg);
    if (pathType.kind !== "string") {
      throw new CodegenError(
        pathArg,
        `readFileSync path argument must be string, got ${typeIdent(pathType)}`,
      );
    }
    const encArg = expr.args[1]!;
    const enc = stringLitText(encArg);
    if (enc === undefined) {
      throw new CodegenError(
        encArg,
        "readFileSync encoding argument must be the string literal \"utf8\"",
      );
    }
    if (enc !== "utf8") {
      throw new CodegenError(
        encArg,
        `readFileSync encoding argument must be "utf8" (got "${enc}")`,
      );
    }
  }

  private emitNodeFsReadFileSync(expr: CallExpr): string {
    this.checkNodeFsReadFileSyncArgs(expr);
    const path = this.emitWithExpected(expr.args[0]!, T_STRING);
    return `topaz_fs_read_text_file(${path})`;
  }

  // Phase 1.5-6 prep #17: `existsSync(path)` の引数検査。第 1 引数は string 一個
  // のみ (Node の options 第 2 引数は未対応)。emit/infer 両経路で同じ reject。
  private checkNodeFsExistsSyncArgs(expr: CallExpr): void {
    if (expr.args.length !== 1) {
      throw new CodegenError(
        expr,
        "existsSync expects exactly one argument: (path: string)",
      );
    }
    const pathArg = expr.args[0]!;
    const pathType = this.inferType(pathArg);
    if (pathType.kind !== "string") {
      throw new CodegenError(
        pathArg,
        `existsSync path argument must be string, got ${typeIdent(pathType)}`,
      );
    }
  }

  private emitNodeFsExistsSync(expr: CallExpr): string {
    this.checkNodeFsExistsSyncArgs(expr);
    const path = this.emitWithExpected(expr.args[0]!, T_STRING);
    return `topaz_fs_exists(${path})`;
  }

  // Phase 1.5-6 prep #19: `writeFileSync(path, content)` の引数検査。Node の
  // 3 引数目 (encoding/options) は受けない (encoding は implicit utf8)。両引数
  // 必須・string のみ。emit/infer 両経路で同じ reject。
  private checkNodeFsWriteFileSyncArgs(expr: CallExpr): void {
    if (expr.args.length !== 2) {
      throw new CodegenError(
        expr,
        "writeFileSync expects exactly two arguments: (path: string, content: string)",
      );
    }
    const pathArg = expr.args[0]!;
    const pathType = this.inferType(pathArg);
    if (pathType.kind !== "string") {
      throw new CodegenError(
        pathArg,
        `writeFileSync path argument must be string, got ${typeIdent(pathType)}`,
      );
    }
    const contentArg = expr.args[1]!;
    const contentType = this.inferType(contentArg);
    if (contentType.kind !== "string") {
      throw new CodegenError(
        contentArg,
        `writeFileSync content argument must be string, got ${typeIdent(contentType)}`,
      );
    }
  }

  private emitNodeFsWriteFileSync(expr: CallExpr): string {
    this.checkNodeFsWriteFileSyncArgs(expr);
    const path = this.emitWithExpected(expr.args[0]!, T_STRING);
    const content = this.emitWithExpected(expr.args[1]!, T_STRING);
    return `topaz_fs_write_text_file(${path}, ${content})`;
  }

  // Phase 1.5-6 prep #20: `mkdirSync(path, { recursive: true })` の引数検査。
  // recursive-only に固定する (非 recursive は Topaz では使い道が無い)。第2引数は
  // **必ず** `{ recursive: true }` の syntactic object literal でなければ
  // ならない — 変数や別 shape の options は受けない (runtime は常に recursive
  // mkdir を呼ぶので、call-site で「単純な誤読」を防ぐためにここで shape を
  // 固定する)。emit/infer 両経路で同じ reject。
  private checkNodeFsMkdirSyncArgs(expr: CallExpr): void {
    if (expr.args.length !== 2) {
      throw new CodegenError(
        expr,
        "mkdirSync expects exactly two arguments: (path: string, { recursive: true })",
      );
    }
    const pathArg = expr.args[0]!;
    const pathType = this.inferType(pathArg);
    if (pathType.kind !== "string") {
      throw new CodegenError(
        pathArg,
        `mkdirSync path argument must be string, got ${typeIdent(pathType)}`,
      );
    }
    const optsArg = expr.args[1]!;
    if (optsArg.kind !== "object_lit") {
      throw new CodegenError(
        optsArg,
        "mkdirSync options argument must be the literal { recursive: true }",
      );
    }
    if (optsArg.props.length !== 1) {
      throw new CodegenError(
        optsArg,
        "mkdirSync options literal must contain exactly one property: { recursive: true }",
      );
    }
    const prop = optsArg.props[0]!;
    if (prop.kind !== "prop_kv" || prop.name !== "recursive") {
      throw new CodegenError(
        prop,
        "mkdirSync options property must be `recursive: true`",
      );
    }
    if (prop.value.kind !== "bool_lit" || prop.value.value !== true) {
      throw new CodegenError(
        prop.value,
        "mkdirSync `recursive` must be the literal `true`",
      );
    }
  }

  private emitNodeFsMkdirSync(expr: CallExpr): string {
    this.checkNodeFsMkdirSyncArgs(expr);
    const path = this.emitWithExpected(expr.args[0]!, T_STRING);
    return `topaz_fs_mkdir_p(${path})`;
  }

  // Phase 1.5-6 prep #24: `execFileSync(cmd, args, { stdio: "inherit" })` の
  // 引数検査。Node の `execFileSync(file, args, options)` の 3 引数形に固定し、
  // stdio は inherit のみ受理(child の stdout/stderr/stdin が親 fd を共有)。
  // mkdirSync と同じく options は syntactic object literal で `stdio: "inherit"`
  // 1 property だけ。emit/infer 両経路で同じ reject。
  private checkNodeChildProcessExecFileSyncArgs(expr: CallExpr): void {
    if (expr.args.length !== 3) {
      throw new CodegenError(
        expr,
        "execFileSync expects exactly three arguments: (cmd: string, args: string[], { stdio: \"inherit\" })",
      );
    }
    const cmdArg = expr.args[0]!;
    const cmdType = this.inferType(cmdArg);
    if (cmdType.kind !== "string") {
      throw new CodegenError(
        cmdArg,
        `execFileSync cmd argument must be string, got ${typeIdent(cmdType)}`,
      );
    }
    const argsArg = expr.args[1]!;
    const argsType = this.inferType(argsArg);
    const expectedArgs = arrayOf(T_STRING)!;
    if (!typeEq(argsType, expectedArgs)) {
      throw new CodegenError(
        argsArg,
        `execFileSync args argument must be Array<string>, got ${typeIdent(argsType)}`,
      );
    }
    const optsArg = expr.args[2]!;
    if (optsArg.kind !== "object_lit") {
      throw new CodegenError(
        optsArg,
        "execFileSync options argument must be the literal { stdio: \"inherit\" }",
      );
    }
    if (optsArg.props.length !== 1) {
      throw new CodegenError(
        optsArg,
        "execFileSync options literal must contain exactly one property: { stdio: \"inherit\" }",
      );
    }
    const prop = optsArg.props[0]!;
    if (prop.kind !== "prop_kv" || prop.name !== "stdio") {
      throw new CodegenError(
        prop,
        "execFileSync options property must be `stdio: \"inherit\"`",
      );
    }
    const init = prop.value;
    const initLit = stringLitText(init);
    if (initLit !== "inherit") {
      throw new CodegenError(
        init,
        "execFileSync `stdio` must be the string literal \"inherit\"",
      );
    }
  }

  private emitNodeChildProcessExecFileSync(expr: CallExpr): string {
    this.checkNodeChildProcessExecFileSyncArgs(expr);
    const expectedArgs = arrayOf(T_STRING)!;
    this.recordArrayMonomorph(expectedArgs);
    const cmd = this.emitWithExpected(expr.args[0]!, T_STRING);
    const args = this.emitWithExpected(expr.args[1]!, expectedArgs);
    return `topaz_child_exec_inherit(${cmd}, ${args})`;
  }

  // Phase 1.5-6 prep #25: node:url.fileURLToPath(url) -> string。
  // `file://...` URL の path 部分(scheme + 空 host を剥がす)+ percent-decode
  // して local path を返す 1 引数 string 関数。Node の fileURLToPath は
  // posix と win32 で挙動が分かれるが、self-hosting の実行環境は POSIX 限定で
  // 構築するので POSIX 寄りに固定。
  private checkNodeUrlFileURLToPathArgs(expr: CallExpr): void {
    if (expr.args.length !== 1) {
      throw new CodegenError(
        expr,
        "fileURLToPath expects exactly one argument: (url: string)",
      );
    }
    const urlArg = expr.args[0]!;
    const urlType = this.inferType(urlArg);
    if (urlType.kind !== "string") {
      throw new CodegenError(
        urlArg,
        `fileURLToPath argument must be string, got ${typeIdent(urlType)}`,
      );
    }
  }

  private emitNodeUrlFileURLToPath(expr: CallExpr): string {
    this.checkNodeUrlFileURLToPathArgs(expr);
    const url = this.emitWithExpected(expr.args[0]!, T_STRING);
    return `topaz_url_file_url_to_path(${url})`;
  }

  // Phase 1.5-6 prep #26: process.exit(code?). arity 0 -> exit(0) (Node's
  // default), arity 1 -> the number code. More args or a non-number code are
  // rejected. Returns `never`; value use is rejected in inferType.
  private emitProcessExit(expr: CallExpr): string {
    if (expr.args.length === 0) {
      return `topaz_process_exit(0)`;
    }
    if (expr.args.length !== 1) {
      throw new CodegenError(expr, "process.exit expects at most one argument: (code?: number)");
    }
    const arg = expr.args[0]!;
    const t = this.inferType(arg);
    if (t.kind !== "number") {
      throw new CodegenError(arg, `process.exit code must be number, got ${typeIdent(t)}`);
    }
    return `topaz_process_exit(${this.emitWithExpected(arg, T_NUMBER)})`;
  }

  // Phase 1.5-6 prep #26: process.{stdout,stderr}.write(s). Exactly one string
  // argument; no trailing newline (unlike console.*). Returns void (Node
  // returns a backpressure boolean — dropped here).
  private checkProcessStreamWriteArgs(expr: CallExpr, stream: string): void {
    if (expr.args.length !== 1) {
      throw new CodegenError({ pos: expr.pos }, `process.${stream}.write expects exactly one argument: (s: string)`);
    }
    const arg = expr.args[0];
    const t = this.inferType(arg);
    if (t.kind !== "string") {
      throw new CodegenError(arg, `process.${stream}.write argument must be string, got ${typeIdent(t)}`);
    }
  }

  private emitProcessStreamWrite(expr: CallExpr, stream: string): string {
    this.checkProcessStreamWriteArgs(expr, stream);
    const arg = expr.args[0]!;
    const fn = stream === "stdout" ? "topaz_stdout_write" : "topaz_stderr_write";
    return `${fn}(${this.emitWithExpected(arg, T_STRING)})`;
  }

  // Phase 1.5-6e-2: `import.meta.url` validation / bare-meta rejection now live
  // in convert (`convertImportMetaUrl` / `rejectBareMetaProperty`); the SCC
  // consumes the `import_meta_url` leaf directly.

  // Phase 1.5-6 prep #18: node:path.dirname(p) の引数検査。1 引数 string のみ
  // (Node の dirname は単項)。emit/infer 両経路で同じ reject。
  private checkNodePathDirnameArgs(expr: CallExpr): void {
    if (expr.args.length !== 1) {
      throw new CodegenError(
        expr,
        "dirname expects exactly one argument: (path: string)",
      );
    }
    const pathArg = expr.args[0]!;
    const pathType = this.inferType(pathArg);
    if (pathType.kind !== "string") {
      throw new CodegenError(
        pathArg,
        `dirname path argument must be string, got ${typeIdent(pathType)}`,
      );
    }
  }

  private emitNodePathDirname(expr: CallExpr): string {
    this.checkNodePathDirnameArgs(expr);
    const path = this.emitWithExpected(expr.args[0]!, T_STRING);
    return `topaz_path_dirname(${path})`;
  }

  // Phase 1.5-6 prep #18: node:path.resolve(...segments) は variadic。1 個以上の
  // string 引数を要求し、`topaz_path_resolve(n, seg0, seg1, ...)` に lower する
  // (runtime 側で getcwd フォールバック + 正規化)。
  private checkNodePathResolveArgs(expr: CallExpr): void {
    if (expr.args.length < 1) {
      throw new CodegenError(
        expr,
        "resolve expects at least one argument: (...segments: string[])",
      );
    }
    for (const arg of expr.args) {
      const argType = this.inferType(arg);
      if (argType.kind !== "string") {
        throw new CodegenError(
          arg,
          `resolve segment argument must be string, got ${typeIdent(argType)}`,
        );
      }
    }
  }

  private emitNodePathResolve(expr: CallExpr): string {
    this.checkNodePathResolveArgs(expr);
    const segs = expr.args
      .map((a) => this.emitWithExpected(a, T_STRING))
      .join(", ");
    return `topaz_path_resolve(${expr.args.length}, ${segs})`;
  }

  // Phase 1.5-6 prep #21: node:path.basename(p, ext?) の引数検査。1 または 2
  // 引数で、いずれも string。Node の path.posix.basename と同じシグネチャ。
  // emit/infer 両経路で同じ reject。
  private checkNodePathBasenameArgs(expr: CallExpr): void {
    if (expr.args.length !== 1 && expr.args.length !== 2) {
      throw new CodegenError(
        expr,
        "basename expects one or two arguments: (path: string, ext?: string)",
      );
    }
    const pathArg = expr.args[0]!;
    const pathType = this.inferType(pathArg);
    if (pathType.kind !== "string") {
      throw new CodegenError(
        pathArg,
        `basename path argument must be string, got ${typeIdent(pathType)}`,
      );
    }
    if (expr.args.length === 2) {
      const extArg = expr.args[1]!;
      const extType = this.inferType(extArg);
      if (extType.kind !== "string") {
        throw new CodegenError(
          extArg,
          `basename ext argument must be string, got ${typeIdent(extType)}`,
        );
      }
    }
  }

  private emitNodePathBasename(expr: CallExpr): string {
    this.checkNodePathBasenameArgs(expr);
    const path = this.emitWithExpected(expr.args[0]!, T_STRING);
    if (expr.args.length === 1) {
      return `topaz_path_basename(${path})`;
    }
    const ext = this.emitWithExpected(expr.args[1]!, T_STRING);
    return `topaz_path_basename_ext(${path}, ${ext})`;
  }

  // Phase 1.5-6 prep #22: node:path.extname(p) の引数検査。1 引数 string。
  // Node の path.posix.extname と同じシグネチャ。emit/infer 両経路で同じ reject。
  private checkNodePathExtnameArgs(expr: CallExpr): void {
    if (expr.args.length !== 1) {
      throw new CodegenError(
        expr,
        "extname expects exactly one argument: (path: string)",
      );
    }
    const pathArg = expr.args[0]!;
    const pathType = this.inferType(pathArg);
    if (pathType.kind !== "string") {
      throw new CodegenError(
        pathArg,
        `extname path argument must be string, got ${typeIdent(pathType)}`,
      );
    }
  }

  private emitNodePathExtname(expr: CallExpr): string {
    this.checkNodePathExtnameArgs(expr);
    const path = this.emitWithExpected(expr.args[0]!, T_STRING);
    return `topaz_path_extname(${path})`;
  }

  // Phase 1.5-6 prep #23: node:path.join(...segments) は variadic、引数 0 個も
  // Node が `.` を返す仕様なので arity の下限は無し。全引数 string を要求し、
  // resolve と同じく `topaz_path_join(n, seg0, seg1, ...)` に lower する。
  private checkNodePathJoinArgs(expr: CallExpr): void {
    for (const arg of expr.args) {
      const argType = this.inferType(arg);
      if (argType.kind !== "string") {
        throw new CodegenError(
          arg,
          `join segment argument must be string, got ${typeIdent(argType)}`,
        );
      }
    }
  }

  private emitNodePathJoin(expr: CallExpr): string {
    this.checkNodePathJoinArgs(expr);
    const segs = expr.args
      .map((a) => this.emitWithExpected(a, T_STRING))
      .join(", ");
    if (expr.args.length === 0) {
      return `topaz_path_join(0)`;
    }
    return `topaz_path_join(${expr.args.length}, ${segs})`;
  }

  // Phase 1.5-6 prep #16: parseInt(s, radix). radix is mandatory (1-arg
  // auto-radix is unsupported); both args are type-checked here so emit-side
  // and infer-side reject in lockstep (mirrors checkNodeFsReadFileSyncArgs).
  private checkParseIntArgs(expr: CallExpr): void {
    if (expr.args.length !== 2) {
      throw new CodegenError(
        expr,
        "parseInt expects exactly two arguments: (s: string, radix: number)",
      );
    }
    const sType = this.inferType(expr.args[0]!);
    if (sType.kind !== "string") {
      throw new CodegenError(
        expr.args[0]!,
        `parseInt first argument must be string, got ${typeIdent(sType)}`,
      );
    }
    const rType = this.inferType(expr.args[1]!);
    if (rType.kind !== "number") {
      throw new CodegenError(
        expr.args[1]!,
        `parseInt radix argument must be number, got ${typeIdent(rType)}`,
      );
    }
  }

  private emitParseInt(expr: CallExpr): string {
    this.checkParseIntArgs(expr);
    const s = this.emitWithExpected(expr.args[0]!, T_STRING);
    const radix = this.emitWithExpected(expr.args[1]!, T_NUMBER);
    return `topaz_parse_int(${s}, ${radix})`;
  }

  private checkParseFloatArgs(expr: CallExpr): void {
    if (expr.args.length !== 1) {
      throw new CodegenError(
        expr,
        "parseFloat expects exactly one argument: (s: string)",
      );
    }
    const sType = this.inferType(expr.args[0]!);
    if (sType.kind !== "string") {
      throw new CodegenError(
        expr.args[0]!,
        `parseFloat argument must be string, got ${typeIdent(sType)}`,
      );
    }
  }

  private emitParseFloat(expr: CallExpr): string {
    this.checkParseFloatArgs(expr);
    const s = this.emitWithExpected(expr.args[0]!, T_STRING);
    return `topaz_parse_float(${s})`;
  }

  private inferStringMethodReturn(
    expr: CallExpr,
    callee: PropAccessExpr,
  ): TopazType {
    const method = callee.name;
    if (method === "charCodeAt") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "String.charCodeAt expects exactly one argument");
      }
      const argType = this.inferType(expr.args[0]!);
      if (argType.kind !== "number") {
        throw new CodegenError(
          expr.args[0]!,
          `String.charCodeAt argument must be number, got ${typeIdent(argType)}`,
        );
      }
      return T_NUMBER;
    }
    if (method === "slice") {
      if (expr.args.length > 2) {
        throw new CodegenError(expr, "String.slice expects at most two arguments");
      }
      for (const arg of expr.args) {
        const at = this.inferType(arg);
        if (at.kind !== "number") {
          throw new CodegenError(
            arg,
            `String.slice argument must be number, got ${typeIdent(at)}`,
          );
        }
      }
      return T_STRING;
    }
    if (method === "repeat") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "String.repeat expects exactly one argument");
      }
      const countArg = expr.args[0];
      if (countArg === undefined) {
        throw new CodegenError(expr, "String.repeat expects exactly one argument");
      }
      const countType = this.inferType(countArg);
      if (countType.kind !== "number") {
        throw new CodegenError(
          countArg,
          `String.repeat argument must be number, got ${typeIdent(countType)}`,
        );
      }
      return T_STRING;
    }
    if (method === "trimStart") {
      if (expr.args.length !== 0) {
        throw new CodegenError(expr, "String.trimStart expects no arguments");
      }
      return T_STRING;
    }
    if (method === "startsWith" || method === "endsWith") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, `String.${method} expects exactly one argument`);
      }
      const argType = this.inferType(expr.args[0]!);
      if (argType.kind !== "string") {
        throw new CodegenError(
          expr.args[0]!,
          `String.${method} argument must be string, got ${typeIdent(argType)}`,
        );
      }
      return T_BOOLEAN;
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on topaz_string`);
  }

  private emitMapMethodCall(
    expr: CallExpr,
    callee: PropAccessExpr,
    baseType: TopazType,
  ): string {
    const name = mapShortName(baseType);
    const k = mapKey(baseType)!;
    const v = mapValue(baseType)!;
    const method = callee.name;
    const base = this.emitExpression(callee.receiver);
    if (method === "set") {
      if (expr.args.length !== 2) {
        throw new CodegenError(expr, "Map.set expects exactly two arguments");
      }
      // emitWithExpected enables class -> interface coercion for the value
      // when V is an interface; keys are still scalar so this is a no-op for
      // them, but the helper handles both uniformly.
      const ke = this.emitWithExpected(expr.args[0]!, k);
      const ve = this.emitWithExpected(expr.args[1]!, v);
      return `topaz_map_${name}_set(${base}, ${ke}, ${ve})`;
    }
    if (method === "get") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "Map.get expects exactly one argument");
      }
      return `topaz_map_${name}_get(${base}, ${this.emitWithExpected(expr.args[0]!, k)})`;
    }
    if (method === "has") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "Map.has expects exactly one argument");
      }
      return `topaz_map_${name}_has(${base}, ${this.emitWithExpected(expr.args[0]!, k)})`;
    }
    if (method === "delete") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "Map.delete expects exactly one argument");
      }
      return `topaz_map_${name}_delete(${base}, ${this.emitWithExpected(expr.args[0]!, k)})`;
    }
    // Phase 1.5-3.5g-iterator: `.values()` / `.keys()` now yield an Iterator<T>
    // value — a fat pointer struct allocated on the arena. The for-of dispatch
    // recognizes the call as a special form for direct hash-walk lowering;
    // standalone uses produce a real iter that can be bound / passed / consumed
    // via for-of (which uses the while-form lowering instead).
    if (method === "values") {
      if (expr.args.length !== 0) {
        throw new CodegenError(expr, "Map.values takes no arguments");
      }
      return this.emitIterConstruction(callee.receiver, baseType, "map_values", v, "value");
    }
    if (method === "keys") {
      if (expr.args.length !== 0) {
        throw new CodegenError(expr, "Map.keys takes no arguments");
      }
      return this.emitIterConstruction(callee.receiver, baseType, "map_keys", k, "key");
    }
    if (method === "entries") {
      throw new CodegenError(
        callee,
        "Map.entries() is only allowed as the right-hand side of `for (const [k, v] of m.entries())` (binding to a value is unsupported)",
      );
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on ${typeIdent(baseType)}`);
  }

  private emitClassMethodCall(
    expr: CallExpr,
    callee: PropAccessExpr,
    baseType: TopazType,
  ): string {
    const cls = this.classes.get(classNameOf(baseType)!)!;
    const mname = callee.name;
    const method = cls.methods.get(mname);
    if (!method) {
      if (cls.fields.has(mname)) {
        throw new CodegenError(callee, `'${mname}' is a field, not a method, on class '${cls.name}'`);
      }
      throw new CodegenError(callee, `class '${cls.name}' has no method '${mname}'`);
    }
    const base = this.emitExpression(callee.receiver);
    const argParts = [
      base,
      ...this.emitCallArgs(expr.args, method.params, `${cls.name}.${mname}`, expr),
    ];
    return `topaz_class_${cls.name}_method_${mname}(${argParts.join(", ")})`;
  }

  private emitInterfaceMethodCall(
    expr: CallExpr,
    callee: PropAccessExpr,
    baseType: TopazType,
  ): string {
    const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
    const mname = callee.name;
    const sig = iface.methods.get(mname);
    if (!sig) {
      if (iface.fields.has(mname)) {
        throw new CodegenError(callee, `'${mname}' is a field, not a method, on interface '${iface.name}'`);
      }
      throw new CodegenError(callee, `interface '${iface.name}' has no method '${mname}'`);
    }
    const id = this.tmpCounter++;
    const tmp = `__topaz_ib_${id}`;
    const baseStr = this.emitExpression(callee.receiver);
    const argParts = [
      `${tmp}.data`,
      ...this.emitCallArgs(expr.args, sig.params, `${iface.name}.${mname}`, expr),
    ];
    return `({ ${cTypeName(baseType)} ${tmp} = ${baseStr}; ${tmp}.vt->${mname}(${argParts.join(", ")}); })`;
  }

  private emitSetMethodCall(
    expr: CallExpr,
    callee: PropAccessExpr,
    baseType: TopazType,
  ): string {
    const name = setShortName(baseType);
    const elem = setElem(baseType)!;
    const method = callee.name;
    const base = this.emitExpression(callee.receiver);
    if (method === "add") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "Set.add expects exactly one argument");
      }
      return `topaz_set_${name}_add(${base}, ${this.emitWithExpected(expr.args[0]!, elem)})`;
    }
    if (method === "has") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "Set.has expects exactly one argument");
      }
      return `topaz_set_${name}_has(${base}, ${this.emitWithExpected(expr.args[0]!, elem)})`;
    }
    if (method === "delete") {
      if (expr.args.length !== 1) {
        throw new CodegenError(expr, "Set.delete expects exactly one argument");
      }
      return `topaz_set_${name}_delete(${base}, ${this.emitWithExpected(expr.args[0]!, elem)})`;
    }
    // Phase 1.5-3.5g-iterator: Set.values() / Set.keys() yield an Iterator<T>;
    // both share `set_values` semantics (Set yields elem for either, matching
    // JS), so we always pass source="set_values" + field="key".
    if (method === "values" || method === "keys") {
      if (expr.args.length !== 0) {
        throw new CodegenError(expr, `Set.${method} takes no arguments`);
      }
      return this.emitIterConstruction(callee.receiver, baseType, "set_values", elem, "key");
    }
    if (method === "entries") {
      throw new CodegenError(
        callee,
        "Set.entries() is only allowed as the right-hand side of `for (const [a, b] of s.entries())` (binding to a value is unsupported)",
      );
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on ${typeIdent(baseType)}`);
  }

  // Phase 1.5-3.5d helpers: resolve / lower optional chain accesses.
  //
  // `a?.b` / `a?.b()` / `a?.[i]` all share the same short-circuit shape: the
  // receiver `a` must be `T | undefined`, the chain evaluates `a` once into a
  // tmp, branches on the sentinel slot (NULL pointer / fat-pointer .data /
  // scalar .present), and yields either the absent literal of the result type
  // or the wrapped present-case value. No-op `?.` on an already non-optional
  // receiver is rejected so the operator's intent stays unambiguous.

  private resolveOptionalReceiver(
    expr: PropAccessExpr | ElemAccessExpr | CallExpr,
    receiver: Expr,
  ): { baseType: TopazType; inner: TopazType } {
    const baseType = this.inferType(receiver);
    const inner = withoutUndefined(baseType);
    if (!inner || typeEq(inner, baseType)) {
      throw new CodegenError(
        expr,
        `optional chain \`?.\` requires a \`T | undefined\` receiver; got ${typeIdent(baseType)}`,
      );
    }
    return { baseType, inner };
  }

  private resolveOptionalFieldType(
    expr: PropAccessExpr,
  ): { baseType: TopazType; inner: TopazType; fieldType: TopazType } {
    const { baseType, inner } = this.resolveOptionalReceiver(expr, expr.receiver);
    const fname = expr.name;
    if (isClassType(inner)) {
      const cls = this.classes.get(classNameOf(inner)!)!;
      const ft = cls.fields.get(fname);
      if (ft) return { baseType, inner, fieldType: ft };
      if (cls.methods.has(fname)) {
        throw new CodegenError(
          expr,
          `method '${fname}' cannot be used as a value (call it with \`?.${fname}()\` instead)`,
        );
      }
      throw new CodegenError(expr, `class '${cls.name}' has no member '${fname}'`);
    }
    if (isInterfaceType(inner)) {
      const iface = this.interfaces.get(interfaceNameOf(inner)!)!;
      const ft = iface.fields.get(fname);
      if (ft) return { baseType, inner, fieldType: ft };
      if (iface.methods.has(fname)) {
        throw new CodegenError(
          expr,
          `method '${fname}' cannot be used as a value (call it with \`?.${fname}()\` instead)`,
        );
      }
      throw new CodegenError(expr, `interface '${iface.name}' has no member '${fname}'`);
    }
    throw new CodegenError(
      expr,
      `optional property access \`?.\` is only supported on class / interface receivers (got ${typeIdent(baseType)})`,
    );
  }

  private resolveOptionalMethodSig(
    callee: PropAccessExpr,
  ): { baseType: TopazType; inner: TopazType; sig: { params: ParamInfo[]; returnType: TopazType } } {
    const { baseType, inner } = this.resolveOptionalReceiver(callee, callee.receiver);
    const mname = callee.name;
    if (isClassType(inner)) {
      const cls = this.classes.get(classNameOf(inner)!)!;
      const m = cls.methods.get(mname);
      if (m) return { baseType, inner, sig: { params: m.params, returnType: m.returnType } };
      if (cls.fields.has(mname)) {
        throw new CodegenError(callee, `'${mname}' is a field, not a method, on class '${cls.name}'`);
      }
      throw new CodegenError(callee, `class '${cls.name}' has no method '${mname}'`);
    }
    if (isInterfaceType(inner)) {
      const iface = this.interfaces.get(interfaceNameOf(inner)!)!;
      const s = iface.methods.get(mname);
      if (s) return { baseType, inner, sig: { params: s.params, returnType: s.returnType } };
      if (iface.fields.has(mname)) {
        throw new CodegenError(callee, `'${mname}' is a field, not a method, on interface '${iface.name}'`);
      }
      throw new CodegenError(callee, `interface '${iface.name}' has no method '${mname}'`);
    }
    throw new CodegenError(
      callee,
      `optional method call \`?.\` is only supported on class / interface receivers (got ${typeIdent(baseType)})`,
    );
  }

  private resolveOptionalIndexType(
    expr: ElemAccessExpr,
  ): { baseType: TopazType; inner: TopazType; elem: TopazType } {
    const { baseType, inner } = this.resolveOptionalReceiver(expr, expr.receiver);
    if (!isArrayType(inner)) {
      throw new CodegenError(
        expr,
        `optional index access \`?.[i]\` is only supported on Array receivers (got ${typeIdent(baseType)})`,
      );
    }
    this.expectType(expr.index, T_NUMBER);
    return { baseType, inner, elem: arrayElem(inner)! };
  }

  // Builds the stmt-expression shell. `emitPresent(tmp)` is called once and
  // its output is fed through applyCoercion so scalar return types get the
  // `topaz_opt_wrap_<scalar>` wrapper for free; reference / iface return
  // types share their C representation with `T | undefined` so the coercion
  // is a no-op there.
  private lowerOptionalChain(args: {
    baseType: TopazType;
    inner: TopazType;
    baseStr: string;
    accessType: TopazType;
    emitPresent: (tmp: string) => string;
    anchor: { pos: number };
  }): string {
    const id = this.tmpCounter++;
    const tmp = `__topaz_oc_${id}`;
    const ct = cTypeName(args.baseType);
    let isAbsent: string;
    if (isInterfaceType(args.inner)) {
      isAbsent = `${tmp}.data == NULL`;
    } else {
      // class / array / map / set: pointer-sentinel
      isAbsent = `${tmp} == NULL`;
    }
    const resultType = makeUnion([args.accessType, T_UNDEFINED]);
    const absentStr = this.emitUndefinedLiteral(resultType, args.anchor);
    const presentRaw = args.emitPresent(tmp);
    const presentStr = this.applyCoercion(presentRaw, args.accessType, resultType, args.anchor);
    return `({ ${ct} ${tmp} = ${args.baseStr}; (${isAbsent}) ? ${absentStr} : ${presentStr}; })`;
  }

  private emitOptionalPropertyAccess(expr: PropAccessExpr): string {
    const { baseType, inner, fieldType } = this.resolveOptionalFieldType(expr);
    const baseStr = this.emitExpression(expr.receiver);
    const fname = expr.name;
    return this.lowerOptionalChain({
      baseType,
      inner,
      baseStr,
      accessType: fieldType,
      anchor: expr,
      emitPresent: (tmp) => {
        if (isClassType(inner)) {
          return `(${tmp})->${fname}`;
        }
        // interface: read through vtable getter
        return `(${tmp}).vt->get_${fname}((${tmp}).data)`;
      },
    });
  }

  private emitOptionalElementAccess(expr: ElemAccessExpr): string {
    const { baseType, inner, elem } = this.resolveOptionalIndexType(expr);
    const baseStr = this.emitExpression(expr.receiver);
    const idxStr = this.emitExpression(expr.index);
    const name = arrayShortName(inner);
    return this.lowerOptionalChain({
      baseType,
      inner,
      baseStr,
      accessType: elem,
      anchor: expr,
      emitPresent: (tmp) => `topaz_array_${name}_at(${tmp}, ${idxStr})`,
    });
  }

  private emitOptionalMethodCall(
    expr: CallExpr,
    callee: PropAccessExpr,
  ): string {
    const { baseType, inner, sig } = this.resolveOptionalMethodSig(callee);
    if (expr.args.length !== sig.params.length) {
      throw new CodegenError(
        expr,
        `${typeIdent(inner)}.${callee.name} expects ${sig.params.length} argument(s), got ${expr.args.length}`,
      );
    }
    const baseStr = this.emitExpression(callee.receiver);
    const argStrs = expr.args.map((a, i) => this.emitWithExpected(a, sig.params[i]!.type));
    const mname = callee.name;
    return this.lowerOptionalChain({
      baseType,
      inner,
      baseStr,
      accessType: sig.returnType,
      anchor: expr,
      emitPresent: (tmp) => {
        if (isClassType(inner)) {
          const cname = classNameOf(inner)!;
          const parts = [tmp, ...argStrs].join(", ");
          return `topaz_class_${cname}_method_${mname}(${parts})`;
        }
        // interface: dispatch through vtable, passing data + remaining args
        const parts = [`(${tmp}).data`, ...argStrs].join(", ");
        return `(${tmp}).vt->${mname}(${parts})`;
      },
    });
  }

  private inferType(expr: Expr): TopazType {
    if (expr.kind === "num_lit") return T_NUMBER;
    if (expr.kind === "bool_lit") return T_BOOLEAN;
    if (expr.kind === "this_expr") {
      if (!this.currentClass) {
        throw new CodegenError(expr, "`this` is only valid inside class methods or constructors");
      }
      return classOf(this.currentClass);
    }
    if (expr.kind === "str_lit") {
      return T_STRING;
    }
    if (expr.kind === "undefined_lit") return T_UNDEFINED;
    if (expr.kind === "import_meta_url") return T_STRING;
    // Phase 1.5-3.5e: an arrow's type is built from its param + return
    // annotations. Without contextual typing we require all annotations; a
    // contextual call site (emitWithExpected) feeds the expected type
    // separately. Note: this triggers a redundant emit-into-discard but
    // matches how other compound expressions handle inferType (the slot is
    // append-only and stable).
    if (expr.kind === "arrow_expr") {
      return this.inferArrowType(expr, undefined);
    }
    if (expr.kind === "template_lit") {
      // Phase 1.5-3.5: each ${} substitution must be number / boolean / string
      // (after narrowing). Class / interface / array / map / set / union have
      // no defined toString policy yet — surface the error at the substitution.
      for (const sub of expr.subs) {
        const t = this.inferType(sub.expr);
        if (t.kind !== "number" && t.kind !== "boolean" && t.kind !== "string") {
          throw new CodegenError(
            sub.expr,
            `template literal substitution must be number / boolean / string, got ${typeIdent(t)}`,
          );
        }
      }
      return T_STRING;
    }
    if (expr.kind === "paren_expr") return this.inferType(expr.inner);
    // Phase 1.5-6 prep #25: a ternary's type is the common type of its two
    // branches, each inferred under the narrowing the condition implies.
    if (expr.kind === "ternary_expr") {
      this.expectType(expr.cond, T_BOOLEAN);
      const nTrue = this.extractNarrowing(expr.cond, true);
      const nFalse = this.extractNarrowing(expr.cond, false);
      return this.conditionalResultType(expr, nTrue, nFalse);
    }
    // Phase 1.5-6 prep: object literal expressions have no inferable type on
    // their own — they need a contextual anonymous-class target. Reject here
    // so the error surfaces at the literal site instead of inside a deeper
    // emitExpression fallthrough.
    if (expr.kind === "object_lit") {
      throw new CodegenError(
        expr,
        "object literal expression requires a contextually typed anonymous-class target (annotate the binding / return type)",
      );
    }
    if (expr.kind === "ident") {
      const local = this.scope.lookup(expr.name);
      const captureContext = this.captureContext;
      if (local === undefined && captureContext !== undefined && captureContext.captures.has(expr.name)) {
        return captureContext.captures.get(expr.name)!;
      }
      if (local !== undefined) return local.type;
      // Phase 1.5-3.5g-array-fn: top-level functions are addressable as fn
      // values when referenced by name (`seeds.map(makeAdder)`). Generic
      // functions need a call-site type-arg list to monomorphize, so they
      // stay rejected here.
      const sig = this.resolveFunctionSig(expr.name, expr);
      if (sig) {
        const fnType: TopazType = { kind: "fn", params: sig.params, returnType: sig.returnType };
        this.recordFnMonomorph(fnType);
        return fnType;
      }
      throw new CodegenError(expr, `unknown identifier '${expr.name}'`);
    }
    if (expr.kind === "prop_access" && expr.optional) {
      const { fieldType } = this.resolveOptionalFieldType(expr);
      return makeUnion([fieldType, T_UNDEFINED]);
    }
    // Phase 1.5-6 prep #26: `process.argv` types as Array<string>. Short-circuit
    // before inferType(expr.receiver) would trip on the synthetic `process`.
    if (expr.kind === "prop_access") {
      const receiver = expr.receiver;
      if (receiver.kind === "ident") {
        if (receiver.name === "process") {
          if (expr.name === "argv") {
            return arrayOf(T_STRING)!;
          }
          throw new CodegenError(
            { pos: expr.pos },
            `unsupported \`process.${expr.name}\` as a value (only \`process.argv\`; \`process.exit\` / \`process.stdout.write\` / \`process.stderr.write\` are call-only)`,
          );
        }
      }
    }
    if (expr.kind === "prop_access") {
      const exprAnchor: { pos: number } = { pos: expr.pos };
      const baseType = this.inferType(expr.receiver);
      if (baseType.kind === "union") {
        throw new CodegenError(
          expr,
          `cannot access '.${expr.name}' on union type ${typeIdent(baseType)} - narrow it first with \`if (x !== undefined)\``,
        );
      }
      // Phase 1.5-3f: unknown values (catch payload) need `instanceof` to
      // be readable. Surfacing the error here so identifier-level access
      // gets a clear hint instead of a generic "unsupported property" trip.
      if (baseType.kind === "unknown") {
        throw new CodegenError(
          expr,
          `cannot access '.${expr.name}' on \`unknown\` - narrow it first with \`if (x instanceof ClassName)\``,
        );
      }
      // Phase 1.5-3e: dunion exposes only the discriminator field; everything
      // else requires narrowing via `switch (d.kind)`.
      if (baseType.kind === "dunion") {
        if (expr.name === baseType.discriminator) {
          return T_STRING;
        }
        // Phase 1.5-6 prep #18: a field present on every variant with one
        // identical type is a "common field" — TS lets you read it without
        // narrowing (e.g. `Token.pos` / `.end` across the lexer's token
        // variants). emit dispatches on the variant tag to pick the right cast.
        const common = this.dunionCommonFieldType(baseType, expr.name);
        if (common) return common;
        throw new CodegenError(
          expr,
          `cannot access '.${expr.name}' on discriminated union ${typeIdent(baseType)} - narrow it first with \`switch (x.${baseType.discriminator})\``,
        );
      }
      if (baseType.kind === "string" && expr.name === "length") {
        return T_NUMBER;
      }
      if (isArrayType(baseType) && expr.name === "length") {
        return T_NUMBER;
      }
      if ((isMapType(baseType) || isSetType(baseType)) && expr.name === "size") {
        return T_NUMBER;
      }
      if (isClassType(baseType)) {
        const cls = this.classes.get(classNameOf(baseType)!)!;
        const fieldType = cls.fields.get(expr.name);
        if (fieldType) {
          // A string-literal field (e.g. a discriminator) read off a concrete
          // instance yields a runtime `topaz_string`; widen to `string` for
          // consumption so console.log / template / concat dispatch correctly.
          // This mirrors the dunion-discriminator read above (returns T_STRING)
          // — both surface the same value. Now reachable because initializer
          // narrowing (`const c: Circle | Square = new Circle(...)`) hands later
          // reads the concrete class rather than the union. Coercing the read
          // back into an expected string-literal stays (correctly) rejected.
          if (fieldType.kind === "string_literal") return T_STRING;
          return fieldType;
        }
        if (cls.methods.has(expr.name)) {
          throw new CodegenError(
            exprAnchor,
            `method '${expr.name}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          exprAnchor,
          `class '${cls.name}' has no member '${expr.name}'`,
        );
      }
      if (isInterfaceType(baseType)) {
        const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
        const f = iface.fields.get(expr.name);
        if (f) return f;
        if (iface.methods.has(expr.name)) {
          throw new CodegenError(
            exprAnchor,
            `method '${expr.name}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          exprAnchor,
          `interface '${iface.name}' has no member '${expr.name}'`,
        );
      }
      throw new CodegenError(
        exprAnchor,
        `unsupported property access '.${expr.name}' on ${typeIdent(baseType)}`,
      );
    }
    if (expr.kind === "elem_access" && expr.optional) {
      const { elem } = this.resolveOptionalIndexType(expr);
      return makeUnion([elem, T_UNDEFINED]);
    }
    if (expr.kind === "elem_access") {
      const baseType = this.inferType(expr.receiver);
      const elem = arrayElem(baseType);
      if (elem === undefined) {
        const exprAnchor: { pos: number } = { pos: expr.pos };
        throw new CodegenError(exprAnchor, `index access is only supported on Array (got ${typeIdent(baseType)})`);
      }
      this.expectType(expr.index, T_NUMBER);
      return elem;
    }
    if (expr.kind === "array_lit") {
      if (expr.elems.length === 0) {
        throw new CodegenError(
          expr,
          "cannot infer element type of empty array literal; add an `Array<T>` annotation",
        );
      }
      // Phase 1.5-3.5h-spread: infer elem from first element (spread -> source's
      // elem, fixed -> its type). Subsequent elements are validated by emit-time
      // type checks; inferType only needs the elem to look up the monomorph.
      const first = expr.elems[0]!;
      let elem: TopazType;
      if (first.kind === "spread") {
        const srcType = this.inferType(first.expr);
        if (!isArrayType(srcType)) {
          throw new CodegenError(
            first.expr,
            `spread source in array literal must be an Array<T>, got ${typeIdent(srcType)}`,
          );
        }
        elem = arrayElem(srcType)!;
      } else {
        elem = this.inferType(first.expr);
        for (let i = 1; i < expr.elems.length; i++) {
          const e = expr.elems[i]!;
          if (e.kind !== "spread") this.expectType(e.expr, elem);
        }
      }
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(expr, `no Array monomorph for element type ${typeIdent(elem)}`);
      }
      this.recordArrayMonomorph(arr);
      return arr;
    }
    if (expr.kind === "non_null") {
      // Phase 1.5-3.5c: `e!` asserts at runtime that the optional carries a
      // value, and yields the underlying T. Only `T | undefined` is accepted
      // (scalar / class / iface / array / map / set); a no-op `!` on an
      // already non-optional value is rejected so the assertion remains
      // meaningful (TS-style "Non-null assertion has no effect" warning is
      // upgraded to an error here).
      const inner = this.inferType(expr.operand);
      const stripped = withoutUndefined(inner);
      if (!stripped || typeEq(stripped, inner)) {
        throw new CodegenError(
          expr,
          `non-null assertion (\`!\`) requires a \`T | undefined\` operand; got ${typeIdent(inner)}`,
        );
      }
      // Phase 1.5-6 prep #15: dunion shares iface's fat-struct shape, so `!`
      // works against the `.data == NULL` sentinel.
      if (
        !isScalarType(stripped) && !isReferenceType(stripped)
        && !isInterfaceType(stripped) && stripped.kind !== "dunion"
      ) {
        throw new CodegenError(
          expr,
          `non-null assertion on ${typeIdent(inner)} is unsupported`,
        );
      }
      return stripped;
    }
    if (expr.kind === "prefix_op") {
      switch (expr.op) {
        case "-":
        case "+":
          this.expectType(expr.operand, T_NUMBER);
          return T_NUMBER;
        case "!":
          this.expectType(expr.operand, T_BOOLEAN);
          return T_BOOLEAN;
        case "++":
        case "--":
          this.checkAssignTarget(expr.operand, { pos: expr.pos });
          this.expectType(expr.operand, T_NUMBER);
          return T_NUMBER;
        default:
          unsupported(expr, "prefix unary operator");
      }
    }
    if (expr.kind === "postfix_op") {
      this.checkAssignTarget(expr.operand, { pos: expr.pos });
      this.expectType(expr.operand, T_NUMBER);
      return T_NUMBER;
    }
    if (expr.kind === "instanceof_expr") {
      // Phase 1.5-3f: `instanceof` runtime type test for catch payloads.
      // Left must be `unknown` (the catch binding's type) or a class
      // instance (tautology, but allowed for symmetry). Right must be a
      // declared concrete class name; interface/generic targets need
      // separate plumbing not in scope for 1.5-3f.
      const lt = this.inferType(expr.lhs);
      if (lt.kind !== "unknown" && !isClassType(lt)) {
        throw new CodegenError(
          { pos: expr.lhs.pos },
          `\`instanceof\` requires left side to be \`unknown\` or a class instance (got ${typeIdent(lt)})`,
        );
      }
      const rhs = expr.rhs;
      let rhsName: string | undefined = undefined;
      if (rhs.kind === "ident") {
        rhsName = rhs.name;
      }
      if (rhsName === undefined) {
        throw new CodegenError(
          { pos: rhs.pos },
          "`instanceof` right side must be a class name",
        );
      }
      if (!this.classes.has(rhsName)) {
        throw new CodegenError(
          { pos: rhs.pos },
          `unknown class '${rhsName}' on right side of \`instanceof\``,
        );
      }
      return T_BOOLEAN;
    }
    if (expr.kind === "assign_expr") {
      const op = expr.op;
      const assignAnchor: { pos: number } = { pos: expr.pos };
      this.checkAssignTarget(expr.target, assignAnchor);
      if (op === "=") {
        const lt = this.inferType(expr.target);
        this.expectType(expr.value, lt);
        return lt;
      }
      if (op === "+=") {
        const lt = this.inferType(expr.target);
        if (lt.kind === "string") {
          this.expectType(expr.value, T_STRING);
          return T_STRING;
        }
        this.expectType(expr.target, T_NUMBER);
        this.expectType(expr.value, T_NUMBER);
        return T_NUMBER;
      }
      // "-=", "*=", "/=", "%="
      this.expectType(expr.target, T_NUMBER);
      this.expectType(expr.value, T_NUMBER);
      return T_NUMBER;
    }
    if (expr.kind === "bin_op") {
      const kind = expr.op;
      switch (kind) {
        case "+": {
          const lt = this.inferType(expr.lhs);
          if (lt.kind === "string") {
            this.expectType(expr.rhs, T_STRING);
            return T_STRING;
          }
          this.expectType(expr.lhs, T_NUMBER);
          this.expectType(expr.rhs, T_NUMBER);
          return T_NUMBER;
        }
        case "-":
        case "*":
        case "/":
        case "%":
          this.expectType(expr.lhs, T_NUMBER);
          this.expectType(expr.rhs, T_NUMBER);
          return T_NUMBER;
        case "<":
        case "<=":
        case ">":
        case ">=":
          this.expectType(expr.lhs, T_NUMBER);
          this.expectType(expr.rhs, T_NUMBER);
          return T_BOOLEAN;
        case "===":
        case "!==": {
          const lt = this.inferType(expr.lhs);
          const rt = this.inferType(expr.rhs);
          if (!typesOverlap(lt, rt)) {
            throw new CodegenError(
              expr,
              `type mismatch: cannot compare ${typeIdent(lt)} === ${typeIdent(rt)} (no common variant)`,
            );
          }
          return T_BOOLEAN;
        }
        case "&&":
        case "||": {
          this.expectType(expr.lhs, T_BOOLEAN);
          // Phase 1.5-6 prep #19: `&&`'s right operand runs only when the left
          // is true, so it sees the left's positive narrowing; `||`'s right
          // runs when the left is false and sees the negative narrowing.
          const polarity = kind === "&&";
          const n = this.extractNarrowing(expr.lhs, polarity);
          if (n) {
            this.scope.push();
            try {
              this.scope.narrow(n.name, n.type);
              this.expectType(expr.rhs, T_BOOLEAN);
            } finally {
              this.scope.pop();
            }
          } else {
            this.expectType(expr.rhs, T_BOOLEAN);
          }
          return T_BOOLEAN;
        }
        case "==":
        case "!=":
          throw new CodegenError(
            expr,
            "loose equality (== / !=) is unsupported; use === / !==",
          );
        case "??": {
          // Phase 1.5-3.5c: `a ?? b` requires `a: T | undefined`. The result
          // is T when the RHS is T, or T | undefined when the RHS is itself
          // T | undefined (so chained `a ?? b ?? c` keeps optional through
          // the middle layer). The RHS must be assignable to one of those.
          const lt = this.inferType(expr.lhs);
          const inner = withoutUndefined(lt);
          if (!inner || typeEq(inner, lt)) {
            throw new CodegenError(
              expr,
              `\`??\` requires the left operand to be \`T | undefined\`; got ${typeIdent(lt)}`,
            );
          }
          // Phase 1.5-6 prep #15: dunion shares iface's fat-struct shape, so
          // `??` can use the `.data == NULL` sentinel as the fallback gate.
          if (
            !isScalarType(inner) && !isReferenceType(inner)
            && !isInterfaceType(inner) && inner.kind !== "dunion"
          ) {
            throw new CodegenError(
              expr,
              `\`??\` on ${typeIdent(lt)} is unsupported`,
            );
          }
          const rt = this.inferType(expr.rhs);
          if (this.isAssignableTo(rt, inner)) return inner;
          if (this.isAssignableTo(rt, lt)) return lt;
          throw new CodegenError(
            expr.rhs,
            `\`??\` right operand has type ${typeIdent(rt)}; expected ${typeIdent(inner)} or ${typeIdent(lt)}`,
          );
        }
        default:
          unsupported(expr, "binary operator");
      }
    }
    if (expr.kind === "call_expr") {
      const callee = expr.callee;
      // Phase 1.5-3.5d: optional method call `a?.b()` — the result is the
      // method's return type widened to `R | undefined`.
      if (callee.kind === "prop_access" && callee.optional) {
        const { sig } = this.resolveOptionalMethodSig(callee);
        return makeUnion([sig.returnType, T_UNDEFINED]);
      }
      if (expr.optional) {
        throw new CodegenError(
          expr,
          "optional call `f?.()` is unsupported (only `a?.b`, `a?.b()`, and `a?.[i]` are supported)",
        );
      }
      if (
        callee.kind === "prop_access" &&
        callee.receiver.kind === "ident" &&
        callee.receiver.name === "console" &&
        (callee.name === "log" || callee.name === "error")
      ) {
        throw new CodegenError(expr, `console.${callee.name} returns void and cannot be used as a value`);
      }
      // Phase 1.5-6 prep #26: process.exit returns `never`, process.*.write
      // returns void — neither is usable as a value.
      if (
        callee.kind === "prop_access" &&
        callee.receiver.kind === "ident" &&
        callee.receiver.name === "process" &&
        callee.name === "exit"
      ) {
        throw new CodegenError(expr, "process.exit returns `never` and cannot be used as a value");
      }
      if (
        callee.kind === "prop_access" &&
        callee.receiver.kind === "prop_access" &&
        callee.receiver.receiver.kind === "ident" &&
        callee.receiver.receiver.name === "process" &&
        (callee.receiver.name === "stdout" || callee.receiver.name === "stderr") &&
        callee.name === "write"
      ) {
        throw new CodegenError(expr, `process.${callee.receiver.name}.write returns void and cannot be used as a value`);
      }
      // Phase 1.5-6 prep #12: `String.fromCharCode(n)` is recognized
      // syntactically (mirrors emitCall) — the `String` identifier has no
      // real binding, so we must short-circuit before `inferType(callee.receiver)`.
      if (
        callee.kind === "prop_access" &&
        callee.receiver.kind === "ident" &&
        callee.receiver.name === "String"
      ) {
        return this.inferStringStaticReturn(expr, callee);
      }
      if (callee.kind === "prop_access") {
        const baseType = this.inferType(callee.receiver);
        if (isArrayType(baseType)) {
          const elem = arrayElem(baseType)!;
          if (callee.name === "push") {
            throw new CodegenError(expr, "Array.push returns void in this dialect and cannot be used as a value");
          }
          if (callee.name === "pop") {
            return elem;
          }
          if (callee.name === "map") {
            if (expr.args.length !== 1) {
              throw new CodegenError(expr, "Array.map expects exactly one argument");
            }
            const cb = expr.args[0]!;
            const fnType = this.inferCallbackFn(cb, [elem], "Array.map");
            const u = fnType.returnType;
            if (u.kind === "void") {
              throw new CodegenError(cb, "Array.map callback cannot return `void` (no Array<void> monomorph)");
            }
            // Phase 1.5-3.5g-array-fn: fn return type now routes to Array<fn>
            // via recordArrayMonomorph -> arrayFnMonomorphs.
            if (u.kind === "undefined" || (u.kind === "union" && containsUndefined(u))) {
              throw new CodegenError(
                cb,
                `Array.map callback returning ${typeIdent(u)} is unsupported (no Array<T | undefined> monomorph)`,
              );
            }
            const result = arrayOf(u);
            if (!result) {
              throw new CodegenError(expr, `Array.map: cannot form Array<${typeIdent(u)}> result`);
            }
            this.recordArrayMonomorph(result);
            return result;
          }
          if (callee.name === "slice") {
            if (expr.args.length > 2) {
              throw new CodegenError(expr, "Array.slice expects at most two arguments");
            }
            for (const arg of expr.args) {
              const at = this.inferType(arg);
              if (at.kind !== "number") {
                throw new CodegenError(
                  arg,
                  `Array.slice argument must be number, got ${typeIdent(at)}`,
                );
              }
            }
            // dst monomorph is the same as src; no new Array<T> to register.
            return baseType;
          }
          if (callee.name === "includes") {
            if (expr.args.length === 0) {
              throw new CodegenError(expr, "Array.includes expects exactly one argument");
            }
            if (expr.args.length > 1) {
              throw new CodegenError(expr, "Array.includes `fromIndex` argument is unsupported");
            }
            // Side-effect: re-check that `target` matches elem so emit-side
            // and infer-side reject in lockstep.
            this.emitWithExpected(expr.args[0]!, elem);
            // Reject unsupported elem types up-front (mirrors emitArrayMethodCall).
            if (
              elem.kind !== "number" &&
              elem.kind !== "boolean" &&
              elem.kind !== "string" &&
              !isClassType(elem) &&
              !isInterfaceType(elem)
            ) {
              throw new CodegenError(
                expr,
                `Array.includes is unsupported for element type ${typeIdent(elem)}`,
              );
            }
            return T_BOOLEAN;
          }
          if (callee.name === "filter") {
            if (expr.args.length !== 1) {
              throw new CodegenError(expr, "Array.filter expects exactly one argument");
            }
            const cb = expr.args[0]!;
            const fnType = this.inferCallbackFn(cb, [elem], "Array.filter");
            if (fnType.returnType.kind !== "boolean") {
              throw new CodegenError(
                cb,
                `Array.filter callback must return boolean, got ${typeIdent(fnType.returnType)}`,
              );
            }
            // dst monomorph is the same as src; no new Array<T> to register.
            return baseType;
          }
          if (callee.name === "join") {
            if (expr.args.length > 1) {
              throw new CodegenError(expr, "Array.join expects at most one argument");
            }
            if (elem.kind !== "number" && elem.kind !== "boolean" && elem.kind !== "string") {
              throw new CodegenError(
                expr,
                `Array.join is unsupported for element type ${typeIdent(elem)}; only scalar (number / boolean / string) elements are supported`,
              );
            }
            if (expr.args.length === 1) {
              const sepType = this.inferType(expr.args[0]!);
              if (sepType.kind !== "string") {
                throw new CodegenError(
                  expr.args[0]!,
                  `Array.join separator must be string, got ${typeIdent(sepType)}`,
                );
              }
            }
            this.recordArrayJoinMonomorph(baseType);
            return T_STRING;
          }
          throw new CodegenError(callee, `unsupported method '.${callee.name}' on ${typeIdent(baseType)}`);
        }
        if (isMapType(baseType)) {
          const v = mapValue(baseType)!;
          const m = callee.name;
          if (m === "set") {
            throw new CodegenError(expr, "Map.set returns void in this dialect and cannot be used as a value");
          }
          // Phase 1.5-3c: Map.get returns `V | undefined`. Callers must narrow
          // with `if (x !== undefined)` before using as V; the runtime returns
          // an opt struct for scalar V and a NULL-sentinel pointer / fat
          // pointer for class / iface V.
          if (m === "get") return makeUnion([v, T_UNDEFINED]);
          if (m === "has" || m === "delete") return T_BOOLEAN;
          if (m === "values") return { kind: "iter", elem: v };
          if (m === "keys") return { kind: "iter", elem: mapKey(baseType)! };
          if (m === "entries") {
            throw new CodegenError(
              callee,
              "Map.entries() is only allowed as the right-hand side of `for (const [k, v] of m.entries())` (binding to a value is unsupported)",
            );
          }
          throw new CodegenError(callee, `unsupported method '.${m}' on ${typeIdent(baseType)}`);
        }
        if (isSetType(baseType)) {
          const m = callee.name;
          if (m === "add") {
            throw new CodegenError(expr, "Set.add returns void in this dialect and cannot be used as a value");
          }
          if (m === "has" || m === "delete") return T_BOOLEAN;
          if (m === "values" || m === "keys") {
            return { kind: "iter", elem: setElem(baseType)! };
          }
          if (m === "entries") {
            throw new CodegenError(
              callee,
              "Set.entries() is only allowed as the right-hand side of `for (const [a, b] of s.entries())` (binding to a value is unsupported)",
            );
          }
          throw new CodegenError(callee, `unsupported method '.${m}' on ${typeIdent(baseType)}`);
        }
        if (baseType.kind === "string") {
          return this.inferStringMethodReturn(expr, callee);
        }
        if (isClassType(baseType)) {
          const cls = this.classes.get(classNameOf(baseType)!)!;
          const method = cls.methods.get(callee.name);
          if (!method) {
            throw new CodegenError(callee, `class '${cls.name}' has no method '${callee.name}'`);
          }
          return method.returnType;
        }
        if (isInterfaceType(baseType)) {
          const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
          const sig = iface.methods.get(callee.name);
          if (!sig) {
            throw new CodegenError(callee, `interface '${iface.name}' has no method '${callee.name}'`);
          }
          return sig.returnType;
        }
        throw new CodegenError(callee, `unsupported method '.${callee.name}' on ${typeIdent(baseType)}`);
      }
      if (callee.kind === "ident") {
        // Phase 1.5-6 prep #13: `readFileSync(path, "utf8")` の syntactic
        // shortcut (mirrors emitCall) — `readFileSync` 識別子は scope に存在
        // しないので、ここで先に拾わないと scope lookup が「unknown
        // identifier」で fall する。
        if (callee.name === "readFileSync") {
          this.checkNodeFsReadFileSyncArgs(expr);
          return T_STRING;
        }
        // Phase 1.5-6 prep #17: existsSync types as boolean.
        if (callee.name === "existsSync") {
          this.checkNodeFsExistsSyncArgs(expr);
          return T_BOOLEAN;
        }
        // Phase 1.5-6 prep #19: writeFileSync returns void; reject value use
        // (mirrors Array.push / console.log).
        if (callee.name === "writeFileSync") {
          throw new CodegenError(expr, "writeFileSync returns void and cannot be used as a value");
        }
        // Phase 1.5-6 prep #20: mkdirSync returns void; reject value use.
        if (callee.name === "mkdirSync") {
          throw new CodegenError(expr, "mkdirSync returns void and cannot be used as a value");
        }
        // Phase 1.5-6 prep #18: node:path.dirname / resolve type as string.
        if (callee.name === "dirname") {
          this.checkNodePathDirnameArgs(expr);
          return T_STRING;
        }
        if (callee.name === "resolve") {
          this.checkNodePathResolveArgs(expr);
          return T_STRING;
        }
        // Phase 1.5-6 prep #21: node:path.basename types as string.
        if (callee.name === "basename") {
          this.checkNodePathBasenameArgs(expr);
          return T_STRING;
        }
        // Phase 1.5-6 prep #22: node:path.extname types as string.
        if (callee.name === "extname") {
          this.checkNodePathExtnameArgs(expr);
          return T_STRING;
        }
        // Phase 1.5-6 prep #23: node:path.join types as string.
        if (callee.name === "join") {
          this.checkNodePathJoinArgs(expr);
          return T_STRING;
        }
        // Phase 1.5-6 prep #24: execFileSync returns void; reject value use
        // (mirrors writeFileSync / mkdirSync).
        if (callee.name === "execFileSync") {
          throw new CodegenError(expr, "execFileSync returns void and cannot be used as a value");
        }
        // Phase 1.5-6 prep #25: node:url.fileURLToPath types as string.
        if (callee.name === "fileURLToPath") {
          this.checkNodeUrlFileURLToPathArgs(expr);
          return T_STRING;
        }
        // Phase 1.5-6 prep #16: parseInt / parseFloat both type as number.
        if (callee.name === "parseInt") {
          this.checkParseIntArgs(expr);
          return T_NUMBER;
        }
        if (callee.name === "parseFloat") {
          this.checkParseFloatArgs(expr);
          return T_NUMBER;
        }
        if (this.genericFunctions.has(callee.name)) {
          const resolved = this.resolveGenericCall(callee, expr)!;
          return resolved.sig.returnType;
        }
        const sig = this.resolveFunctionSig(callee.name, callee);
        if (sig) return sig.returnType;
        // Phase 1.5-3.5e: fn-typed local — look up its inferred type and use
        // its declared return type.
        const calleeType = this.inferType(callee);
        if (calleeType.kind === "fn") return calleeType.returnType;
        throw new CodegenError(callee, `unknown function '${callee.name}'`);
      }
      // Phase 1.5-3.5e: any other expression that types as a fn value.
      const ct = this.inferType(callee);
      if (ct.kind === "fn") return ct.returnType;
      unsupported(callee, "call target");
    }
    if (expr.kind === "new_expr") {
      if (expr.callee.kind !== "ident") {
        throw new CodegenError(expr, "only `new Map<K, V>()` and `new Set<T>()` are supported");
      }
      const name = expr.callee.name;
      if (name === "Map") {
        if (expr.args.length !== 0) {
          throw new CodegenError(expr, "Map() constructor arguments are unsupported");
        }
        if (expr.typeArgs.length !== 2) {
          throw new CodegenError(expr, "Map<K, V> requires exactly two type arguments");
        }
        const k = this.typeFromAnnotation(expr.typeArgs[0]!, expr, g_currentModule!);
        const v = this.typeFromAnnotation(expr.typeArgs[1]!, expr, g_currentModule!);
        const t = mapOf(k, v);
        if (!t) throw new CodegenError(expr, `no Map monomorph for key=${typeIdent(k)}, value=${typeIdent(v)}`);
        this.recordMapMonomorph(t);
        return t;
      }
      if (name === "Set") {
        return this.resolveSetConstructorType(expr, undefined);
      }
      if (this.genericClasses.has(name)) {
        return this.instantiateGenericClass(name, expr.typeArgs, expr, g_currentModule!);
      }
      if (this.classes.has(name)) {
        if (expr.typeArgs.length > 0) {
          throw new CodegenError(expr, `class '${name}' takes no type arguments`);
        }
        return classOf(name);
      }
      if (this.interfaces.has(name)) {
        throw new CodegenError(expr, `cannot \`new\` an interface '${name}'; instantiate an implementing class instead`);
      }
      throw new CodegenError(expr, `\`new ${name}\` is unsupported`);
    }
    unsupported(expr, "expression");
  }

  private checkAssignTarget(target: Expr, anchor: { pos: number }): void {
    if (target.kind === "ident") {
      const bMaybe = this.scope.lookup(target.name);
      if (bMaybe === undefined) {
        throw new CodegenError(target, `unknown identifier '${target.name}'`);
      }
      const b = bMaybe;
      if (b.isConst) {
        throw new CodegenError(anchor, `cannot assign to const '${target.name}'`);
      }
      return;
    }
    if (target.kind === "elem_access") {
      // `const arr = [...]` rebinds the binding, not the storage — element
      // assignment mutates through the pointer and is always allowed.
      const baseType = this.inferType(target.receiver);
      if (!isArrayType(baseType)) {
        throw new CodegenError(target, `index assignment is only supported on Array (got ${typeIdent(baseType)})`);
      }
      return;
    }
    if (target.kind === "prop_access") {
      // Compound assignment lowers to `(base)->field op= rhs`, which evaluates
      // `base` once in C. We still restrict the base to side-effect-free forms
      // so that a future lowering swap doesn't surprise anyone.
      if (!this.isSafeLvalueBase(target.receiver)) {
        throw new CodegenError(target, "property assignment requires a simple base (identifier, `this`, or chained property access)");
      }
      const baseType = this.inferType(target.receiver);
      if (isInterfaceType(baseType)) {
        const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
        if (!iface.fields.has(target.name)) {
          if (iface.methods.has(target.name)) {
            throw new CodegenError(target, `cannot assign to method '${target.name}'`);
          }
          throw new CodegenError(target, `interface '${iface.name}' has no field '${target.name}'`);
        }
        return;
      }
      // Phase 1.5-6 prep #18: a common field is readable off an unnarrowed
      // dunion, but a write would have to pick a variant (the field sits at a
      // variant-specific offset), so narrowing is required first.
      if (baseType.kind === "dunion") {
        throw new CodegenError(target, `cannot assign to '.${target.name}' on discriminated union ${typeIdent(baseType)} - narrow it first with \`switch (x.${baseType.discriminator})\``);
      }
      if (!isClassType(baseType)) {
        throw new CodegenError(target, `property assignment is only supported on class instances or interface values (got ${typeIdent(baseType)})`);
      }
      const cls = this.classes.get(classNameOf(baseType)!)!;
      if (!cls.fields.has(target.name)) {
        if (cls.methods.has(target.name)) {
          throw new CodegenError(target, `cannot assign to method '${target.name}'`);
        }
        throw new CodegenError(target, `class '${cls.name}' has no field '${target.name}'`);
      }
      return;
    }
    throw new CodegenError(anchor, "assignment target must be an identifier, array index, or property access");
  }

  private isSafeLvalueBase(expr: Expr): boolean {
    if (expr.kind === "ident") return true;
    if (expr.kind === "this_expr") return true;
    if (expr.kind === "paren_expr") return this.isSafeLvalueBase(expr.inner);
    if (expr.kind === "prop_access") return this.isSafeLvalueBase(expr.receiver);
    return false;
  }

  private expectType(expr: Expr, expected: TopazType): void {
    // Phase 1.5-3e: string literal types accept a matching string literal
    // expression directly (inferType returns T_STRING for literals, so the
    // assignability check would otherwise fail). Discriminator-field assigns
    // in constructors and discriminated-union case labels both flow through
    // here.
    if (expected.kind === "string_literal") {
      const lit = stringLitText(expr);
      if (lit !== undefined && lit === expected.value) {
        return;
      }
    }
    // Phase 1.5-3.5g-array-fn: arrows without annotations need the expected fn
    // type to type-check (the unannotated `inferType` would throw). Mirror the
    // contextual path in emitWithExpected so `=` / `[i] = ` / `.push(arrow)`
    // see the same validation rules.
    if (expr.kind === "arrow_expr" && expected.kind === "fn") {
      const actual = this.inferArrowType(expr, expected);
      if (typeEq(actual, expected)) return;
      throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(actual)}`);
    }
    const actual = this.inferType(expr);
    if (typeEq(actual, expected)) return;
    if (this.isAssignableTo(actual, expected)) return;
    throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(actual)}`);
  }

  // Phase 1.4b: class implementing an interface is the only implicit
  // conversion in the language. Same-type and class -> declared-interface
  // count as assignable. (No interface -> interface, no narrowing, no scalar
  // widening — divergence from TS structural typing.)
  // Phase 1.5-3b: union widening (T assignable to `T | undefined`) and
  // narrowing-free union actual (every variant must be assignable to expected,
  // used mainly to reject `T | undefined` flowing into a non-optional sink).
  private isAssignableTo(actual: TopazType, expected: TopazType): boolean {
    if (typeEq(actual, expected)) return true;
    if (expected.kind === "union") {
      for (const v of expected.variants) {
        if (this.isAssignableTo(actual, v)) return true;
      }
      return false;
    }
    if (actual.kind === "union") {
      for (const v of actual.variants) {
        if (!this.isAssignableTo(v, expected)) return false;
      }
      return true;
    }
    if (isInterfaceType(expected) && isClassType(actual)) {
      return this.classImplements(classNameOf(actual)!, interfaceNameOf(expected)!);
    }
    // Phase 1.5-3e: string_literal "X" widens to string. Narrowing the other
    // direction (string -> string_literal) is rejected here; emitWithExpected
    // accepts a matching string-literal expression separately.
    if (actual.kind === "string_literal" && expected.kind === "string") {
      return true;
    }
    // Phase 1.5-3e: a class is assignable to a discriminated union when the
    // dunion's variants list it AND the class's discriminator field matches
    // the dunion's. Coercion wraps the class pointer in the fat struct.
    if (expected.kind === "dunion" && isClassType(actual)) {
      const cname = classNameOf(actual)!;
      return expected.variants.includes(cname);
    }
    // Phase 1.5-6 prep #23: dunion -> wider dunion widening. A dunion value is
    // assignable to another dunion when discriminators match and its variant
    // set is a subset of the target's. Both share the `{ <disc>; void *data; }`
    // fat layout, so the value is layout-compatible; coercion only re-wraps the
    // same kind + payload into the wider typedef.
    if (expected.kind === "dunion" && actual.kind === "dunion") {
      if (actual.discriminator !== expected.discriminator) return false;
      for (const v of actual.variants) {
        if (!expected.variants.includes(v)) return false;
      }
      return true;
    }
    return false;
  }

  // Type-check `expr` against `expected` and emit C source, inserting class ->
  // interface coercion (fat pointer compound literal) when needed. Use this
  // helper at every value-passing site (variable init, call argument, return
  // statement, assignment RHS) where the expected type is known.
  private emitWithExpected(expr: Expr, expected: TopazType): string {
    // Phase 1.5-3b: the literal `undefined` lowers based on the expected
    // container type (NULL pointer for reference, fat pointer with .data=NULL
    // for interface). Without a `T | undefined` expected this is a type error.
    if (expr.kind === "undefined_lit") {
      return this.emitUndefinedLiteral(expected, expr);
    }
    // Phase 1.5-6 prep #25: thread the expected type into both ternary arms so
    // each coerces to it (class -> interface / dunion, T -> T | undefined) and
    // the two C operands share a type. Must run before the inferType fallback,
    // which has no contextual target to coerce against.
    if (expr.kind === "ternary_expr") {
      return this.emitConditional(expr, expected);
    }
    // Phase 1.5-3.5e: arrows pick up param/return types contextually from the
    // expected fn type when annotations are missing. Pass expected through so
    // `let f: (n: number) => number = (n) => n + 1` works.
    if (expr.kind === "arrow_expr") {
      if (expected.kind === "fn") {
        return this.emitArrowFunction(expr, expected);
      }
      const actual = this.inferArrowType(expr, undefined);
      const raw = this.emitArrowFunction(expr, undefined);
      return this.applyCoercion(raw, actual, expected, expr);
    }
    // Phase 1.5-3e: an expected string_literal accepts the matching literal
    // expression (the value flows in as plain string at runtime, so the
    // generated C is identical to the literal emit).
    if (expected.kind === "string_literal") {
      const lit = stringLitText(expr);
      if (lit !== undefined) {
        if (lit !== expected.value) {
          throw new CodegenError(
            expr,
            `type mismatch: expected ${typeIdent(expected)}, got string literal "${lit}"`,
          );
        }
        return this.emitStringLiteralText(lit, expr);
      }
    }
    if (expr.kind === "array_lit") {
      // Array literal element types aren't interfaces (no Array<Interface> in
      // 1.4b), so no coercion is needed at the array itself.
      return this.emitArrayLiteral(expr, expected);
    }
    if (expr.kind === "new_expr") {
      // Bare `new Map()` / `new Set()` carries no type info; thread expected
      // through as context. Interface widening is impossible for Map/Set, so
      // forwarding expected unmodified is safe.
      const isBareMapSet =
        expr.callee.kind === "ident" &&
        (expr.callee.name === "Map" || expr.callee.name === "Set") &&
        expr.typeArgs.length === 0;
      if (isBareMapSet) {
        return this.emitNewExpression(expr, expected);
      }
      const newType = this.inferType(expr);
      // emitNewExpression only uses `expected` for bare `new Map()` / `new
      // Set()` context typing; suppress that when expected is interface so we
      // keep the class type and let coercion below wrap it.
      const ctx = isInterfaceType(expected) ? undefined : expected;
      const raw = this.emitNewExpression(expr, ctx);
      return this.applyCoercion(raw, newType, expected, expr);
    }
    // Phase 1.5-6 prep: object literal expression `{ a: 1, b: "x" }` lowers to
    // an anonymous-class positional ctor call. Requires a contextual anonymous
    // class type (alias resolves to an anon class). property order in the
    // source is irrelevant — args are emitted in field declaration order
    // (alphabetical, see recordAnonClass). All fields are required and only
    // plain `name: value` property assignments are accepted; shorthand,
    // method shorthand, getter / setter, spread, and computed keys are
    // rejected. Non-anon expected types (concrete class / iface / scalar /
    // container) reject the literal here.
    if (expr.kind === "object_lit") {
      // Phase 1.5-6 prep #16: `dunion | undefined` (or `anon | undefined`)
      // contextual target (e.g. `let b: ForOfBinding | undefined = { ... }`).
      // Strip the `undefined` variant, emit the literal against the inner type
      // (dunion branch below or the anon-class fallthrough), then widen via
      // applyCoercion. The widening is a no-op on the C representation: the
      // dunion / anon-class value is a fat struct / pointer whose shape already
      // matches the `T | undefined` slot (see emitUndefinedLiteral's dunion
      // `.data == NULL` sentinel and applyCoercion's union branch).
      if (expected.kind === "union" && containsUndefined(expected)) {
        const inner = withoutUndefined(expected);
        if (inner) {
          const innerC = this.emitWithExpected(expr, inner);
          return this.applyCoercion(innerC, inner, expected, expr);
        }
      }
      // Phase 1.5-6 prep #11: dunion contextual target. Find the discriminator
      // property (`kind: "..."`) in the literal, narrow to the variant class
      // whose discriminator string-literal field matches, recurse with the
      // variant as `expected`, and wrap the result in class -> dunion coercion.
      // Only anon-class variants are supported here (concrete-class variants
      // require positional `new C(...)` because field-order in the literal may
      // diverge from the ctor parameter order).
      if (expected.kind === "dunion") {
        const disc = expected.discriminator;
        let kindProp: { value: Expr; pos: number; end: number } | undefined;
        for (const prop of expr.props) {
          if (prop.kind === "prop_kv" && prop.name === disc) {
            kindProp = prop;
            break;
          }
        }
        if (!kindProp) {
          throw new CodegenError(
            expr,
            `object literal for ${typeIdent(expected)} must include discriminator property '${disc}: "..."'`,
          );
        }
        const kindValue = stringLitText(kindProp.value);
        if (kindValue === undefined) {
          throw new CodegenError(
            kindProp,
            `discriminator '${disc}' must be a plain string literal to select a ${typeIdent(expected)} variant`,
          );
        }
        let matchedVariant: string | undefined;
        for (const variantName of expected.variants) {
          const info = this.classes.get(variantName);
          if (!info) continue;
          const field = info.fields.get(disc);
          if (!field || field.kind !== "string_literal") continue;
          if (field.value === kindValue) {
            matchedVariant = variantName;
            break;
          }
        }
        if (!matchedVariant) {
          throw new CodegenError(
            kindProp,
            `no variant of ${typeIdent(expected)} has ${disc}="${kindValue}"`,
          );
        }
        if (!this.isAnonClassName(matchedVariant)) {
          throw new CodegenError(
            expr,
            `cannot use object literal for ${typeIdent(expected)} variant '${matchedVariant}' - concrete class variant requires \`new ${matchedVariant}(...)\``,
          );
        }
        const variantType: TopazType = { kind: "class", name: matchedVariant };
        const inner = this.emitWithExpected(expr, variantType);
        return this.applyCoercion(inner, variantType, expected, expr);
      }
      if (!isClassType(expected) || !this.isAnonClassName(classNameOf(expected)!)) {
        throw new CodegenError(
          expr,
          `object literal expression requires a contextually typed anonymous-class target, got ${typeIdent(expected)}`,
        );
      }
      const className = classNameOf(expected)!;
      const info = this.classes.get(className)!;
      const seen = new Set<string>();
      const valuesByField = new Map<string, Expr>();
      for (const prop of expr.props) {
        let fname: string;
        let valueExpr: Expr;
        if (prop.kind === "prop_kv") {
          fname = prop.name;
          valueExpr = prop.value;
        } else if (prop.kind === "prop_shorthand") {
          // Phase 1.5-6 prep: `{ x }` desugars to `{ x: x }` — the property name
          // doubles as an identifier reference resolved in the current scope, so
          // the value expression is just an ident reading `x`. `{ x = default }`
          // (objectAssignmentInitializer) is destructuring-target-only syntax
          // and is rejected in convert.
          fname = prop.name;
          valueExpr = { kind: "ident", name: prop.name, pos: prop.pos, end: prop.end };
        } else {
          // prop_spread — method shorthand / getter / setter are rejected in
          // convert; spread reaches here.
          throw new CodegenError(
            prop,
            "object literal only supports `name: value` and `name` shorthand properties (no method shorthand, getter / setter, spread)",
          );
        }
        if (seen.has(fname)) {
          throw new CodegenError(prop, `duplicate property '${fname}' in object literal`);
        }
        seen.add(fname);
        if (!info.fields.has(fname)) {
          throw new CodegenError(prop, `property '${fname}' does not exist on type ${typeIdent(expected)}`);
        }
        valuesByField.set(fname, valueExpr);
      }
      // Phase 1.5-6 prep-optional-param: `f?: T` fields may be omitted; each
      // missing slot auto-fills with the undefined literal of the field's
      // (already-lifted) `T | undefined` type. Required fields still error.
      const missingRequired = info.fieldOrder.filter(
        (f) => !valuesByField.has(f) && !info.optionalFields.has(f),
      );
      if (missingRequired.length > 0) {
        throw new CodegenError(
          expr,
          `object literal is missing required property: ${missingRequired.join(", ")} (for type ${typeIdent(expected)})`,
        );
      }
      const args = info.fieldOrder.map((f) => {
        const fty = info.fields.get(f)!;
        const v = valuesByField.get(f);
        if (v) return this.emitWithExpected(v, fty);
        return this.emitUndefinedLiteral(fty, expr);
      });
      return `topaz_class_${className}_new(${args.join(", ")})`;
    }
    // Phase 1.5-6 prep: IIFE `(() => { ... })(args)` whose arrow lacks a return
    // annotation. Such an arrow has no self-contained type — we don't infer
    // block-body returns — so the plain inferType fallthrough below would throw
    // "arrow requires an explicit return type". But at an emitWithExpected site
    // the call's result type IS the arrow's return type, so supply `expected`
    // contextually (see emitContextualIIFE). Arrows WITH a return annotation
    // type on their own and fall through to the normal call path (their return
    // may differ from `expected`, so we must not override it).
    if (expr.kind === "call_expr" && !expr.optional) {
      let callee: Expr = expr.callee;
      while (callee.kind === "paren_expr") callee = callee.inner;
      if (callee.kind === "arrow_expr" && !callee.returnType) {
        return this.emitContextualIIFE(expr, callee, expected);
      }
    }
    const actual = this.inferType(expr);
    // Phase 1.5-6 prep: `void` has no value representation, so a void-returning
    // call cannot be assigned, passed, returned, or coerced. Surface this at
    // the use site rather than letting cTypeName(void) blow up later.
    if (actual.kind === "void") {
      throw new CodegenError(expr, `cannot use a \`void\` value (call expression returns void)`);
    }
    const raw = this.emitExpression(expr);
    return this.applyCoercion(raw, actual, expected, expr);
  }

  // Phase 1.5-3b: lower the literal `undefined` for an expected `T | undefined`
  // (or bare `undefined`) target. Caller must have already type-checked.
  // Phase 1.5-3c: scalar `T | undefined` lowers to the predefined absent opt
  // struct (`topaz_opt_absent_<scalar>`).
  // Phase 1.5-6 prep-optional-param: emit a positional arg list against a
  // ParamInfo signature, allowing trailing `?`-marked slots to be omitted. For
  // each omitted slot we synthesize an `undefined` literal of the param type
  // (already lifted to `T | undefined` at collection time). Arity outside
  // [requiredParamCount, params.length] is rejected with the canonical
  // "expects N got M" message; the caller passes the human-readable name.
  private emitCallArgs(
    args: Array<Expr>,
    params: Array<ParamInfo>,
    label: string,
    anchor: { pos: number },
  ): string[] {
    const req = requiredParamCount(params);
    if (args.length < req || args.length > params.length) {
      const want = req === params.length ? `${params.length}` : `${req}..${params.length}`;
      throw new CodegenError(
        anchor,
        `${label} expects ${want} argument(s), got ${args.length}`,
      );
    }
    const out: string[] = [];
    for (let i = 0; i < params.length; i++) {
      const p = params[i]!;
      if (i < args.length) {
        out.push(this.emitWithExpected(args[i]!, p.type));
      } else {
        out.push(this.emitUndefinedLiteral(p.type, anchor));
      }
    }
    return out;
  }

  private emitUndefinedLiteral(expected: TopazType, anchor: { pos: number }): string {
    if (expected.kind === "undefined") {
      // Bare `undefined` target has no observable C representation; emit NULL
      // as a placeholder (the value is never read because nothing else can be
      // assigned to a bare-undefined slot).
      return "NULL";
    }
    if (expected.kind === "union" && containsUndefined(expected)) {
      const inner = withoutUndefined(expected);
      if (!inner) {
        throw new CodegenError(anchor, `cannot lower \`undefined\` for type ${typeIdent(expected)}`);
      }
      if (isScalarType(inner)) {
        return `topaz_opt_absent_${inner.kind}`;
      }
      if (isInterfaceType(inner)) {
        const iname = interfaceNameOf(inner)!;
        return `topaz_iface_${iname}_absent`;
      }
      // Phase 1.5-6 prep #15: dunion absent uses `.data == NULL` sentinel
      // (zero-initialized fat struct — same shape as iface_<I>_absent). The
      // `{0}` compound literal zero-fills both `.kind` (empty topaz_string)
      // and `.data` (NULL).
      if (inner.kind === "dunion") {
        return `((${typeIdent(inner)}){0})`;
      }
      if (isReferenceType(inner)) {
        return `((${cTypeName(inner)})NULL)`;
      }
      throw new CodegenError(
        anchor,
        `cannot use \`undefined\` for type ${typeIdent(expected)}`,
      );
    }
    throw new CodegenError(
      anchor,
      `type mismatch: expected ${typeIdent(expected)}, got undefined`,
    );
  }

  private applyCoercion(raw: string, actual: TopazType, expected: TopazType, anchor: { pos: number }): string {
    if (typeEq(actual, expected)) return raw;
    // Phase 1.5-3b: widening T -> `T | undefined`. For reference / interface
    // representations the C value is identical (a pointer or a fat pointer),
    // so coercion is a no-op once the inner type matches.
    // Phase 1.5-3c: widening a scalar T into `T | undefined` wraps the value
    // in the opt struct via `topaz_opt_wrap_<scalar>`.
    if (expected.kind === "union" && containsUndefined(expected)) {
      const inner = withoutUndefined(expected);
      if (inner && this.isAssignableTo(actual, inner)) {
        const coerced = this.applyCoercion(raw, actual, inner, anchor);
        if (isScalarType(inner)) {
          return `topaz_opt_wrap_${inner.kind}(${coerced})`;
        }
        return coerced;
      }
    }
    if (isInterfaceType(expected) && isClassType(actual)) {
      const iname = interfaceNameOf(expected)!;
      const cname = classNameOf(actual)!;
      if (!this.classImplements(cname, iname)) {
        throw new CodegenError(
          anchor,
          `class '${cname}' does not implement interface '${iname}'`,
        );
      }
      return `((topaz_iface_${iname}){ .data = ${raw}, .vt = &topaz_iface_${iname}_for_${cname}_vt })`;
    }
    // Phase 1.5-3e: class -> dunion. Read the discriminator literal from the
    // class's field type and synthesize the fat struct. Validation
    // (variants.includes(cname) + literal lookup) already happened in
    // tryMakeDiscriminatedUnion at the union construction site.
    if (expected.kind === "dunion" && isClassType(actual)) {
      const cname = classNameOf(actual)!;
      if (!expected.variants.includes(cname)) {
        throw new CodegenError(
          anchor,
          `class '${cname}' is not a variant of ${typeIdent(expected)}`,
        );
      }
      const literal = this.dunionLiteralFor(expected, cname);
      const litExpr = this.encodeStringLiteralCompound(literal);
      return `((${typeIdent(expected)}){ ${litExpr}, (void *)(${raw}) })`;
    }
    // Phase 1.5-6 prep #23: dunion -> wider dunion. Both typedefs are
    // `{ topaz_string <disc>; void *data; }`, so the narrow value's
    // discriminator + payload are re-wrapped into the wider struct. Bind the
    // (possibly side-effectful) source once in a statement expression; the
    // runtime `.kind` already carries the correct variant tag.
    if (expected.kind === "dunion" && actual.kind === "dunion") {
      if (actual.discriminator !== expected.discriminator) {
        throw new CodegenError(anchor, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(actual)}`);
      }
      for (const v of actual.variants) {
        if (!expected.variants.includes(v)) {
          throw new CodegenError(anchor, `class '${v}' is not a variant of ${typeIdent(expected)}`);
        }
      }
      const id = this.tmpCounter++;
      const tmp = `__topaz_dw_${id}`;
      return `({ ${typeIdent(actual)} ${tmp} = ${raw}; (${typeIdent(expected)}){ ${tmp}.${actual.discriminator}, ${tmp}.data }; })`;
    }
    // Phase 1.5-3e: string_literal "X" widens to plain string (the literal
    // already has the right C representation, so no transformation needed).
    if (actual.kind === "string_literal" && expected.kind === "string") {
      return raw;
    }
    throw new CodegenError(anchor, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(actual)}`);
  }

  // Helper for emitting a topaz_string compound literal for an ASCII string
  // value. Shared between dunion construction and (future) literal sites.
  private encodeStringLiteralCompound(value: string): string {
    let escaped = '"';
    let byteLen = 0;
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0x80) {
        throwInternalCodegenError(`encodeStringLiteralCompound: non-ASCII byte in '${value}'`);
      }
      if (c === 0x22) escaped += '\\"';
      else if (c === 0x5c) escaped += "\\\\";
      else if (c === 0x0a) escaped += "\\n";
      else if (c === 0x0d) escaped += "\\r";
      else if (c === 0x09) escaped += "\\t";
      else if (c === 0x00) escaped += "\\0";
      else if (c < 0x20 || c === 0x7f) {
        escaped += `\\x${lowerHexByte2(c)}`;
      } else {
        escaped += String.fromCharCode(c);
      }
      byteLen++;
    }
    escaped += '"';
    return `((topaz_string){ ${escaped}, ${byteLen} })`;
  }
}

export function codegen(sourceFiles: Array<SourceModule>): string {
  const emitter = new Emitter();
  return emitter.emit(sourceFiles);
}

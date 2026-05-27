import * as ts from "typescript";

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
  | { kind: "dunion"; variants: readonly string[]; discriminator: string }
  | { kind: "union"; variants: readonly TopazType[] }
  | { kind: "fn"; params: readonly ParamInfo[]; returnType: TopazType }
  | { kind: "iter"; elem: TopazType };

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

const TOPAZ_THIS = "__topaz_this";

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
    if (nonUndef.length === 1) return isReferenceType(nonUndef[0]!);
    return false;
  }
  return isArrayType(t) || isMapType(t) || isSetType(t) || isClassType(t);
}

// Phase 1.5-3b: helpers for union/undefined.
function containsUndefined(t: TopazType): boolean {
  if (t.kind === "undefined") return true;
  if (t.kind === "union") return t.variants.some(isUndefinedType);
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
  if (a.kind === "union") return a.variants.some((v) => typesOverlap(v, b));
  if (b.kind === "union") return b.variants.some((v) => typesOverlap(a, v));
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
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "number":
    case "boolean":
    case "string":
    case "undefined":
    case "unknown":
    case "void":
      return true;
    case "string_literal":
      return a.value === (b as Extract<TopazType, { kind: "string_literal" }>).value;
    case "array":
      return typeEq(a.elem, (b as Extract<TopazType, { kind: "array" }>).elem);
    case "map": {
      const bm = b as Extract<TopazType, { kind: "map" }>;
      return typeEq(a.key, bm.key) && typeEq(a.value, bm.value);
    }
    case "set":
      return typeEq(a.elem, (b as Extract<TopazType, { kind: "set" }>).elem);
    case "class":
      return a.name === (b as Extract<TopazType, { kind: "class" }>).name;
    case "iface":
      return a.name === (b as Extract<TopazType, { kind: "iface" }>).name;
    case "dunion": {
      const bd = b as Extract<TopazType, { kind: "dunion" }>;
      if (a.discriminator !== bd.discriminator) return false;
      if (a.variants.length !== bd.variants.length) return false;
      for (let i = 0; i < a.variants.length; i++) {
        if (a.variants[i] !== bd.variants[i]) return false;
      }
      return true;
    }
    case "union": {
      const bu = b as Extract<TopazType, { kind: "union" }>;
      if (a.variants.length !== bu.variants.length) return false;
      // variants are canonical-sorted by makeUnion, so positional compare.
      for (let i = 0; i < a.variants.length; i++) {
        if (!typeEq(a.variants[i]!, bu.variants[i]!)) return false;
      }
      return true;
    }
    case "fn": {
      // Phase 1.5-3.5e: positional param comparison; param names are
      // informational only. Two fn types are equal when arity matches, each
      // param type is equal positionally, and return types are equal.
      const bf = b as Extract<TopazType, { kind: "fn" }>;
      if (a.params.length !== bf.params.length) return false;
      for (let i = 0; i < a.params.length; i++) {
        if (!typeEq(a.params[i]!.type, bf.params[i]!.type)) return false;
      }
      return typeEq(a.returnType, bf.returnType);
    }
    case "iter":
      return typeEq(a.elem, (b as Extract<TopazType, { kind: "iter" }>).elem);
  }
}

// Phase 1.5-3b: build a union, flattening nested unions, deduplicating by
// typeKey, and sorting variants for canonical comparison. Single-variant
// "unions" collapse to the inner type. Throws on empty input.
function makeUnion(variants: readonly TopazType[]): TopazType {
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
  const sorted = Array.from(dedup.values()).sort((a, b) => {
    const ka = typeKey(a);
    const kb = typeKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  if (sorted.length === 0) throw new Error("makeUnion: empty variants");
  if (sorted.length === 1) return sorted[0]!;
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
  switch (t.kind) {
    case "number":
    case "boolean":
    case "string":
      return t.kind;
    case "class":
      return `class_${t.name}`;
    case "iface":
      return `iface_${t.name}`;
    case "dunion":
      // Phase 1.5-6 prep #8: discriminated class union as a container element.
      // The dunion typedef is `{ topaz_string kind; void *data; }` (emitted in
      // emitDunionTypedef), so storage is a single struct value — no nested
      // pointer indirection. Variants are required to be concrete classes;
      // recursive dunion/union variants are rejected at typeFromAnnotation.
      // Tag is typeIdent stripped of the `topaz_` prefix so the resulting
      // `topaz_array_dunion_A_or_B` / `topaz_map_<K>_dunion_A_or_B` /
      // `topaz_set_dunion_A_or_B` mangle is unique per variant set.
      return typeIdent(t).slice("topaz_".length);
    case "undefined":
      throw new Error("elemTag: bare undefined cannot be a container element");
    case "union":
      throw new Error(`elemTag: union ${typeIdent(t)} cannot be a container element (1.5-3b)`);
    case "fn":
      // Phase 1.5-3.5g-array-fn: fn elems are tagged like classes (the
      // arity-prefixed identifier from typeIdent stripped of `topaz_`).
      // Map / Set still reject fn at mapOf / setOf (eq / hash undefined).
      return typeIdent(t).slice("topaz_".length);
    case "iter":
      // Phase 1.5-3.5g-iterator: Iterator<T> values are single-pass and own
      // arena-allocated state — storing them in Array / Map / Set would need
      // ownership semantics we don't model. Always reject at container site.
      throw new Error(`elemTag: iterator type ${typeIdent(t)} cannot be a container element (1.5-3.5g)`);
    default:
      throw new Error(`elemTag: container element kind=${(t as TopazType).kind} is unsupported (no nested containers yet)`);
  }
}

function scalarTag(t: TopazType): string {
  if (t.kind !== "number" && t.kind !== "boolean" && t.kind !== "string") {
    throw new Error(`scalarTag: expected scalar, got kind=${t.kind}`);
  }
  return t.kind;
}

// Monomorph short-name tags (used to compose function/struct names like
// `topaz_array_<short>_push`). Each matches the substring after the container
// prefix from the pre-1.4c-3 string union.
function arrayShortName(t: TopazType): string {
  if (t.kind !== "array") throw new Error(`arrayShortName: not an array, kind=${t.kind}`);
  return elemTag(t.elem);
}

function mapShortName(t: TopazType): string {
  if (t.kind !== "map") throw new Error(`mapShortName: not a map, kind=${t.kind}`);
  return `${scalarTag(t.key)}_${elemTag(t.value)}`;
}

function setShortName(t: TopazType): string {
  if (t.kind !== "set") throw new Error(`setShortName: not a set, kind=${t.kind}`);
  return elemTag(t.elem);
}

// Canonical C identifier for a type — the same string the pre-1.4c-3 string
// union used as its value. Used both as the C type name (for non-reference
// types) and as the display form in error messages and Map/Set keys.
// Phase 1.5-3b: `topaz_undefined` for the sentinel, `topaz_union_a_or_b` for
// canonical-sorted unions (used as a typeKey, not as a C type — the C side
// for `T | undefined` collapses to T's representation in cTypeName).
function typeIdent(t: TopazType): string {
  switch (t.kind) {
    case "number":
    case "boolean":
    case "string":
      return `topaz_${t.kind}`;
    case "undefined":
      return `topaz_undefined`;
    case "unknown":
      return `topaz_unknown`;
    case "void":
      return `topaz_void`;
    case "string_literal":
      return `topaz_string_literal_${t.value}`;
    case "array":
      return `topaz_array_${arrayShortName(t)}`;
    case "map":
      return `topaz_map_${mapShortName(t)}`;
    case "set":
      return `topaz_set_${setShortName(t)}`;
    case "class":
      return `topaz_class_${t.name}`;
    case "iface":
      return `topaz_iface_${t.name}`;
    case "dunion":
      return `topaz_dunion_${[...t.variants].sort().join("_or_")}`;
    case "union":
      return `topaz_union_${t.variants.map((v) => typeIdent(v).slice("topaz_".length)).join("_or_")}`;
    case "fn": {
      // Phase 1.5-3.5e: arity prefix `a<N>` keeps different-arity signatures
      // unambiguous even when param mangling contains `__`; the `__to__`
      // separator splits param list from return type.
      const paramIds = t.params.map((p) => typeIdent(p.type).slice("topaz_".length)).join("__");
      const retId = typeIdent(t.returnType).slice("topaz_".length);
      const paramSection = paramIds.length > 0 ? `__${paramIds}` : "";
      return `topaz_fn_a${t.params.length}${paramSection}__to__${retId}`;
    }
    case "iter":
      return `topaz_iter_${elemTag(t.elem)}`;
  }
}

// Stable key for using TopazType as a Map/Set key. Identical to typeIdent.
function typeKey(t: TopazType): string {
  return typeIdent(t);
}

// Phase 1.5-3.5e: capture-analysis filter for identifiers that name compile-
// time concepts rather than runtime values (so they should never be treated
// as captures even if they appear inside an arrow body).
function isBuiltinName(name: string): boolean {
  // `undefined` lowers via emitUndefinedLiteral, never via a binding lookup.
  // `console` is a synthetic namespace handled directly in emitCall.
  return name === "undefined" || name === "console";
}

// Phase 1.5-3.5e: an identifier node is a "reference position" if reading
// the identifier yields a value (vs. naming a property, parameter name, type
// reference, etc.). Capture analysis only follows reference positions; the
// other identifier sites either re-bind a name (declaration) or address a
// member that has no scope binding (property access RHS).
function isReferencePosition(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return true;
  // Property access RHS (`obj.name`) and method-call RHS — `name` is a member
  // lookup, not a scope binding.
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  // Object literal key, property assignment key, shorthand are not scope refs.
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  // Parameter name, variable declaration name, binding name, class member
  // name, function name, etc. are declarations, not references.
  if (ts.isParameter(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return false;
  if (ts.isClassDeclaration(parent) && parent.name === node) return false;
  if (ts.isInterfaceDeclaration(parent) && parent.name === node) return false;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return false;
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return false;
  if (ts.isPropertySignature(parent) && parent.name === node) return false;
  if (ts.isMethodSignature(parent) && parent.name === node) return false;
  // Type references / qualified names — purely compile-time.
  if (ts.isTypeReferenceNode(parent)) return false;
  if (ts.isQualifiedName(parent)) return false;
  // import/export bits.
  if (ts.isImportSpecifier(parent)) return false;
  if (ts.isExportSpecifier(parent)) return false;
  return true;
}

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
    throw new Error("cTypeName: bare `undefined` has no C representation (only `T | undefined` does)");
  }
  // Phase 1.5-6 prep: `void` has no C value representation. cTypeName is the
  // value-type helper; return-type slots use cReturnTypeName below, which
  // returns the bare "void" keyword. Reaching cTypeName with `void` means a
  // caller leaked a void type into a value position (variable annotation,
  // container element, union, fn param, etc.) — that should be rejected with
  // a CodegenError by the upstream check, but throwing here keeps the
  // invariant explicit.
  if (t.kind === "void") {
    throw new Error("cTypeName: `void` is only valid as a function / method return type");
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
      throw new Error(`cTypeName: union ${typeIdent(t)} is not \`T | undefined\` (1.5-3b only supports T | undefined)`);
    }
    const inner = nonUndef[0]!;
    if (isScalarType(inner)) {
      return `topaz_opt_${inner.kind}`;
    }
    if (!isReferenceType(inner) && inner.kind !== "iface") {
      throw new Error(
        `cTypeName: \`T | undefined\` requires T to be a scalar, reference (array/map/set/class), or interface; got ${typeIdent(inner)}`,
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
  throw new Error(`iterContainerTag: unsupported container kind=${t.kind}`);
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
  throw new Error(`zeroValueOfElem: unsupported ${typeIdent(elem)}`);
}

type Binding = { type: TopazType; isConst: boolean };

class CodegenError extends Error {
  constructor(node: ts.Node, message: string) {
    const sf = node.getSourceFile();
    if (sf) {
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      super(`${sf.fileName}:${line + 1}:${character + 1}: ${message}`);
    } else {
      super(message);
    }
  }
}

function unsupported(node: ts.Node, what: string): never {
  throw new CodegenError(node, `unsupported ${what} (${ts.SyntaxKind[node.kind]})`);
}

// Phase 1.5-2: top-level の class / interface / function 宣言で `export` 修飾子
// のみ受け入れる。`export default` / `declare` / `abstract` 等はこれまで通り
// 未対応エラーで落とす。modifier を持ち得ない宣言にも安全に呼べる。
function validateExportableModifiers(
  node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> },
  kindLabel: string,
): void {
  if (!node.modifiers) return;
  for (const m of node.modifiers) {
    if (m.kind === ts.SyntaxKind.ExportKeyword) continue;
    if (m.kind === ts.SyntaxKind.DefaultKeyword) {
      throw new CodegenError(m, `\`export default\` is unsupported (Phase 1.5-2)`);
    }
    throw new CodegenError(
      m,
      `${kindLabel} modifier '${ts.SyntaxKind[m.kind]}' is unsupported`,
    );
  }
}

class Scope {
  private stack: Map<string, Binding>[] = [new Map()];
  // Phase 1.5-3d: parallel narrowing overlay. Each frame holds optional
  // narrowed types for already-declared identifiers; lookup prefers the
  // innermost narrowing at-or-above the binding's frame.
  private narrowings: Map<string, TopazType>[] = [new Map()];
  // Phase 1.5-3.5e: arrow function bodies push a barrier so their identifier
  // lookups don't accidentally pierce through to outer locals — captures must
  // route through the env struct instead. The barrier records the frame index
  // below which `lookup` / `lookupBase` stop; capture analysis uses
  // `lookupAcrossBarrier` to look up outer types while the barrier is active.
  private barriers: number[] = [];

  push(): void {
    this.stack.push(new Map());
    this.narrowings.push(new Map());
  }

  pop(): void {
    this.stack.pop();
    this.narrowings.pop();
  }

  pushBarrier(): void {
    this.barriers.push(this.stack.length);
  }

  popBarrier(): void {
    this.barriers.pop();
  }

  declare(name: string, type: TopazType, isConst: boolean, node: ts.Node): void {
    const top = this.stack[this.stack.length - 1]!;
    if (top.has(name)) {
      throw new CodegenError(node, `redeclaration of '${name}'`);
    }
    top.set(name, { type, isConst });
  }

  lookup(name: string): Binding | undefined {
    const floor = this.barriers.length > 0 ? this.barriers[this.barriers.length - 1]! : 0;
    for (let i = this.stack.length - 1; i >= floor; i--) {
      const b = this.stack[i]!.get(name);
      if (b) {
        for (let j = this.narrowings.length - 1; j >= i; j--) {
          const n = this.narrowings[j]!.get(name);
          if (n) return { type: n, isConst: b.isConst };
        }
        return b;
      }
    }
    return undefined;
  }

  // Phase 1.5-3c: look up the original (un-narrowed) binding. Identifier
  // emission needs both: `lookup` for the logical type, `lookupBase` to know
  // the C representation (for scalar opt structs, narrowed reads append
  // `.value` while assignments target the whole struct).
  lookupBase(name: string): Binding | undefined {
    const floor = this.barriers.length > 0 ? this.barriers[this.barriers.length - 1]! : 0;
    for (let i = this.stack.length - 1; i >= floor; i--) {
      const b = this.stack[i]!.get(name);
      if (b) return b;
    }
    return undefined;
  }

  // Phase 1.5-3.5e: outer-scope lookup that ignores any active barrier. Only
  // capture analysis uses this — body emission must go through `lookup` so
  // missing captures show up as "unknown identifier" rather than silently
  // referencing the outer variable.
  lookupAcrossBarrier(name: string): Binding | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const b = this.stack[i]!.get(name);
      if (b) return b;
    }
    return undefined;
  }

  // Phase 1.5-3d: install a narrowed type for an existing identifier on the
  // current top frame. Caller is responsible for pushing a new frame first
  // (typically via `push()` before entering an if-branch).
  narrow(name: string, type: TopazType): void {
    this.narrowings[this.narrowings.length - 1]!.set(name, type);
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

function requiredParamCount(params: readonly ParamInfo[]): number {
  let n = params.length;
  while (n > 0 && params[n - 1]!.isOptional) n--;
  return n;
}

type MethodInfo = {
  params: ParamInfo[];
  returnType: TopazType;
  decl: ts.MethodDeclaration;
};

type ClassInfo = {
  name: string;
  fields: Map<string, TopazType>;
  fieldOrder: string[];
  // Phase 1.5-6 prep: field initializers (`x: T = init;`) collected here at
  // collectField time, emitted at constructor body head before user statements
  // run. Both explicit and auto-generated zero-arg ctors consume this map.
  fieldInits: Map<string, ts.Expression>;
  // Phase 1.5-6 prep: `decl: undefined` is an auto-synthesized zero-arg
  // constructor for classes that declare only initializer-bearing fields and
  // no explicit ctor (used pervasively by self-hosting code like the Emitter
  // class). The anchor for errors falls back to `info.decl`.
  ctor: { params: ParamInfo[]; decl: ts.ConstructorDeclaration | undefined } | undefined;
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
  // an error anchor (passed to CodegenError), so widening the type is safe.
  decl: ts.ClassDeclaration | ts.TypeLiteralNode;
};

type InterfaceMethodSig = {
  params: ParamInfo[];
  returnType: TopazType;
  decl: ts.MethodSignature;
};

type InterfaceInfo = {
  name: string;
  fields: Map<string, TopazType>;
  fieldOrder: string[];
  methods: Map<string, InterfaceMethodSig>;
  methodOrder: string[];
  decl: ts.InterfaceDeclaration;
};

type FunctionSig = { params: ParamInfo[]; returnType: TopazType };

// Phase 1.4c-2: generic top-level functions. Type parameters live in the AST
// only; we don't resolve param/return types until a call site supplies concrete
// type arguments (explicit or inferred). One MonomorphInfo per realized
// (function, typeArgs) tuple.
type GenericFunctionInfo = {
  name: string;
  typeParams: string[];
  decl: ts.FunctionDeclaration;
};

type MonomorphInfo = {
  mangled: string;
  origName: string;
  typeArgs: TopazType[];
  subs: Map<string, TopazType>;
  sig: FunctionSig;
  decl: ts.FunctionDeclaration;
};

// Phase 1.4c-3: generic top-level classes. Same shape as GenericFunctionInfo
// but for classes. Concrete monomorphs land in `this.classes` under the
// mangled name; the original `name` (e.g. "Box") is reserved in
// `genericClasses` so `new Box<...>` / `Box<T>` references can be resolved.
type GenericClassInfo = {
  name: string;
  typeParams: string[];
  decl: ts.ClassDeclaration;
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

// Mangling: stripped of the `topaz_` prefix, joined with `__`. Class/iface
// names already carry a `class_` / `iface_` prefix, so the resulting C
// identifier is unambiguous (e.g. `identity__number`, `pair__class_Box`,
// `first__array_class_Box`).
function mangleTypeArg(t: TopazType): string {
  return typeIdent(t).slice("topaz_".length);
}

function mangleMonomorph(origName: string, args: readonly TopazType[]): string {
  return `${origName}__${args.map(mangleTypeArg).join("__")}`;
}

class Emitter {
  private scope = new Scope();
  private functionSigs = new Map<string, FunctionSig>();
  private classes = new Map<string, ClassInfo>();
  private interfaces = new Map<string, InterfaceInfo>();
  private currentClass: string | undefined;
  private currentReturnType: TopazType | undefined;
  private switchCounter = 0;
  private tmpCounter = 0;
  // Phase 1.4c-1a: each Array<class>/Array<interface> referenced in user code
  // gets a TOPAZ_ARRAY_DEFINE() expansion in the generated C, since the runtime
  // header only preexpands the scalar monomorphs. Keyed by typeKey() so we
  // de-duplicate structurally (TopazType objects compare by reference).
  private arrayMonomorphs = new Map<string, TopazType>();
  // Phase 1.5-3.5g-array-fn: Array<fn> monomorphs live in a separate slot
  // because the TOPAZ_ARRAY_DEFINE expansion references the fn typedef, which
  // is itself emitted after the regular container slot. Splitting them keeps
  // the existing slot ordering invariants intact (container monomorphs ->
  // arrayJoinHelpers -> iter -> fn typedef -> Array<fn> container).
  private arrayFnMonomorphs = new Map<string, TopazType>();
  // Phase 1.5-3.5f-join: Array monomorphs that need a per-(elem) `_join` helper
  // emitted. Keyed by typeKey() of the Array<elem> type. Helpers are generated
  // for scalar elems (number / boolean / string) only; class / iface / nested
  // container elems are rejected at the call site so they never land here.
  private arrayJoinMonomorphs = new Map<string, TopazType>();
  // Phase 1.4c-1b: same idea for Map<K, class|interface> and Set<class|interface>.
  // Maps are tracked by full (K, V) tuple so we get one expansion per combo.
  private mapMonomorphs = new Map<string, TopazType>();
  private setMonomorphs = new Map<string, TopazType>();
  // Phase 1.5-3e: discriminated class unions like `Circle | Square` are
  // emitted as a fat pointer `{ topaz_string kind; void *data; }`. Recorded
  // when typeFromAnnotation lowers the union, expanded in the container slot.
  private dunionMonomorphs = new Map<string, TopazType>();
  // Phase 1.4c-2: generic function declarations (registered but not signed
  // until a call site supplies type arguments), realized monomorphs keyed by
  // mangled name, and a worklist for monomorphs whose body still needs to be
  // emitted. typeParamScope binds the active substitution while emitting a
  // monomorph body (or while resolving its signature).
  private genericFunctions = new Map<string, GenericFunctionInfo>();
  private genericMonomorphs = new Map<string, MonomorphInfo>();
  private genericWorklist: string[] = [];
  private typeParamScope: Map<string, TopazType> | undefined;
  // Phase 1.4c-3: generic class declarations and their realized monomorphs.
  // The mangled name (e.g. "Box__number") is the key into `this.classes` for
  // the substituted ClassInfo; the worklist accumulates monomorphs whose
  // typedef/struct/methods still need to be emitted in the late slots.
  private genericClasses = new Map<string, GenericClassInfo>();
  private classMonomorphs = new Map<string, ClassMonomorphInfo>();
  private classMonomorphWorklist: string[] = [];
  // Phase 1.5-6 prep: `type X = T;` declarations. The RHS is parsed lazily on
  // first reference so a forward-declared alias works; `resolving` flips on
  // during evaluation to catch self-referential cycles (`type A = B; type B = A`).
  // Aliases are erased — they introduce no value-level binding and produce no C
  // identifier — so typeFromAnnotation simply substitutes the resolved TopazType
  // into the call site.
  private typeAliases = new Map<
    string,
    { decl: ts.TypeAliasDeclaration; resolved?: TopazType; resolving: boolean }
  >();
  // Phase 1.5-3.5e: each arrow expression lowers to (a) a static C function
  // `__topaz_arrow_<N>` and (b) optionally an env struct `__topaz_env_<N>`
  // for its captures. arrowDefLines accumulates both halves in source order
  // and is spliced into the arrowDefSlot at end of emit(). captureContext is
  // active only while emitting an arrow body — body identifier lookups
  // consult it after scope.lookup fails.
  private arrowCounter = 0;
  private arrowFwdLines: string[] = [];
  private arrowDefLines: string[] = [];
  private captureContext:
    | { envType: string; envIsEmpty: boolean; captures: Map<string, TopazType> }
    | undefined;

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
  private anonClassByKey = new Map<string, string>(); // canonical key -> mangled name
  private anonClassCounter = 0;
  private recordAnonClass(
    fields: Map<string, TopazType>,
    optionalFields: Set<string>,
    anchor: ts.TypeLiteralNode,
  ): string {
    // Optional markers participate in the canonical key so `{ a: number }` and
    // `{ a?: number }` are *not* deduped to the same anon class (the latter has
    // `a: number | undefined`, so field type already differs — but make it
    // explicit so future field-type changes can't accidentally collapse them).
    const sorted = [...fields.keys()].sort();
    const key = sorted
      .map((f) => `${f}${optionalFields.has(f) ? "?" : ""}:${typeIdent(fields.get(f)!)}`)
      .join(",");
    const existing = this.anonClassByKey.get(key);
    if (existing) return existing;
    const mangled = `anon_${this.anonClassCounter++}`;
    this.anonClassByKey.set(key, mangled);
    const params: ParamInfo[] = sorted.map((f) => ({
      name: f,
      type: fields.get(f)!,
      isOptional: optionalFields.has(f),
    }));
    const fieldsOrdered = new Map<string, TopazType>();
    for (const f of sorted) fieldsOrdered.set(f, fields.get(f)!);
    const info: ClassInfo = {
      name: mangled,
      fields: fieldsOrdered,
      fieldOrder: sorted,
      fieldInits: new Map(),
      ctor: { params, decl: undefined },
      methods: new Map(),
      implements: [],
      optionalFields: new Set(optionalFields),
      decl: anchor,
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
    return /^anon_\d+$/.test(name);
  }

  private recordDunionMonomorph(t: TopazType): void {
    if (t.kind !== "dunion") return;
    this.dunionMonomorphs.set(typeKey(t), t);
  }

  // Phase 1.5-3.5e: each distinct fn signature seen in user code (annotation
  // or arrow expression) gets a typedef + struct expansion emitted in the
  // fn-typedef slot. fn-in-fn signatures are rejected at the annotation site
  // so we never have to chase nested monomorphs.
  private fnMonomorphs = new Map<string, TopazType>();
  private recordFnMonomorph(t: TopazType): void {
    if (t.kind !== "fn") return;
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
  private iterTypedefMonomorphs = new Map<string, TopazType>();
  private iterStateMonomorphs = new Map<string, TopazType>();
  private iterNextMonomorphs = new Map<
    string,
    {
      containerType: TopazType;
      source: "map_values" | "map_keys" | "set_values";
      elemType: TopazType;
      field: "key" | "value";
    }
  >();
  private recordIterMonomorph(
    elemType: TopazType,
    containerType: TopazType,
    source: "map_values" | "map_keys" | "set_values",
    field: "key" | "value",
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
    variants: readonly TopazType[],
    anchor: ts.Node,
  ): TopazType | undefined {
    if (variants.length < 2) return undefined;
    if (!variants.every((v) => v.kind === "class")) return undefined;
    const discriminator = "kind";
    const classNames: string[] = [];
    const seenLiterals = new Set<string>();
    for (const v of variants) {
      const name = (v as Extract<TopazType, { kind: "class" }>).name;
      const cls = this.classes.get(name);
      if (!cls) return undefined;
      const field = cls.fields.get(discriminator);
      if (!field || field.kind !== "string_literal") return undefined;
      if (seenLiterals.has(field.value)) {
        throw new CodegenError(
          anchor,
          `discriminated union: classes '${[...seenLiterals].join("', '")}' and '${name}' both use kind=\"${field.value}\"`,
        );
      }
      seenLiterals.add(field.value);
      classNames.push(name);
    }
    classNames.sort();
    const d: TopazType = { kind: "dunion", variants: classNames, discriminator };
    this.recordDunionMonomorph(d);
    return d;
  }

  // Lookup the string literal value that class `cls` assigns to its
  // discriminator field. Validated at field collection (string_literal type).
  private dunionLiteralFor(unionType: TopazType, cls: string): string {
    if (unionType.kind !== "dunion") {
      throw new Error("dunionLiteralFor: not a dunion");
    }
    const info = this.classes.get(cls);
    if (!info) throw new Error(`dunionLiteralFor: unknown class '${cls}'`);
    const field = info.fields.get(unionType.discriminator);
    if (!field || field.kind !== "string_literal") {
      throw new Error(`dunionLiteralFor: class '${cls}' has no string-literal '${unionType.discriminator}'`);
    }
    return field.value;
  }

  emit(sourceFiles: readonly ts.SourceFile[]): string {
    if (sourceFiles.length === 0) {
      throw new Error("codegen: at least one source file is required");
    }
    const functions: ts.FunctionDeclaration[] = [];
    const classes: ts.ClassDeclaration[] = [];
    const interfaces: ts.InterfaceDeclaration[] = [];
    const aliases: ts.TypeAliasDeclaration[] = [];
    const topLevel: ts.Statement[] = [];
    // Phase 1.5-2: 全 SourceFile を flatten。配列末尾 (root module) のみが
    // `main()` body に置く top-level statement を持てる。非 root module で
    // 宣言以外の statement (let/const/式文/制御フロー) が出てきたら明示エラー。
    const rootSf = sourceFiles[sourceFiles.length - 1]!;
    for (const sf of sourceFiles) {
      const isRoot = sf === rootSf;
      for (const stmt of sf.statements) {
        if (ts.isImportDeclaration(stmt)) {
          // loader 側で既に検証済み (default/namespace/rename は弾かれている)。
          // codegen はここでは無視する: 全 module の宣言は単一 global namespace に
          // flatten されるため、import で名前を取り込む必要はない。
          continue;
        }
        if (ts.isFunctionDeclaration(stmt)) {
          validateExportableModifiers(stmt, "function");
          functions.push(stmt);
        } else if (ts.isClassDeclaration(stmt)) {
          classes.push(stmt);
        } else if (ts.isInterfaceDeclaration(stmt)) {
          interfaces.push(stmt);
        } else if (ts.isTypeAliasDeclaration(stmt)) {
          validateExportableModifiers(stmt, "type alias");
          aliases.push(stmt);
        } else if (!isRoot) {
          throw new CodegenError(
            stmt,
            "non-root module may only contain import / class / interface / function / type alias declarations (Phase 1.5-2)",
          );
        } else {
          topLevel.push(stmt);
        }
      }
    }

    // Pass 1a: register class names so field/method types can refer to each
    // other regardless of source order. Generic classes (`class Box<T>`) are
    // held aside in `genericClasses`; their substituted ClassInfo is built
    // lazily under the mangled name on first use.
    for (const cls of classes) {
      if (!cls.name) throw new CodegenError(cls, "class must be named");
      const name = cls.name.text;
      if (name === "Array" || name === "Map" || name === "Set" || name === "Iterator") {
        throw new CodegenError(cls, `cannot redefine built-in '${name}'`);
      }
      if (this.classes.has(name) || this.genericClasses.has(name)) {
        throw new CodegenError(cls, `redeclaration of class '${name}'`);
      }
      if (cls.typeParameters && cls.typeParameters.length > 0) {
        // Validate the type-param declaration eagerly so errors fire even
        // when the class is never instantiated (mirrors generic functions).
        const typeParams: string[] = [];
        for (const tp of cls.typeParameters) {
          if (tp.constraint) {
            throw new CodegenError(tp, "type parameter constraints are unsupported (Phase 1.4c-3)");
          }
          if (tp.default) {
            throw new CodegenError(tp, "default type parameters are unsupported (Phase 1.4c-3)");
          }
          if (typeParams.includes(tp.name.text)) {
            throw new CodegenError(tp, `duplicate type parameter '${tp.name.text}'`);
          }
          typeParams.push(tp.name.text);
        }
        if (cls.heritageClauses && cls.heritageClauses.length > 0) {
          throw new CodegenError(
            cls,
            "generic classes cannot implement interfaces (Phase 1.4c-3)",
          );
        }
        this.genericClasses.set(name, { name, typeParams, decl: cls });
        continue;
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
      });
    }

    // Pass 1b: register interface names.
    for (const iface of interfaces) {
      const name = iface.name.text;
      if (name === "Array" || name === "Map" || name === "Set" || name === "Iterator") {
        throw new CodegenError(iface, `cannot redefine built-in '${name}'`);
      }
      if (this.classes.has(name) || this.genericClasses.has(name)) {
        throw new CodegenError(iface, `interface '${name}' collides with a class of the same name`);
      }
      if (this.interfaces.has(name)) {
        throw new CodegenError(iface, `redeclaration of interface '${name}'`);
      }
      this.interfaces.set(name, {
        name,
        fields: new Map(),
        fieldOrder: [],
        methods: new Map(),
        methodOrder: [],
        decl: iface,
      });
    }

    // Pass 1c: register type alias names. RHS resolution is lazy
    // (typeFromAnnotation evaluates on demand), so forward references between
    // aliases work as long as the resulting graph is acyclic. Name conflicts
    // are checked eagerly against built-ins, classes, generic classes, and
    // interfaces — the alias lookup in typeFromAnnotation otherwise sits
    // alongside those tables at the same scoping priority.
    for (const alias of aliases) {
      const name = alias.name.text;
      if (name === "Array" || name === "Map" || name === "Set" || name === "Iterator") {
        throw new CodegenError(alias, `cannot redefine built-in '${name}'`);
      }
      if (this.classes.has(name) || this.genericClasses.has(name)) {
        throw new CodegenError(alias, `type alias '${name}' collides with a class of the same name`);
      }
      if (this.interfaces.has(name)) {
        throw new CodegenError(alias, `type alias '${name}' collides with an interface of the same name`);
      }
      if (this.typeAliases.has(name)) {
        throw new CodegenError(alias, `redeclaration of type alias '${name}'`);
      }
      if (alias.typeParameters && alias.typeParameters.length > 0) {
        throw new CodegenError(
          alias,
          `generic type alias '${name}' is unsupported (Phase 1.5-6 prep)`,
        );
      }
      this.typeAliases.set(name, { decl: alias, resolving: false });
    }

    // Pass 2a: parse interface members (so classes can reference interfaces in
    // field/method types).
    for (const iface of interfaces) {
      this.collectInterfaceMembers(iface);
    }

    // Pass 2b: parse class members + verify implements. Generic classes are
    // deferred — their substituted ClassInfo is built on demand when a use
    // site instantiates them via instantiateGenericClass.
    for (const cls of classes) {
      if (cls.typeParameters && cls.typeParameters.length > 0) continue;
      this.collectClassMembers(cls);
    }

    for (const fn of functions) {
      if (!fn.name) throw new CodegenError(fn, "function must be named");
      const fname = fn.name.text;
      if (this.functionSigs.has(fname) || this.genericFunctions.has(fname)) {
        throw new CodegenError(fn, `redeclaration of function '${fname}'`);
      }
      if (fn.typeParameters && fn.typeParameters.length > 0) {
        // Generic function: defer signature resolution until call sites
        // supply concrete type arguments. We still validate the type-param
        // declaration here so the error fires regardless of whether the
        // function is ever called.
        const typeParams: string[] = [];
        for (const tp of fn.typeParameters) {
          if (tp.constraint) {
            throw new CodegenError(tp, "type parameter constraints are unsupported (Phase 1.4c-2)");
          }
          if (tp.default) {
            throw new CodegenError(tp, "default type parameters are unsupported (Phase 1.4c-2)");
          }
          if (typeParams.includes(tp.name.text)) {
            throw new CodegenError(tp, `duplicate type parameter '${tp.name.text}'`);
          }
          typeParams.push(tp.name.text);
        }
        this.genericFunctions.set(fname, { name: fname, typeParams, decl: fn });
        continue;
      }
      const ret = this.typeFromAnnotation(fn.type, fn);
      const params = this.collectParams(fn.parameters);
      this.functionSigs.set(fname, { params, returnType: ret });
    }

    const out: string[] = [];
    out.push('#include "runtime.h"');
    out.push("");

    // Forward-declare class structs and interface vtable structs so any
    // ordering of fields/methods that crosses class/interface boundaries works.
    // Generic class monomorphs get their own typedef slot below; we don't
    // know all of them yet.
    const concreteClasses = classes.filter(
      (c) => !(c.typeParameters && c.typeParameters.length > 0),
    );
    if (concreteClasses.length > 0) {
      for (const cls of concreteClasses) {
        const n = cls.name!.text;
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
      for (const iface of interfaces) {
        const n = iface.name.text;
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
        out.push(this.emitClassStruct(this.classes.get(cls.name!.text)!));
      }
      out.push("");
    }
    // Phase 1.4c-3: generic class monomorph struct definitions. Field types
    // already use pointer C types for class refs, so this can sit after
    // concrete struct defs without circular-ordering pain.
    const classMonoStructSlot = out.length;
    out.push("");
    if (interfaces.length > 0) {
      for (const iface of interfaces) {
        out.push(this.emitInterfaceVtableStruct(this.interfaces.get(iface.name.text)!));
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

    for (const fn of functions) {
      if (fn.typeParameters && fn.typeParameters.length > 0) continue;
      out.push(`${this.formatSignature(fn)};`);
    }
    for (const cls of concreteClasses) {
      const info = this.classes.get(cls.name!.text)!;
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
    const hoistedTopLevel: Set<ts.Statement> = new Set();
    {
      const hoistLines: string[] = [];
      for (const stmt of topLevel) {
        const line = this.tryHoistModuleConst(stmt);
        if (line !== undefined) {
          hoistedTopLevel.add(stmt);
          hoistLines.push(line);
        }
      }
      if (hoistLines.length > 0) {
        out[moduleConstSlot] = hoistLines.join("\n") + "\n";
      }
    }

    // Emit per-(interface, implementing-class) wrapper functions and the
    // static const vtable instances. These must come before user function /
    // class method definitions so coercion sites (`&topaz_iface_I_for_C_vt`)
    // can reference them.
    for (const cls of concreteClasses) {
      const info = this.classes.get(cls.name!.text)!;
      for (const ifaceName of info.implements) {
        const iface = this.interfaces.get(ifaceName)!;
        for (const def of this.emitInterfaceWrappers(iface, info)) {
          out.push(def);
        }
        out.push(this.emitInterfaceVtableInstance(iface, info));
        out.push("");
      }
    }

    for (const fn of functions) {
      if (fn.typeParameters && fn.typeParameters.length > 0) continue;
      out.push(this.emitFunctionDefinition(fn));
      out.push("");
    }

    for (const cls of concreteClasses) {
      const info = this.classes.get(cls.name!.text)!;
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

    out.push("int main(void) {");
    this.scope.push();
    for (const stmt of topLevel) {
      // Phase 1.5-6 prep #9: hoisted module consts are already emitted at
      // file scope and registered in scope.stack[0]; emitting them again as
      // local decls would shadow the hoisted bindings inside main() body and
      // duplicate the storage.
      if (hoistedTopLevel.has(stmt)) continue;
      out.push(this.emitStatement(stmt, 1));
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
        const mangled = this.classMonomorphWorklist.shift()!;
        const info = this.classes.get(mangled)!;
        const mono = this.classMonomorphs.get(mangled)!;
        classMonoTypedefLines.push(`typedef struct topaz_class_${mangled} topaz_class_${mangled};`);
        classMonoStructLines.push(this.emitClassStruct(info));
        for (const line of this.classMemberSignatures(info)) classMonoSigLines.push(`${line};`);
        // Method bodies still reference T/U/...; reactivate the substitution
        // for the duration of body emission.
        const prevScope = this.typeParamScope;
        this.typeParamScope = mono.subs;
        try {
          for (const def of this.emitClassMemberDefinitions(info)) {
            classMonoDefLines.push(def);
            classMonoDefLines.push("");
          }
        } finally {
          this.typeParamScope = prevScope;
        }
      }
      while (this.genericWorklist.length > 0) {
        const mangled = this.genericWorklist.shift()!;
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
        helperLines.push(...this.emitSetElemHelpers(elem));
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
    let toStringStmt: string;
    if (elem.kind === "string") {
      toStringStmt = `topaz_string __e = src->data[i];`;
    } else if (elem.kind === "number") {
      toStringStmt = `topaz_string __e = topaz_number_to_string(src->data[i]);`;
    } else if (elem.kind === "boolean") {
      toStringStmt = `topaz_string __e = topaz_boolean_to_string(src->data[i]);`;
    } else {
      throw new Error(`emitArrayJoinHelper: unsupported elem ${typeIdent(elem)}`);
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
    source: "map_values" | "map_keys" | "set_values";
    elemType: TopazType;
    field: "key" | "value";
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
    recvExpr: ts.Expression,
    containerType: TopazType,
    source: "map_values" | "map_keys" | "set_values",
    elemType: TopazType,
    field: "key" | "value",
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
    let cElem: string;
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
      throw new Error(`unexpected array element type ${typeIdent(elem)} for monomorph emission`);
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
      throw new Error(`emitArrayFnMonomorphMacro: not an fn-elem array, got ${typeIdent(elem)}`);
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
    let optAbsent: string;
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
      throw new Error(`emitMapMonomorphMacro: scalar V should be pre-expanded in runtime.h, got ${typeIdent(v)}`);
    }
    return `TOPAZ_MAP_DEFINE(${tag}, ${typeIdent(k)}, ${cVal}, ${cVal}, topaz_opt_passthrough, ${optAbsent}, ${hashFn}, ${eqFn})`;
  }

  // Phase 1.4c-1b: expand TOPAZ_SET_DEFINE for class/interface element sets.
  // The hash/eq wrappers were emitted earlier (see emitSetElemHelpers).
  private emitSetMonomorphMacro(t: TopazType): string {
    const tag = setShortName(t);
    const elem = setElem(t)!;
    const cElem = this.cElemTypeForContainer(elem);
    let hashFn: string;
    let eqFn: string;
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
      throw new Error(`unexpected set element type ${typeIdent(elem)} for monomorph emission`);
    }
    return `TOPAZ_SET_DEFINE(${tag}, ${cElem}, ${hashFn}, ${eqFn})`;
  }

  // Phase 1.5-3e: emit `typedef struct { topaz_string kind; void *data; }
  // topaz_dunion_A_or_B;` for a class union with a shared string-literal
  // discriminator. The `data` field holds the underlying class instance
  // pointer; case-narrowing casts it back via `(topaz_class_<C> *)d.data`.
  private emitDunionTypedef(t: TopazType): string {
    if (t.kind !== "dunion") {
      throw new Error(`emitDunionTypedef: not a dunion (${typeIdent(t)})`);
    }
    const name = typeIdent(t);
    return `typedef struct { topaz_string ${t.discriminator}; void *data; } ${name};`;
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
    throw new Error(`unexpected set element type ${typeIdent(elem)} for helper emission`);
  }

  private cElemTypeForContainer(elem: TopazType): string {
    if (isClassType(elem)) return `topaz_class_${classNameOf(elem)!} *`;
    if (isInterfaceType(elem)) return `topaz_iface_${interfaceNameOf(elem)!}`;
    if (isScalarType(elem)) return typeIdent(elem);
    // Phase 1.5-6 prep #8: dunion stores the fat `{ kind, void *data }` struct
    // value directly. The typedef is already emitted (emitDunionTypedef) ahead
    // of the container macros (see emit() containerMonomorphSlot order).
    if (elem.kind === "dunion") return typeIdent(elem);
    throw new Error(`unexpected container element type ${typeIdent(elem)}`);
  }

  private collectInterfaceMembers(iface: ts.InterfaceDeclaration): void {
    const info = this.interfaces.get(iface.name.text)!;
    if (iface.typeParameters && iface.typeParameters.length > 0) {
      throw new CodegenError(iface, "generic interfaces are unsupported (Phase 1.4c)");
    }
    if (iface.heritageClauses && iface.heritageClauses.length > 0) {
      throw new CodegenError(iface, "interface inheritance (`extends`) is unsupported");
    }
    validateExportableModifiers(iface, "interface");
    for (const m of iface.members) {
      if (ts.isPropertySignature(m)) {
        if (!m.name || !ts.isIdentifier(m.name)) {
          throw new CodegenError(m, "interface field name must be a simple identifier");
        }
        if (m.questionToken) {
          throw new CodegenError(m, "optional interface fields are unsupported");
        }
        // Phase 1.5-6 prep: readonly は no-op 受理(C 出力で runtime 強制
        // しない方針、class member 側と同じ)。それ以外の modifier(static
        // 等)は意味が変わるので reject。
        if (m.modifiers) {
          for (const mod of m.modifiers) {
            if (mod.kind === ts.SyntaxKind.ReadonlyKeyword) continue;
            throw new CodegenError(
              mod,
              `interface field modifier '${ts.SyntaxKind[mod.kind]}' is unsupported`,
            );
          }
        }
        const fname = m.name.text;
        if (info.fields.has(fname) || info.methods.has(fname)) {
          throw new CodegenError(m, `duplicate member '${fname}' in interface '${info.name}'`);
        }
        const t = this.typeFromAnnotation(m.type, m);
        this.assertNotVoid(t, m, "interface field type");
        if (t.kind === "fn") {
          throw new CodegenError(m, "fn-typed interface fields are unsupported (Phase 1.5-3.5e)");
        }
        info.fields.set(fname, t);
        info.fieldOrder.push(fname);
      } else if (ts.isMethodSignature(m)) {
        if (!m.name || !ts.isIdentifier(m.name)) {
          throw new CodegenError(m, "interface method name must be a simple identifier");
        }
        if (m.questionToken) {
          throw new CodegenError(m, "optional interface methods are unsupported");
        }
        if (m.typeParameters && m.typeParameters.length > 0) {
          throw new CodegenError(m, "generic interface methods are unsupported (Phase 1.4c)");
        }
        const mname = m.name.text;
        if (info.fields.has(mname) || info.methods.has(mname)) {
          throw new CodegenError(m, `duplicate member '${mname}' in interface '${info.name}'`);
        }
        const params = this.collectParams(m.parameters);
        const returnType = this.typeFromAnnotation(m.type, m);
        // Phase 1.5-3.5e: interface vtable struct is emitted before the fn
        // typedef slot, so fn types in interface methods would forward-
        // reference an undeclared typedef. Reject at collection time.
        for (const p of params) {
          if (p.type.kind === "fn") {
            throw new CodegenError(m, "fn-typed parameters on interface methods are unsupported (Phase 1.5-3.5e)");
          }
        }
        if (returnType.kind === "fn") {
          throw new CodegenError(m, "fn-typed return on interface methods is unsupported (Phase 1.5-3.5e)");
        }
        info.methods.set(mname, { params, returnType, decl: m });
        info.methodOrder.push(mname);
      } else if (ts.isIndexSignatureDeclaration(m)) {
        throw new CodegenError(m, "interface index signatures are unsupported");
      } else if (ts.isCallSignatureDeclaration(m) || ts.isConstructSignatureDeclaration(m)) {
        throw new CodegenError(m, "interface call/construct signatures are unsupported");
      } else if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) {
        throw new CodegenError(m, "interface accessors are unsupported");
      } else {
        unsupported(m, "interface member");
      }
    }
  }

  private collectClassMembers(cls: ts.ClassDeclaration, infoOverride?: ClassInfo): void {
    // infoOverride is set when collecting members for a generic class
    // monomorph (the ClassInfo lives under the mangled name, not cls.name);
    // otherwise we look up by the source name.
    const info = infoOverride ?? this.classes.get(cls.name!.text)!;
    if (cls.heritageClauses) {
      for (const hc of cls.heritageClauses) {
        if (hc.token === ts.SyntaxKind.ExtendsKeyword) {
          throw new CodegenError(hc, "`extends` is unsupported (no class inheritance)");
        }
        if (hc.token !== ts.SyntaxKind.ImplementsKeyword) {
          throw new CodegenError(hc, "unsupported heritage clause");
        }
        for (const t of hc.types) {
          if (!ts.isIdentifier(t.expression)) {
            throw new CodegenError(t, "implements target must be a bare interface name");
          }
          if (t.typeArguments && t.typeArguments.length > 0) {
            throw new CodegenError(t, "generic interfaces are unsupported (Phase 1.4c)");
          }
          const ifaceName = t.expression.text;
          if (!this.interfaces.has(ifaceName)) {
            throw new CodegenError(t, `unknown interface '${ifaceName}'`);
          }
          if (info.implements.includes(ifaceName)) {
            throw new CodegenError(t, `class '${info.name}' lists interface '${ifaceName}' more than once`);
          }
          info.implements.push(ifaceName);
        }
      }
    }
    validateExportableModifiers(cls, "class");
    for (const m of cls.members) {
      if (m.kind === ts.SyntaxKind.SemicolonClassElement) continue;
      // Phase 1.5-6 prep: public / private / protected / readonly は no-op
      // として受理(C 出力に可視性概念は無く、readonly も runtime 強制しない
      // — src/ で `private` が 137 箇所使われており、self-hosting には no-op
      // で十分)。static / abstract / override は意味が変わるので引き続き
      // 明示エラー。
      if ((ts as any).canHaveModifiers?.(m) && ts.getModifiers && ts.getModifiers(m as any)) {
        const mods = ts.getModifiers(m as any);
        if (mods) {
          for (const mod of mods) {
            switch (mod.kind) {
              case ts.SyntaxKind.PublicKeyword:
              case ts.SyntaxKind.PrivateKeyword:
              case ts.SyntaxKind.ProtectedKeyword:
              case ts.SyntaxKind.ReadonlyKeyword:
                continue;
              default:
                throw new CodegenError(
                  mod,
                  `class member modifier '${ts.SyntaxKind[mod.kind]}' is unsupported`,
                );
            }
          }
        }
      }
      if (ts.isPropertyDeclaration(m)) {
        this.collectField(info, m);
      } else if (ts.isConstructorDeclaration(m)) {
        this.collectConstructor(info, m);
      } else if (ts.isMethodDeclaration(m)) {
        this.collectMethod(info, m);
      } else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
        throw new CodegenError(m, "get/set accessors are unsupported");
      } else if (ts.isClassStaticBlockDeclaration(m)) {
        throw new CodegenError(m, "static blocks are unsupported");
      } else {
        unsupported(m, "class member");
      }
    }
    if (info.fields.size > 0 && !info.ctor) {
      // Phase 1.5-6 prep: if every field carries an initializer, synthesize a
      // zero-arg constructor that consists entirely of the initializer
      // assignments. Otherwise keep the historical error — at least one field
      // would be left untouched and we can't pick a sensible default for it
      // (and don't want to surprise callers with silent zero-init).
      const allInitialized = info.fieldOrder.every((f) => info.fieldInits.has(f));
      if (allInitialized) {
        info.ctor = { params: [], decl: undefined };
      } else {
        const missing = info.fieldOrder.filter((f) => !info.fieldInits.has(f));
        throw new CodegenError(
          cls,
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
    if (!infoOverride) {
      this.verifyDefiniteFieldInit(info);
    }
    for (const ifaceName of info.implements) {
      this.verifyImplements(info, this.interfaces.get(ifaceName)!, cls);
    }
  }

  private verifyDefiniteFieldInit(info: ClassInfo): void {
    if (info.fields.size === 0) return;
    if (!info.ctor) return; // field-without-ctor は上で報告済み
    const assigned = new Set<string>();
    // Phase 1.5-6 prep: field initializer (`x: T = init;`) を持つ field は
    // emitConstructorDefinition が ctor body 冒頭で代入を吐くため definitely
    // assigned。残りは従来通り ctor body top-level の `this.f = ...` で埋める
    // 必要がある。auto-synthesized ctor (decl === undefined) はそもそも全
    // field が initializer 持ちなので 2 つ目の集計はスキップする。
    for (const fname of info.fieldInits.keys()) assigned.add(fname);
    if (info.ctor.decl) {
      this.collectDefiniteFieldAssignments(info.ctor.decl.body!, assigned);
    }
    for (const fname of info.fieldOrder) {
      if (!assigned.has(fname)) {
        throw new CodegenError(
          info.ctor.decl ?? info.decl,
          `field '${info.name}.${fname}' is not definitely assigned in the constructor (assign it directly under the constructor body, or add a field initializer 'x: T = init;' — control-flow inside if/for/while/try is not analyzed yet)`,
        );
      }
    }
  }

  private collectDefiniteFieldAssignments(body: ts.Block, out: Set<string>): void {
    for (const s of body.statements) {
      if (!ts.isExpressionStatement(s)) continue;
      if (!ts.isBinaryExpression(s.expression)) continue;
      const e = s.expression;
      if (e.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
      if (!ts.isPropertyAccessExpression(e.left)) continue;
      if (e.left.expression.kind !== ts.SyntaxKind.ThisKeyword) continue;
      if (!ts.isIdentifier(e.left.name)) continue;
      out.add(e.left.name.text);
    }
  }

  // Phase 1.4b: exact structural match — interface field types and method
  // signatures must equal the class's. No coercion happens at the vtable
  // boundary, only at user-visible value sites.
  private verifyImplements(cls: ClassInfo, iface: InterfaceInfo, anchor: ts.Node): void {
    for (const fname of iface.fieldOrder) {
      const want = iface.fields.get(fname)!;
      const got = cls.fields.get(fname);
      if (!got) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}' is missing field '${fname}' required by interface '${iface.name}'`,
        );
      }
      if (!typeEq(got, want)) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}.${fname}' has type ${typeIdent(got)}, but interface '${iface.name}' requires ${typeIdent(want)}`,
        );
      }
    }
    for (const mname of iface.methodOrder) {
      const want = iface.methods.get(mname)!;
      const got = cls.methods.get(mname);
      if (!got) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}' is missing method '${mname}' required by interface '${iface.name}'`,
        );
      }
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
        if (!typeEq(got.params[i]!.type, want.params[i]!.type)) {
          throw new CodegenError(
            anchor,
            `class '${cls.name}.${mname}' parameter ${i + 1} has type ${typeIdent(got.params[i]!.type)}, but interface '${iface.name}' requires ${typeIdent(want.params[i]!.type)}`,
          );
        }
      }
    }
  }

  private classImplements(className: string, ifaceName: string): boolean {
    const cls = this.classes.get(className);
    if (!cls) return false;
    return cls.implements.includes(ifaceName);
  }

  private collectField(info: ClassInfo, m: ts.PropertyDeclaration): void {
    if (!ts.isIdentifier(m.name)) {
      throw new CodegenError(m, "field name must be a simple identifier");
    }
    const fname = m.name.text;
    if (info.fields.has(fname)) {
      throw new CodegenError(m, `redeclaration of field '${fname}'`);
    }
    if (info.methods.has(fname)) {
      throw new CodegenError(m, `field '${fname}' conflicts with a method of the same name`);
    }
    if (m.questionToken) {
      throw new CodegenError(m, "optional fields are unsupported");
    }
    if (m.exclamationToken) {
      throw new CodegenError(m, "definite-assignment assertion `!` is unsupported");
    }
    // Phase 1.5-6 prep: field initializer (`x: T = init;`) を保存。型は注釈
    // 必須(初期化子からの推論は意図的に行わない、`let` / `const` と違って class
    // field は全プログラムから参照されるため型を syntactically 確定させたい —
    // typeFromAnnotation が `m.type` 欠落で reject する)。initializer 自体は
    // emit 時に `emitWithExpected(init, t)` で型整合 + 必要な coercion
    // (class → iface / string-literal widening 等)を走らせる。
    const t = this.typeFromAnnotation(m.type, m);
    this.assertNotVoid(t, m, "class field type");
    if (t.kind === "fn") {
      throw new CodegenError(m, "fn-typed class fields are unsupported (Phase 1.5-3.5e); store the closure in a local instead");
    }
    info.fields.set(fname, t);
    info.fieldOrder.push(fname);
    if (m.initializer) {
      info.fieldInits.set(fname, m.initializer);
    }
  }

  private collectConstructor(info: ClassInfo, m: ts.ConstructorDeclaration): void {
    if (info.ctor) {
      throw new CodegenError(m, `class '${info.name}' has multiple constructors`);
    }
    if (m.typeParameters && m.typeParameters.length > 0) {
      throw new CodegenError(m, "generic constructors are unsupported");
    }
    if (!m.body) throw new CodegenError(m, "constructor must have a body");
    const params = this.collectParams(m.parameters);
    info.ctor = { params, decl: m };
  }

  private collectMethod(info: ClassInfo, m: ts.MethodDeclaration): void {
    if (!ts.isIdentifier(m.name)) {
      throw new CodegenError(m, "method name must be a simple identifier");
    }
    const mname = m.name.text;
    if (info.methods.has(mname)) {
      throw new CodegenError(m, `redeclaration of method '${mname}'`);
    }
    if (info.fields.has(mname)) {
      throw new CodegenError(m, `method '${mname}' conflicts with a field of the same name`);
    }
    if (m.typeParameters && m.typeParameters.length > 0) {
      throw new CodegenError(m, "generic methods are unsupported (Phase 1.4c)");
    }
    if (m.questionToken) {
      throw new CodegenError(m, "optional methods are unsupported");
    }
    if (m.asteriskToken) {
      throw new CodegenError(m, "generator methods are unsupported");
    }
    if (!m.body) throw new CodegenError(m, "method must have a body");
    const params = this.collectParams(m.parameters);
    const returnType = this.typeFromAnnotation(m.type, m);
    info.methods.set(mname, { params, returnType, decl: m });
  }

  private collectParams(parameters: ts.NodeArray<ts.ParameterDeclaration>): ParamInfo[] {
    const out: ParamInfo[] = [];
    let sawOptional = false;
    for (const p of parameters) {
      if (!ts.isIdentifier(p.name)) {
        throw new CodegenError(p, "parameter must be a simple identifier");
      }
      if (p.initializer || p.dotDotDotToken) {
        throw new CodegenError(p, "default/rest parameters are unsupported");
      }
      if (p.modifiers && p.modifiers.length > 0) {
        throw new CodegenError(p, "parameter property shorthand is unsupported; declare the field explicitly");
      }
      const isOptional = !!p.questionToken;
      if (sawOptional && !isOptional) {
        throw new CodegenError(p, "a required parameter cannot follow an optional parameter");
      }
      if (isOptional) sawOptional = true;
      const annot = this.typeFromAnnotation(p.type, p);
      this.assertNotVoid(annot, p, "parameter type");
      // Phase 1.5-6 prep: `param?: T` is the syntactic sugar for
      // `param: T | undefined`. Lift the declared type into the union here so
      // the rest of codegen (narrowing, undefined wrap helpers, vtable
      // signatures) sees a uniform representation regardless of source.
      const t = isOptional ? makeUnion([annot, T_UNDEFINED]) : annot;
      out.push({ name: p.name.text, type: t, isOptional });
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
    if (info.ctor) {
      lines.push(this.constructorSignature(info));
    }
    for (const [, method] of info.methods) {
      lines.push(this.methodSignature(info, method));
    }
    return lines;
  }

  private emitClassMemberDefinitions(info: ClassInfo): string[] {
    const out: string[] = [];
    if (info.ctor) out.push(this.emitConstructorDefinition(info));
    for (const [, method] of info.methods) {
      out.push(this.emitMethodDefinition(info, method));
    }
    return out;
  }

  private constructorSignature(info: ClassInfo): string {
    const params = info.ctor!.params
      .map((p) => `${cTypeName(p.type)} ${p.name}`)
      .join(", ");
    return `static topaz_class_${info.name} *topaz_class_${info.name}_new(${params || "void"})`;
  }

  private methodSignature(info: ClassInfo, method: MethodInfo): string {
    const name = (method.decl.name as ts.Identifier).text;
    const ownerArg = `topaz_class_${info.name} *${TOPAZ_THIS}`;
    const tail = method.params.map((p) => `${cTypeName(p.type)} ${p.name}`).join(", ");
    const params = tail ? `${ownerArg}, ${tail}` : ownerArg;
    return `static ${cReturnTypeName(method.returnType)} topaz_class_${info.name}_method_${name}(${params})`;
  }

  private emitConstructorDefinition(info: ClassInfo): string {
    const ctor = info.ctor!;
    this.currentClass = info.name;
    this.scope.push();
    try {
      const anchor = ctor.decl ?? info.decl;
      for (const p of ctor.params) {
        this.scope.declare(p.name, p.type, /* isConst */ false, anchor);
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
      if (!ctor.decl && ctor.params.length > 0) {
        for (const p of ctor.params) {
          bodyLines.push(`  ${TOPAZ_THIS}->${p.name} = ${p.name};`);
        }
      }
      // Phase 1.5-6 prep: auto-synthesized ctors (decl === undefined) have no
      // user body — the field initializer block above is the entire body.
      if (ctor.decl) {
        for (const s of ctor.decl.body!.statements) {
          if (ts.isReturnStatement(s)) {
            throw new CodegenError(s, "`return` inside a constructor is unsupported");
          }
          bodyLines.push(this.emitStatement(s, 1));
        }
      }
      bodyLines.push(`  return ${TOPAZ_THIS};`);
      bodyLines.push("}");
      return `${this.constructorSignature(info)} ${bodyLines.join("\n")}`;
    } finally {
      this.scope.pop();
      this.currentClass = undefined;
    }
  }

  // Phase 1.5-6 prep: each field initializer (`x: T = init;`) becomes a
  // `this->x = init;` written into the ctor body right after the calloc + tag
  // store, in field declaration order. The struct is already zero-initialized
  // by calloc, so forward references to later fields read 0 / NULL / false /
  // empty string — matching JS field init semantics (later declarations are
  // not yet evaluated when an earlier initializer runs). emitWithExpected
  // takes care of class → iface coercion, string-literal widening, and scalar
  // opt wrap; we route through it so initializer sites match assignment
  // sites.
  private emitFieldInitializers(info: ClassInfo, out: string[]): void {
    if (info.fieldInits.size === 0) return;
    for (const fname of info.fieldOrder) {
      const init = info.fieldInits.get(fname);
      if (!init) continue;
      const fty = info.fields.get(fname)!;
      const initC = this.emitWithExpected(init, fty);
      out.push(`  ${TOPAZ_THIS}->${fname} = ${initC};`);
    }
  }

  private emitMethodDefinition(info: ClassInfo, method: MethodInfo): string {
    this.currentClass = info.name;
    const prevRet = this.currentReturnType;
    this.currentReturnType = method.returnType;
    this.scope.push();
    try {
      for (const p of method.params) {
        this.scope.declare(p.name, p.type, /* isConst */ false, method.decl);
      }
      const body = this.emitBlock(method.decl.body!, 0);
      return `${this.methodSignature(info, method)} ${body}`;
    } finally {
      this.scope.pop();
      this.currentClass = undefined;
      this.currentReturnType = prevRet;
    }
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
        const params = tail ? `void *self, ${tail}` : "void *self";
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

  // Phase 1.5-6 prep: reject `void` outside of function / method return-type
  // slots. `void` has no value representation, so it cannot appear as a
  // parameter type, variable type, field type, container element / value /
  // key, union variant, type argument, or fn-type return position.
  private assertNotVoid(t: TopazType, anchor: ts.Node, what: string): void {
    if (t.kind === "void") {
      throw new CodegenError(anchor, `\`void\` is only allowed as a function / method return type (used in ${what})`);
    }
  }

  private typeFromAnnotation(node: ts.TypeNode | undefined, anchor: ts.Node): TopazType {
    if (!node) throw new CodegenError(anchor, "type annotation required");
    if (node.kind === ts.SyntaxKind.NumberKeyword) return T_NUMBER;
    if (node.kind === ts.SyntaxKind.BooleanKeyword) return T_BOOLEAN;
    if (node.kind === ts.SyntaxKind.StringKeyword) return T_STRING;
    if (node.kind === ts.SyntaxKind.UndefinedKeyword) return T_UNDEFINED;
    if (node.kind === ts.SyntaxKind.UnknownKeyword) return T_UNKNOWN;
    // Phase 1.5-6 prep: accept `void` here so function / method return-type
    // slots flow through. Other call sites (variable annotation, container
    // element, union variant, fn param) re-check and reject — see
    // collectField, declareVar, the Array/Map/Set elem checks, and
    // typeFromAnnotation's FunctionTypeNode branch (fn param scan).
    if (node.kind === ts.SyntaxKind.VoidKeyword) return T_VOID;
    if (ts.isParenthesizedTypeNode(node)) {
      return this.typeFromAnnotation(node.type, anchor);
    }
    // Phase 1.5-3e: string literal type (`kind: "circle"`) for discriminators.
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
      const v = node.literal.text;
      for (let i = 0; i < v.length; i++) {
        const code = v.charCodeAt(i);
        if (code > 0x7e) {
          throw new CodegenError(node, "string literal type must be ASCII (1.5-3e)");
        }
      }
      return { kind: "string_literal", value: v };
    }
    // Phase 1.5-3b: `T | undefined` only. cTypeName enforces the shape; we
    // accept any union here so error messages can say "scalar | undefined is
    // deferred to 1.5-3c" instead of "unsupported type".
    // Phase 1.5-3e: class union with a shared `kind: "literal"` discriminator
    // collapses into a `dunion` (tagged fat pointer) at this site.
    if (ts.isUnionTypeNode(node)) {
      const variants = node.types.map((t) => {
        const vt = this.typeFromAnnotation(t, t);
        this.assertNotVoid(vt, t, "union variant");
        return vt;
      });
      const dunion = this.tryMakeDiscriminatedUnion(variants, node);
      if (dunion) return dunion;
      return makeUnion(variants);
    }
    if (ts.isArrayTypeNode(node)) {
      const elem = this.typeFromAnnotation(node.elementType, node);
      this.assertNotVoid(elem, node, "Array element");
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(node, `no Array monomorph for element type ${typeIdent(elem)}`);
      }
      this.recordArrayMonomorph(arr);
      return arr;
    }
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      const refName = node.typeName.text;
      // Phase 1.4c-2: when emitting under an active type-parameter scope,
      // bare type references like `T` resolve through the substitution. Must
      // come before the class/interface lookup so that a class declared with
      // the same name as a type parameter doesn't shadow the binding.
      if (this.typeParamScope && this.typeParamScope.has(refName)) {
        if (node.typeArguments && node.typeArguments.length > 0) {
          throw new CodegenError(node, `type parameter '${refName}' cannot have type arguments`);
        }
        return this.typeParamScope.get(refName)!;
      }
      // Phase 1.5-6 prep: type alias substitution. Lookup sits between
      // typeParamScope (so a `T` param shadows a same-named alias inside a
      // generic body) and the built-ins (`Array` / `Map` / `Set` / `Iterator`
      // collision is rejected at declaration time, so the ordering here is
      // only relevant for error message clarity). Resolution is memoized;
      // `resolving` guards against cycles like `type A = B; type B = A;`.
      {
        const alias = this.typeAliases.get(refName);
        if (alias) {
          if (node.typeArguments && node.typeArguments.length > 0) {
            throw new CodegenError(node, `type alias '${refName}' takes no type arguments (Phase 1.5-6 prep)`);
          }
          if (alias.resolved) return alias.resolved;
          if (alias.resolving) {
            throw new CodegenError(node, `circular type alias '${refName}'`);
          }
          alias.resolving = true;
          try {
            alias.resolved = this.typeFromAnnotation(alias.decl.type, alias.decl);
          } finally {
            alias.resolving = false;
          }
          return alias.resolved;
        }
      }
      if (refName === "Array") {
        if (!node.typeArguments || node.typeArguments.length !== 1) {
          throw new CodegenError(node, "Array<T> requires exactly one type argument");
        }
        const elem = this.typeFromAnnotation(node.typeArguments[0]!, node);
        this.assertNotVoid(elem, node, "Array element");
        const arr = arrayOf(elem);
        if (!arr) {
          throw new CodegenError(node, `no Array monomorph for element type ${typeIdent(elem)}`);
        }
        this.recordArrayMonomorph(arr);
        return arr;
      }
      if (refName === "Map") {
        if (!node.typeArguments || node.typeArguments.length !== 2) {
          throw new CodegenError(node, "Map<K, V> requires exactly two type arguments");
        }
        const k = this.typeFromAnnotation(node.typeArguments[0]!, node);
        this.assertNotVoid(k, node, "Map key");
        const v = this.typeFromAnnotation(node.typeArguments[1]!, node);
        this.assertNotVoid(v, node, "Map value");
        const m = mapOf(k, v);
        if (!m) {
          throw new CodegenError(node, `no Map monomorph for key=${typeIdent(k)}, value=${typeIdent(v)}`);
        }
        this.recordMapMonomorph(m);
        return m;
      }
      if (refName === "Set") {
        if (!node.typeArguments || node.typeArguments.length !== 1) {
          throw new CodegenError(node, "Set<T> requires exactly one type argument");
        }
        const elem = this.typeFromAnnotation(node.typeArguments[0]!, node);
        this.assertNotVoid(elem, node, "Set element");
        const s = setOf(elem);
        if (!s) {
          throw new CodegenError(node, `no Set monomorph for element type ${typeIdent(elem)}`);
        }
        this.recordSetMonomorph(s);
        return s;
      }
      // Phase 1.5-3.5g-iterator: Iterator<T> as first-class type. Elem must be
      // scalar / class / interface (same shape constraint as Map / Set values).
      // The typedef alone doesn't pull in a _next function — that's recorded
      // at construction sites (Map.values / Map.keys / Set.values / Set.keys).
      if (refName === "Iterator") {
        if (!node.typeArguments || node.typeArguments.length !== 1) {
          throw new CodegenError(node, "Iterator<T> requires exactly one type argument");
        }
        const elem = this.typeFromAnnotation(node.typeArguments[0]!, node);
        this.assertNotVoid(elem, node, "Iterator element");
        if (
          elem.kind !== "number" && elem.kind !== "boolean" && elem.kind !== "string"
          && !isClassType(elem) && !isInterfaceType(elem)
        ) {
          throw new CodegenError(
            node,
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
        return this.instantiateGenericClass(refName, node.typeArguments, node);
      }
      if (this.classes.has(refName)) {
        if (node.typeArguments && node.typeArguments.length > 0) {
          throw new CodegenError(node, `class '${refName}' takes no type arguments`);
        }
        return classOf(refName);
      }
      if (this.interfaces.has(refName)) {
        if (node.typeArguments && node.typeArguments.length > 0) {
          throw new CodegenError(node, `interface '${refName}' takes no type arguments (Phase 1.4c)`);
        }
        return interfaceOf(refName);
      }
    }
    // Phase 1.5-3.5e: `(p: T) => R` function type. Param annotations are
    // mandatory (no contextual inference yet); no rest/optional/default; no
    // fn-in-fn signatures (the typedef slot is filled before any other fn
    // monomorph could be referenced, but nested fn types raise mangling
    // ambiguities not worth solving for the MVP).
    if (ts.isFunctionTypeNode(node)) {
      if (node.typeParameters && node.typeParameters.length > 0) {
        throw new CodegenError(node, "generic function types are unsupported (Phase 1.5-3.5e)");
      }
      const params: ParamInfo[] = [];
      const seenNames = new Set<string>();
      for (const p of node.parameters) {
        if (!ts.isIdentifier(p.name)) {
          throw new CodegenError(p, "function-type parameter must be a simple identifier");
        }
        if (p.questionToken || p.dotDotDotToken) {
          throw new CodegenError(p, "optional/rest parameters are unsupported in function types");
        }
        if (!p.type) {
          throw new CodegenError(p, "function-type parameter requires a type annotation");
        }
        const pt = this.typeFromAnnotation(p.type, p);
        this.assertNotVoid(pt, p, "fn-type parameter");
        if (pt.kind === "fn") {
          throw new CodegenError(p, "nested fn types in fn parameters are unsupported (Phase 1.5-3.5e)");
        }
        if (seenNames.has(p.name.text)) {
          throw new CodegenError(p, `duplicate parameter name '${p.name.text}'`);
        }
        seenNames.add(p.name.text);
        params.push({ name: p.name.text, type: pt, isOptional: false });
      }
      const ret = this.typeFromAnnotation(node.type, node);
      // Phase 1.5-6 prep: fn types cannot return void. emitFnTypedef would
      // produce a struct holding a `void (*fn)(...)`, but the call-site
      // dispatch wraps every call in a stmt-expression that yields the return
      // value, and there's no representation for a void value at the call
      // site. Reject here so error surfaces at the type annotation rather than
      // emitFnTypedef's internal "cTypeName(void)" throw.
      if (ret.kind === "void") {
        throw new CodegenError(node, "fn types cannot return `void` (Phase 1.5-6 prep)");
      }
      if (ret.kind === "fn") {
        throw new CodegenError(node, "nested fn types in fn return position are unsupported (Phase 1.5-3.5e)");
      }
      const ft: TopazType = { kind: "fn", params, returnType: ret };
      this.recordFnMonomorph(ft);
      return ft;
    }
    // Phase 1.5-6 prep: object literal type `{ a: T; b: U }`. Lowered to an
    // anonymous class. Members must all be plain PropertySignatures with a
    // simple identifier name and a type annotation; readonly modifier is
    // accepted as a no-op (mirroring class / interface field treatment in
    // prep #1). Method signatures, call / construct / index signatures,
    // computed property names, optional `f?: T`, and empty `{}` are
    // rejected. Field order is alphabetical (see recordAnonClass) so two
    // TypeLiterals with the same shape collapse to the same C struct.
    if (ts.isTypeLiteralNode(node)) {
      if (node.members.length === 0) {
        throw new CodegenError(node, "empty object literal type `{}` is unsupported (Phase 1.5-6 prep)");
      }
      const fields = new Map<string, TopazType>();
      // Phase 1.5-6 prep-optional-param: collect optional field names so the
      // anon-class ctor and `recordAnonClass` can mark which positions accept
      // an auto-filled `undefined` at the object-literal expression site.
      const optionalFields = new Set<string>();
      for (const m of node.members) {
        if (!ts.isPropertySignature(m)) {
          throw new CodegenError(m, "object literal type only supports plain property signatures (Phase 1.5-6 prep)");
        }
        if (!ts.isIdentifier(m.name)) {
          throw new CodegenError(m, "object literal type property name must be a simple identifier");
        }
        if (m.modifiers) {
          for (const mod of m.modifiers) {
            if (mod.kind !== ts.SyntaxKind.ReadonlyKeyword) {
              throw new CodegenError(mod, `object literal type property modifier '${ts.SyntaxKind[mod.kind]}' is unsupported (Phase 1.5-6 prep)`);
            }
          }
        }
        if (!m.type) {
          throw new CodegenError(m, "object literal type property requires a type annotation");
        }
        const fname = m.name.text;
        if (fields.has(fname)) {
          throw new CodegenError(m, `duplicate property '${fname}' in object literal type`);
        }
        const annot = this.typeFromAnnotation(m.type, m);
        this.assertNotVoid(annot, m, "object literal type property");
        // Phase 1.5-6 prep-optional-param: `f?: T` is the syntactic sugar for
        // `f: T | undefined`. Lift here so structural dedupe (canonical key
        // includes typeIdent) collapses `{ f?: T }` and `{ f: T | undefined }`
        // to the same anon class.
        const fty = m.questionToken ? makeUnion([annot, T_UNDEFINED]) : annot;
        if (m.questionToken) optionalFields.add(fname);
        fields.set(fname, fty);
      }
      const anonName = this.recordAnonClass(fields, optionalFields, node);
      return classOf(anonName);
    }
    unsupported(node, "type");
  }

  private formatSignature(fn: ts.FunctionDeclaration): string {
    const ret = this.typeFromAnnotation(fn.type, fn);
    // Phase 1.5-6 prep: `formatSignature` is the early C declaration pass; it
    // must agree with `collectParams` on the lowered C type for each param
    // (otherwise `int f(...)` and `int f(double, topaz_opt_number)` would
    // disagree). Run the same `?` -> `T | undefined` rewrite here.
    const params = this.collectParams(fn.parameters)
      .map((p) => `${cTypeName(p.type)} ${p.name}`)
      .join(", ");
    return `static ${cReturnTypeName(ret)} ${fn.name!.text}(${params || "void"})`;
  }

  private emitFunctionDefinition(fn: ts.FunctionDeclaration): string {
    if (!fn.body) throw new CodegenError(fn, "function must have a body");
    const sig = this.functionSigs.get(fn.name!.text)!;
    const prevRet = this.currentReturnType;
    this.currentReturnType = sig.returnType;
    this.scope.push();
    try {
      // Phase 1.5-6 prep-optional-param: declare each param using the lifted
      // type from `sig.params` (where `?`-marked params already carry
      // `T | undefined`), not the raw annotation — otherwise narrowing would
      // disagree with the actual C parameter type.
      for (const p of sig.params) {
        this.scope.declare(p.name, p.type, /* isConst */ false, fn);
      }
      const body = this.emitBlock(fn.body, 0);
      return `${this.formatSignature(fn)} ${body}`;
    } finally {
      this.scope.pop();
      this.currentReturnType = prevRet;
    }
  }

  // Phase 1.4c-2: format a monomorph's C signature from its resolved
  // FunctionSig. Distinct from formatSignature(fn) which re-resolves via
  // typeFromAnnotation; here the substitution has already been applied and we
  // want the mangled name instead of the source name.
  private formatMonomorphSignature(mangled: string, sig: FunctionSig): string {
    const params = sig.params
      .map((p) => `${cTypeName(p.type)} ${p.name}`)
      .join(", ");
    return `static ${cReturnTypeName(sig.returnType)} ${mangled}(${params || "void"})`;
  }

  private emitMonomorphDefinition(mono: MonomorphInfo): string {
    if (!mono.decl.body) throw new CodegenError(mono.decl, "function must have a body");
    const prevScope = this.typeParamScope;
    this.typeParamScope = mono.subs;
    const prevRet = this.currentReturnType;
    this.currentReturnType = mono.sig.returnType;
    this.scope.push();
    try {
      for (const p of mono.sig.params) {
        this.scope.declare(p.name, p.type, /* isConst */ false, mono.decl);
      }
      const body = this.emitBlock(mono.decl.body, 0);
      return `${this.formatMonomorphSignature(mono.mangled, mono.sig)} ${body}`;
    } finally {
      this.scope.pop();
      this.currentReturnType = prevRet;
      this.typeParamScope = prevScope;
    }
  }

  // Phase 1.5-3.5e: derive the fn type of an arrow expression without
  // emitting code. Used by inferType when the arrow appears in a position
  // that needs only its type (e.g. as the RHS of a `let f = ...` whose
  // initializer is being typed before the matching declareVar runs the
  // emit path).
  private inferArrowType(arrow: ts.ArrowFunction, expectedType: TopazType | undefined): TopazType {
    const expectedFn = expectedType && expectedType.kind === "fn" ? expectedType : undefined;
    if (expectedFn && expectedFn.params.length !== arrow.parameters.length) {
      throw new CodegenError(
        arrow,
        `arrow function arity ${arrow.parameters.length} does not match expected type ${typeIdent(expectedFn)} (arity ${expectedFn.params.length})`,
      );
    }
    const params: ParamInfo[] = [];
    for (let i = 0; i < arrow.parameters.length; i++) {
      const p = arrow.parameters[i]!;
      if (!ts.isIdentifier(p.name)) {
        throw new CodegenError(p, "arrow function parameter must be a simple identifier");
      }
      let pt: TopazType;
      if (p.type) {
        pt = this.typeFromAnnotation(p.type, p);
      } else if (expectedFn) {
        pt = expectedFn.params[i]!.type;
      } else {
        throw new CodegenError(p, "arrow function parameter requires a type annotation (no contextual type available)");
      }
      params.push({ name: p.name.text, type: pt, isOptional: false });
    }
    let returnType: TopazType;
    if (arrow.type) {
      returnType = this.typeFromAnnotation(arrow.type, arrow);
    } else if (expectedFn) {
      returnType = expectedFn.returnType;
    } else {
      throw new CodegenError(arrow, "arrow function requires an explicit return type annotation (no contextual type available)");
    }
    if (returnType.kind === "void") {
      throw new CodegenError(arrow, "arrow functions cannot return `void` (Phase 1.5-6 prep)");
    }
    return { kind: "fn", params, returnType };
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
    cb: ts.Expression,
    paramTypes: readonly TopazType[],
    label: string,
  ): Extract<TopazType, { kind: "fn" }> {
    if (ts.isArrowFunction(cb)) {
      if (cb.parameters.length !== paramTypes.length) {
        throw new CodegenError(
          cb,
          `${label} callback arity ${cb.parameters.length} does not match expected ${paramTypes.length}`,
        );
      }
      const params: ParamInfo[] = [];
      const seenNames = new Set<string>();
      for (let i = 0; i < cb.parameters.length; i++) {
        const p = cb.parameters[i]!;
        if (!ts.isIdentifier(p.name)) {
          throw new CodegenError(p, "arrow function parameter must be a simple identifier (destructuring is unsupported)");
        }
        if (p.questionToken || p.initializer || p.dotDotDotToken) {
          throw new CodegenError(p, "optional/default/rest arrow parameters are unsupported");
        }
        const pt = paramTypes[i]!;
        if (p.type) {
          const annot = this.typeFromAnnotation(p.type, p);
          if (!typeEq(annot, pt)) {
            throw new CodegenError(
              p,
              `${label} callback parameter type ${typeIdent(annot)} does not match expected ${typeIdent(pt)}`,
            );
          }
        }
        if (seenNames.has(p.name.text)) {
          throw new CodegenError(p, `duplicate parameter name '${p.name.text}'`);
        }
        seenNames.add(p.name.text);
        params.push({ name: p.name.text, type: pt, isOptional: false });
      }
      let returnType: TopazType;
      if (cb.type) {
        returnType = this.typeFromAnnotation(cb.type, cb);
      } else if (!ts.isBlock(cb.body)) {
        // Expression body: push the params into a fresh scope so inferType
        // can resolve identifier references to them, then pop. We don't
        // install a closure barrier here — type inference is read-only and
        // peeking into outer locals doesn't affect the eventual capture
        // analysis done by emitArrowFunction.
        this.scope.push();
        try {
          for (const p of params) {
            this.scope.declare(p.name, p.type, /* isConst */ false, cb);
          }
          returnType = this.inferType(cb.body as ts.Expression);
        } finally {
          this.scope.pop();
        }
      } else {
        throw new CodegenError(
          cb,
          `block-bodied arrow callback requires an explicit return type annotation`,
        );
      }
      if (returnType.kind === "void") {
        throw new CodegenError(cb, `${label} callback cannot return \`void\` (Phase 1.5-6 prep)`);
      }
      return { kind: "fn", params, returnType };
    }
    const t = this.inferType(cb);
    if (t.kind !== "fn") {
      throw new CodegenError(cb, `${label} callback must be a function value, got ${typeIdent(t)}`);
    }
    if (t.params.length !== paramTypes.length) {
      throw new CodegenError(
        cb,
        `${label} callback arity ${t.params.length} does not match expected ${paramTypes.length}`,
      );
    }
    for (let i = 0; i < paramTypes.length; i++) {
      if (!typeEq(t.params[i]!.type, paramTypes[i]!)) {
        throw new CodegenError(
          cb,
          `${label} callback parameter ${i} type ${typeIdent(t.params[i]!.type)} does not match expected ${typeIdent(paramTypes[i]!)}`,
        );
      }
    }
    return t;
  }

  // Phase 1.5-3.5e: emit a typedef for a fn signature. The struct holds a
  // function pointer that takes `void *env` as its hidden first parameter
  // followed by the user-visible params, and a generic env pointer that the
  // arrow's body uses to reach its captures. Both fields are present even for
  // arrows with no captures (env is just NULL) so the call site dispatch is
  // uniform.
  private emitFnTypedef(t: TopazType): string {
    if (t.kind !== "fn") throw new Error("emitFnTypedef: not a fn type");
    const name = typeIdent(t);
    const ret = cTypeName(t.returnType);
    const paramList = t.params.length === 0
      ? "void *"
      : ["void *", ...t.params.map((p) => cTypeName(p.type))].join(", ");
    return `typedef struct ${name} {\n  ${ret} (*fn)(${paramList});\n  void *env;\n} ${name};`;
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
  private emitArrowFunction(arrow: ts.ArrowFunction, expectedType?: TopazType): string {
    // Reject unsupported syntax up front. Generic / async / default / rest /
    // destructuring all force special-case lowering that we don't yet plan to
    // support, so calling them out explicitly beats a confusing downstream
    // error.
    if (arrow.typeParameters && arrow.typeParameters.length > 0) {
      throw new CodegenError(arrow, "generic arrow functions are unsupported (Phase 1.5-3.5e)");
    }
    if (arrow.modifiers && arrow.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      throw new CodegenError(arrow, "async arrow functions are unsupported");
    }

    // Param types: annotation is mandatory unless the expected fn type can
    // contextually supply them. Default / optional / rest / destructuring are
    // all rejected. Names must be unique.
    const expectedFn = expectedType && expectedType.kind === "fn" ? expectedType : undefined;
    if (expectedFn && expectedFn.params.length !== arrow.parameters.length) {
      throw new CodegenError(
        arrow,
        `arrow function arity ${arrow.parameters.length} does not match expected type ${typeIdent(expectedFn)} (arity ${expectedFn.params.length})`,
      );
    }
    const params: ParamInfo[] = [];
    const seenNames = new Set<string>();
    for (let i = 0; i < arrow.parameters.length; i++) {
      const p = arrow.parameters[i]!;
      if (!ts.isIdentifier(p.name)) {
        throw new CodegenError(p, "arrow function parameter must be a simple identifier (destructuring is unsupported)");
      }
      if (p.questionToken || p.initializer || p.dotDotDotToken) {
        throw new CodegenError(p, "optional/default/rest arrow parameters are unsupported");
      }
      let pt: TopazType;
      if (p.type) {
        pt = this.typeFromAnnotation(p.type, p);
      } else if (expectedFn) {
        pt = expectedFn.params[i]!.type;
      } else {
        throw new CodegenError(p, "arrow function parameter requires a type annotation (no contextual type available)");
      }
      this.assertNotVoid(pt, p, "arrow parameter");
      if (pt.kind === "fn") {
        throw new CodegenError(p, "nested fn types in arrow parameters are unsupported (Phase 1.5-3.5e)");
      }
      if (seenNames.has(p.name.text)) {
        throw new CodegenError(p, `duplicate parameter name '${p.name.text}'`);
      }
      seenNames.add(p.name.text);
      params.push({ name: p.name.text, type: pt, isOptional: false });
    }

    // Return type: annotation required (we don't infer from body yet) unless
    // an expected fn type supplies it.
    let returnType: TopazType;
    if (arrow.type) {
      returnType = this.typeFromAnnotation(arrow.type, arrow);
    } else if (expectedFn) {
      returnType = expectedFn.returnType;
    } else {
      throw new CodegenError(arrow, "arrow function requires an explicit return type annotation (no contextual type available)");
    }
    // Phase 1.5-6 prep: void arrow return types are gated together with fn-
    // type return voidness — the call-site dispatch yields a value, expression
    // body becomes `return <expr>`, and we'd need to special-case both. Keep
    // void confined to function / method declarations for now.
    if (returnType.kind === "void") {
      throw new CodegenError(arrow, "arrow functions cannot return `void` (Phase 1.5-6 prep)");
    }
    if (returnType.kind === "fn") {
      throw new CodegenError(arrow, "nested fn types in arrow return position are unsupported (Phase 1.5-3.5e)");
    }

    const arrowType: TopazType = { kind: "fn", params, returnType };
    this.recordFnMonomorph(arrowType);

    // Body: rewrite expression-bodied arrows (`(x) => x + 1`) into a single
    // `return` statement so the same emit path works for both forms.
    const id = this.arrowCounter++;
    const fnName = `__topaz_arrow_${id}`;
    const envName = `__topaz_env_${id}`;

    // Capture analysis: walk the body AST collecting free identifiers that
    // resolve to outer-scope bindings via `lookupAcrossBarrier`. Locals
    // declared inside the body and the param names themselves are excluded.
    const captures = new Map<string, TopazType>();
    this.collectCaptures(arrow, new Set(params.map((p) => p.name)), captures);

    const envIsEmpty = captures.size === 0;
    const envTypedef = envIsEmpty
      ? ""
      : `typedef struct ${envName} {\n${[...captures.entries()].map(([n, t]) => `  ${cTypeName(t)} ${n};`).join("\n")}\n} ${envName};`;

    // Emit the body with a barrier in place. Set captureContext so identifier
    // emission can route reads through `((${envName} *)__topaz_env)->name`
    // instead of the raw identifier.
    const prevCaptureContext = this.captureContext;
    const prevRet = this.currentReturnType;
    this.captureContext = { envType: envName, envIsEmpty, captures };
    this.currentReturnType = returnType;
    // Barrier must come BEFORE the scope.push so that the new (inner) frame
    // sits at the barrier floor and lookups within the body can still see
    // it. Outer frames remain hidden behind the barrier.
    this.scope.pushBarrier();
    this.scope.push();
    try {
      for (const p of params) {
        this.scope.declare(p.name, p.type, /* isConst */ false, arrow);
      }
      let bodyText: string;
      if (ts.isBlock(arrow.body)) {
        bodyText = this.emitBlock(arrow.body, 0);
      } else {
        // Expression body: wrap in `{ return <expr>; }`. emitWithExpected
        // applies the return-type coercion (class -> iface, scalar -> opt
        // wrap, etc.) the same way an explicit `return` statement would.
        const exprStr = this.emitWithExpected(arrow.body as ts.Expression, returnType);
        bodyText = `{\n  return ${exprStr};\n}`;
      }

      // C function signature: env is `void *` so the same callable shape
      // works for both capturing and non-capturing arrows.
      const paramDecls = params.map((p) => `${cTypeName(p.type)} ${p.name}`).join(", ");
      const fnSig = `static ${cTypeName(returnType)} ${fnName}(void *__topaz_env${paramDecls.length > 0 ? ", " + paramDecls : ""})`;

      // Splice the env typedef (if any) + the arrow's forward declaration
      // into the fwd slot; the full body goes into the def slot. This lets a
      // function that returns an arrow reference `__topaz_arrow_<N>` and
      // `__topaz_env_<N>` by name in its body even though the actual
      // definition lands later in the C file.
      const fwdLines: string[] = [];
      if (envTypedef) fwdLines.push(envTypedef);
      fwdLines.push(`${fnSig};`);
      this.arrowFwdLines.push(fwdLines.join("\n"));
      this.arrowDefLines.push(`${fnSig} ${bodyText}`);
    } finally {
      this.scope.pop();
      this.scope.popBarrier();
      this.captureContext = prevCaptureContext;
      this.currentReturnType = prevRet;
    }

    // Build the call-site compound literal. Allocate the env on the arena
    // and copy each captured value in. Non-capturing arrows just take a NULL
    // env pointer.
    const fnTypeName = typeIdent(arrowType);
    if (envIsEmpty) {
      return `((${fnTypeName}){ .fn = (${cTypeName(returnType)}(*)(void *${params.map((p) => ", " + cTypeName(p.type)).join("")}))${fnName}, .env = NULL })`;
    }
    const envExprParts: string[] = [];
    for (const [name, t] of captures) {
      // Emit each capture using the *outer* scope. The barrier is already
      // popped, so a plain emitExpression reads from the correct frame.
      // Use a fresh tmp-free expression: re-emit the identifier the same way
      // the outer scope sees it.
      const captureExpr = this.emitCapturedIdentifier(name, t, arrow);
      envExprParts.push(`.${name} = ${captureExpr}`);
    }
    const envInit = `({ ${envName} *__e = topaz_arena_alloc(sizeof(${envName})); *__e = (${envName}){ ${envExprParts.join(", ")} }; __e; })`;
    return `((${fnTypeName}){ .fn = (${cTypeName(returnType)}(*)(void *${params.map((p) => ", " + cTypeName(p.type)).join("")}))${fnName}, .env = ${envInit} })`;
  }

  // Phase 1.5-3.5e: emit an identifier as the outer scope sees it (for
  // capture initialization). Handles narrowed scalar opt unions and narrowed
  // dunion / unknown the same way emitExpression's identifier branch does.
  private emitCapturedIdentifier(name: string, _capturedType: TopazType, anchor: ts.Node): string {
    const b = this.scope.lookup(name);
    if (!b) throw new CodegenError(anchor, `capture '${name}' is not visible at the arrow construction site`);
    const base = this.scope.lookupBase(name)!;
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
    arrow: ts.ArrowFunction,
    paramNames: ReadonlySet<string>,
    captures: Map<string, TopazType>,
  ): void {
    const locals = new Set<string>(paramNames);
    const visit = (node: ts.Node): void => {
      // Track new local bindings before descending.
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        locals.add(node.name.text);
      }
      if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
        locals.add(node.name.text);
      }
      // ForOf: binding declared in initializer becomes local.
      if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)) {
        for (const d of node.initializer.declarations) {
          if (ts.isIdentifier(d.name)) locals.add(d.name.text);
        }
      }
      // Catch clause: binding name becomes local.
      if (ts.isCatchClause(node) && node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)) {
        locals.add(node.variableDeclaration.name.text);
      }
      // Nested arrow: stop descending into its body — but we DO need to
      // collect its free identifiers w.r.t. *our* scope (since transitively
      // they become our captures too). Run a recursive walk that treats the
      // inner arrow's params + its own locals as off-limits.
      if (ts.isArrowFunction(node) && node !== arrow) {
        const innerParams = new Set<string>();
        for (const p of node.parameters) {
          if (ts.isIdentifier(p.name)) innerParams.add(p.name.text);
        }
        const innerCaps = new Map<string, TopazType>();
        // Recurse but accumulate into a separate set; then merge into our
        // captures (filtered by what's still resolved outside *our* params /
        // locals).
        const innerLocals = new Set<string>(innerParams);
        const innerVisit = (n: ts.Node): void => {
          if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) innerLocals.add(n.name.text);
          if (ts.isForOfStatement(n) && ts.isVariableDeclarationList(n.initializer)) {
            for (const d of n.initializer.declarations) if (ts.isIdentifier(d.name)) innerLocals.add(d.name.text);
          }
          if (ts.isCatchClause(n) && n.variableDeclaration && ts.isIdentifier(n.variableDeclaration.name)) {
            innerLocals.add(n.variableDeclaration.name.text);
          }
          if (ts.isIdentifier(n) && !innerLocals.has(n.text) && !isBuiltinName(n.text)) {
            if (!isReferencePosition(n)) return;
            const b = this.scope.lookupAcrossBarrier(n.text);
            if (b) innerCaps.set(n.text, b.type);
          }
          ts.forEachChild(n, innerVisit);
        };
        ts.forEachChild(node, innerVisit);
        // Promote inner captures into our captures if they're not our locals.
        for (const n of innerCaps.keys()) {
          if (locals.has(n)) continue;
          if (captures.has(n)) continue;
          const b = this.scope.lookupAcrossBarrier(n);
          if (b) captures.set(n, b.type);
        }
        return;
      }
      if (ts.isIdentifier(node) && !locals.has(node.text) && !isBuiltinName(node.text)) {
        if (isReferencePosition(node)) {
          const b = this.scope.lookupAcrossBarrier(node.text);
          if (b && !captures.has(node.text)) {
            captures.set(node.text, b.type);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    if (ts.isBlock(arrow.body)) {
      for (const s of arrow.body.statements) visit(s);
    } else {
      visit(arrow.body);
    }
  }

  // Phase 1.4c-2: resolve a call to a generic function. Returns the mangled
  // name and the substituted FunctionSig; registers the monomorph (and adds
  // it to the worklist) on first observation. Returns undefined if `callee`
  // doesn't name a generic function — caller falls back to concrete dispatch.
  private resolveGenericCall(
    callee: ts.Identifier,
    expr: ts.CallExpression,
  ): { mangled: string; sig: FunctionSig } | undefined {
    const generic = this.genericFunctions.get(callee.text);
    if (!generic) return undefined;

    const subs = new Map<string, TopazType>();

    if (expr.typeArguments && expr.typeArguments.length > 0) {
      if (expr.typeArguments.length !== generic.typeParams.length) {
        throw new CodegenError(
          expr,
          `${callee.text} expects ${generic.typeParams.length} type argument(s), got ${expr.typeArguments.length}`,
        );
      }
      for (let i = 0; i < generic.typeParams.length; i++) {
        // Type arguments can themselves reference the surrounding scope's
        // type parameters (when a generic body calls another generic), so
        // typeFromAnnotation must run with the outer typeParamScope still
        // active. We don't swap it here.
        const t = this.typeFromAnnotation(expr.typeArguments[i]!, expr);
        subs.set(generic.typeParams[i]!, t);
      }
    } else {
      // Best-effort inference: walk each parameter type node against the
      // corresponding argument's inferred type, binding type parameters as
      // we go. Concrete portions don't contribute. After the walk, every
      // declared type parameter must be bound.
      if (expr.arguments.length !== generic.decl.parameters.length) {
        throw new CodegenError(
          expr,
          `${callee.text}() expects ${generic.decl.parameters.length} argument(s), got ${expr.arguments.length}`,
        );
      }
      for (let i = 0; i < generic.decl.parameters.length; i++) {
        const param = generic.decl.parameters[i]!;
        if (!param.type) {
          throw new CodegenError(param, "generic function parameter requires a type annotation");
        }
        const argType = this.inferType(expr.arguments[i]!);
        this.unifyTypeParam(param.type, argType, generic.typeParams, subs, expr);
      }
      for (const tp of generic.typeParams) {
        if (!subs.has(tp)) {
          throw new CodegenError(
            expr,
            `cannot infer type parameter '${tp}' for ${callee.text}; provide explicit type arguments`,
          );
        }
      }
    }

    const typeArgs = generic.typeParams.map((tp) => subs.get(tp)!);
    const mangled = mangleMonomorph(generic.name, typeArgs);

    const existing = this.genericMonomorphs.get(mangled);
    if (existing) {
      return { mangled, sig: existing.sig };
    }

    // First time we've seen this (function, typeArgs) tuple — resolve the
    // signature under the new substitution and queue body emission.
    const prevScope = this.typeParamScope;
    this.typeParamScope = subs;
    let sig: FunctionSig;
    try {
      const returnType = this.typeFromAnnotation(generic.decl.type, generic.decl);
      const params = this.collectParams(generic.decl.parameters);
      sig = { params, returnType };
    } finally {
      this.typeParamScope = prevScope;
    }

    const mono: MonomorphInfo = {
      mangled,
      origName: generic.name,
      typeArgs,
      subs,
      sig,
      decl: generic.decl,
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
    typeArgNodes: readonly ts.TypeNode[] | undefined,
    anchor: ts.Node,
  ): TopazType {
    const generic = this.genericClasses.get(refName)!;
    if (!typeArgNodes || typeArgNodes.length !== generic.typeParams.length) {
      throw new CodegenError(
        anchor,
        `${refName} expects ${generic.typeParams.length} type argument(s), got ${typeArgNodes?.length ?? 0}`,
      );
    }
    // Type args can themselves reference the surrounding type-param scope
    // (e.g. a generic class field of type `Box<T>`), so resolve under the
    // current scope without swapping.
    const subs = new Map<string, TopazType>();
    for (let i = 0; i < generic.typeParams.length; i++) {
      const t = this.typeFromAnnotation(typeArgNodes[i]!, anchor);
      subs.set(generic.typeParams[i]!, t);
    }
    const typeArgs = generic.typeParams.map((tp) => subs.get(tp)!);
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
    };
    this.classes.set(mangled, info);
    this.classMonomorphs.set(mangled, { mangled, origName: generic.name, typeArgs, subs });
    this.classMonomorphWorklist.push(mangled);
    // Collect fields/methods under the substitution. typeParamScope is the
    // same channel generic functions use; typeFromAnnotation already
    // consults it before falling through to class/interface lookups.
    const prevScope = this.typeParamScope;
    this.typeParamScope = subs;
    try {
      this.collectClassMembers(generic.decl, info);
    } finally {
      this.typeParamScope = prevScope;
    }
    return classOf(mangled);
  }

  // Structural unifier: matches a parameter's TypeNode against an argument's
  // concrete TopazType, binding type parameters where it can. Anything it
  // can't decompose (mismatched shapes, type forms we don't introspect) is
  // silently skipped — the caller checks at the end that every parameter was
  // bound, and the per-argument coercion at emitCall surfaces any real
  // mismatches with a type-error message.
  private unifyTypeParam(
    paramTypeNode: ts.TypeNode,
    argType: TopazType,
    params: string[],
    subs: Map<string, TopazType>,
    anchor: ts.Node,
  ): void {
    if (ts.isParenthesizedTypeNode(paramTypeNode)) {
      this.unifyTypeParam(paramTypeNode.type, argType, params, subs, anchor);
      return;
    }
    if (ts.isArrayTypeNode(paramTypeNode)) {
      if (!isArrayType(argType)) return;
      const elem = arrayElem(argType);
      if (elem === undefined) return;
      this.unifyTypeParam(paramTypeNode.elementType, elem, params, subs, anchor);
      return;
    }
    if (ts.isTypeReferenceNode(paramTypeNode) && ts.isIdentifier(paramTypeNode.typeName)) {
      const refName = paramTypeNode.typeName.text;
      if (params.includes(refName)) {
        if (paramTypeNode.typeArguments && paramTypeNode.typeArguments.length > 0) {
          throw new CodegenError(
            paramTypeNode,
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
      if (
        refName === "Array" &&
        paramTypeNode.typeArguments &&
        paramTypeNode.typeArguments.length === 1
      ) {
        if (!isArrayType(argType)) return;
        const elem = arrayElem(argType);
        if (elem === undefined) return;
        this.unifyTypeParam(paramTypeNode.typeArguments[0]!, elem, params, subs, anchor);
        return;
      }
      if (
        refName === "Map" &&
        paramTypeNode.typeArguments &&
        paramTypeNode.typeArguments.length === 2
      ) {
        if (!isMapType(argType)) return;
        const k = mapKey(argType);
        const v = mapValue(argType);
        if (k === undefined || v === undefined) return;
        this.unifyTypeParam(paramTypeNode.typeArguments[0]!, k, params, subs, anchor);
        this.unifyTypeParam(paramTypeNode.typeArguments[1]!, v, params, subs, anchor);
        return;
      }
      if (
        refName === "Set" &&
        paramTypeNode.typeArguments &&
        paramTypeNode.typeArguments.length === 1
      ) {
        if (!isSetType(argType)) return;
        const elem = setElem(argType);
        if (elem === undefined) return;
        this.unifyTypeParam(paramTypeNode.typeArguments[0]!, elem, params, subs, anchor);
        return;
      }
      // Phase 1.4c-3: generic class on the parameter side. The argument's
      // TopazType is a regular class type whose name is the mangled monomorph;
      // we recover the original generic + per-position type args from
      // `classMonomorphs` and unify pairwise.
      if (
        this.genericClasses.has(refName) &&
        paramTypeNode.typeArguments &&
        paramTypeNode.typeArguments.length > 0
      ) {
        if (!isClassType(argType)) return;
        const argClassName = classNameOf(argType)!;
        const argMono = this.classMonomorphs.get(argClassName);
        if (!argMono || argMono.origName !== refName) return;
        if (argMono.typeArgs.length !== paramTypeNode.typeArguments.length) return;
        for (let i = 0; i < paramTypeNode.typeArguments.length; i++) {
          this.unifyTypeParam(
            paramTypeNode.typeArguments[i]!,
            argMono.typeArgs[i]!,
            params,
            subs,
            anchor,
          );
        }
        return;
      }
      // Concrete class/interface/scalar reference — nothing to bind.
    }
  }

  private emitBlock(block: ts.Block, indent: number): string {
    const pad = "  ".repeat(indent);
    const lines: string[] = [];
    for (const s of block.statements) {
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
  private applyCarryNarrowing(stmt: ts.Statement): void {
    if (!ts.isIfStatement(stmt)) return;
    const thenExits = this.alwaysExits(stmt.thenStatement);
    const elseExits = stmt.elseStatement ? this.alwaysExits(stmt.elseStatement) : false;
    let carryPolarity: boolean | undefined;
    if (thenExits && !stmt.elseStatement) carryPolarity = false;
    else if (thenExits && !elseExits) carryPolarity = false;
    else if (!thenExits && elseExits) carryPolarity = true;
    else return;
    const n = this.extractNarrowing(stmt.expression, carryPolarity);
    if (n) this.scope.narrow(n.name, n.type);
  }

  // Phase 1.5-3d: conservative "this statement always exits the enclosing
  // function/loop" predicate. Used for early-return narrowing only — false
  // negatives just disable narrowing, never produce wrong code.
  private alwaysExits(stmt: ts.Statement): boolean {
    if (ts.isReturnStatement(stmt)) return true;
    if (ts.isThrowStatement(stmt)) return true;
    if (ts.isBreakStatement(stmt)) return true;
    if (ts.isContinueStatement(stmt)) return true;
    if (ts.isBlock(stmt)) {
      if (stmt.statements.length === 0) return false;
      return this.alwaysExits(stmt.statements[stmt.statements.length - 1]!);
    }
    if (ts.isIfStatement(stmt) && stmt.elseStatement) {
      return this.alwaysExits(stmt.thenStatement) && this.alwaysExits(stmt.elseStatement);
    }
    return false;
  }

  // Phase 1.5-3d: parse `x !== undefined` / `x === undefined` (either argument
  // order) into a single-identifier narrowing. `polarity = true` means the
  // expression is true (then-branch); `false` is else-branch / inverted carry.
  // Returns undefined when no narrowing can be inferred.
  private extractNarrowing(
    cond: ts.Expression,
    polarity: boolean,
  ): { name: string; type: TopazType } | undefined {
    if (!ts.isBinaryExpression(cond)) return undefined;
    const tok = cond.operatorToken.kind;
    // Phase 1.5-3f: `<id> instanceof ClassName` narrows id from `unknown` to
    // the concrete class on the positive branch. The negative branch can't
    // narrow (id could still be any other class), so we only return for
    // polarity === true.
    if (tok === ts.SyntaxKind.InstanceOfKeyword) {
      if (!polarity) return undefined;
      if (!ts.isIdentifier(cond.left)) return undefined;
      if (!ts.isIdentifier(cond.right)) return undefined;
      const b = this.scope.lookup(cond.left.text);
      if (!b || b.type.kind !== "unknown") return undefined;
      if (!this.classes.has(cond.right.text)) return undefined;
      return { name: cond.left.text, type: classOf(cond.right.text) };
    }
    if (
      tok !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
      tok !== ts.SyntaxKind.ExclamationEqualsEqualsToken
    ) {
      return undefined;
    }
    const leftIsUndef = ts.isIdentifier(cond.left) && cond.left.text === "undefined";
    const rightIsUndef = ts.isIdentifier(cond.right) && cond.right.text === "undefined";
    if (leftIsUndef === rightIsUndef) return undefined;
    const varNode = leftIsUndef ? cond.right : cond.left;
    if (!ts.isIdentifier(varNode)) return undefined;
    const b = this.scope.lookup(varNode.text);
    if (!b) return undefined;
    if (!containsUndefined(b.type)) return undefined;
    // Strip-undefined when `(x !== undefined)` is true, or `(x === undefined)` is false.
    const stripUndef =
      (tok === ts.SyntaxKind.ExclamationEqualsEqualsToken) === polarity;
    if (stripUndef) {
      const inner = withoutUndefined(b.type);
      if (!inner) return undefined;
      return { name: varNode.text, type: inner };
    }
    return { name: varNode.text, type: T_UNDEFINED };
  }

  private emitStatement(stmt: ts.Statement, indent: number): string {
    const pad = "  ".repeat(indent);

    if (ts.isReturnStatement(stmt)) {
      if (!this.currentReturnType) {
        throw new CodegenError(stmt, "`return` outside of a function or method");
      }
      if (!stmt.expression) {
        if (this.currentReturnType.kind !== "void") {
          throw new CodegenError(
            stmt,
            `\`return;\` is only allowed in a void-returning function (current return type is ${typeIdent(this.currentReturnType)})`,
          );
        }
        return `${pad}return;`;
      }
      if (this.currentReturnType.kind === "void") {
        throw new CodegenError(
          stmt,
          "`return <expr>;` is not allowed in a void-returning function (use a bare `return;` or remove it)",
        );
      }
      return `${pad}return ${this.emitWithExpected(stmt.expression, this.currentReturnType)};`;
    }

    if (ts.isExpressionStatement(stmt)) {
      return `${pad}${this.emitExpression(stmt.expression)};`;
    }

    if (ts.isVariableStatement(stmt)) {
      return this.emitVarDecls(stmt.declarationList, indent);
    }

    if (ts.isIfStatement(stmt)) {
      this.expectType(stmt.expression, T_BOOLEAN);
      const cond = this.emitExpression(stmt.expression);
      // Phase 1.5-3d: extract narrowings BEFORE emitting branches so each
      // side sees the right narrowed view of the variable.
      const thenN = this.extractNarrowing(stmt.expression, true);
      const elseN = this.extractNarrowing(stmt.expression, false);
      const thenStr = this.emitStatementAsBlock(stmt.thenStatement, indent, thenN);
      let out = `${pad}if (${cond}) ${thenStr.trimStart()}`;
      if (stmt.elseStatement) {
        const elseStr = this.emitStatementAsBlock(stmt.elseStatement, indent, elseN);
        out += ` else ${elseStr.trimStart()}`;
      }
      return out;
    }

    if (ts.isWhileStatement(stmt)) {
      this.expectType(stmt.expression, T_BOOLEAN);
      const cond = this.emitExpression(stmt.expression);
      const body = this.emitStatementAsBlock(stmt.statement, indent);
      return `${pad}while (${cond}) ${body.trimStart()}`;
    }

    if (ts.isDoStatement(stmt)) {
      this.expectType(stmt.expression, T_BOOLEAN);
      const cond = this.emitExpression(stmt.expression);
      const body = this.emitStatementAsBlock(stmt.statement, indent);
      return `${pad}do ${body.trimStart()} while (${cond});`;
    }

    if (ts.isForStatement(stmt)) {
      return this.emitForStatement(stmt, indent);
    }

    if (ts.isForOfStatement(stmt)) {
      return this.emitForOfStatement(stmt, indent);
    }

    if (ts.isForInStatement(stmt)) {
      throw new CodegenError(
        stmt,
        "`for-in` is unsupported; use `for-of` over an Array or an index-based for-loop",
      );
    }

    if (ts.isSwitchStatement(stmt)) {
      return this.emitSwitchStatement(stmt, indent);
    }

    if (ts.isBreakStatement(stmt)) {
      if (stmt.label) unsupported(stmt, "labeled break");
      return `${pad}break;`;
    }

    if (ts.isContinueStatement(stmt)) {
      if (stmt.label) unsupported(stmt, "labeled continue");
      this.checkContinueAllowed(stmt);
      return `${pad}continue;`;
    }

    if (ts.isBlock(stmt)) {
      this.scope.push();
      const out = this.emitBlock(stmt, indent);
      this.scope.pop();
      return out;
    }

    if (ts.isThrowStatement(stmt)) {
      return this.emitThrowStatement(stmt, indent);
    }

    if (ts.isTryStatement(stmt)) {
      return this.emitTryStatement(stmt, indent);
    }

    unsupported(stmt, "statement");
  }

  // Phase 1.5-1: throw a class instance. The runtime helper expects `void *`
  // (implicit conversion from any object pointer), so no explicit cast on the
  // emitting side. We require the thrown value to be a class type so the
  // catch site has a single C type to cast back to.
  private emitThrowStatement(stmt: ts.ThrowStatement, indent: number): string {
    const pad = "  ".repeat(indent);
    if (!stmt.expression) {
      throw new CodegenError(stmt, "bare `throw;` is unsupported; throw an explicit value");
    }
    const t = this.inferType(stmt.expression);
    if (!isClassType(t)) {
      throw new CodegenError(
        stmt.expression,
        `throw value must be a class instance (got ${typeIdent(t)})`,
      );
    }
    return `${pad}topaz_throw(${this.emitExpression(stmt.expression)});`;
  }

  // Phase 1.5-1: try/catch. setjmp returns 0 on the initial call (run body
  // then pop the frame), nonzero after a longjmp from topaz_throw (frame is
  // already popped by topaz_throw; catch body just rebinds the global
  // throw_value to the annotated class type). finally and bare-binding catch
  // are deferred; return/break/continue inside the try body are rejected
  // because they would skip the pop.
  private emitTryStatement(stmt: ts.TryStatement, indent: number): string {
    const pad = "  ".repeat(indent);
    if (stmt.finallyBlock) {
      throw new CodegenError(stmt.finallyBlock, "`finally` is unsupported (Phase 1.5-1)");
    }
    if (!stmt.catchClause) {
      throw new CodegenError(stmt, "`try` without a `catch` clause is unsupported");
    }
    const catchClause = stmt.catchClause;
    if (!catchClause.variableDeclaration) {
      throw new CodegenError(
        catchClause,
        "`catch` clause requires a binding (e.g. `catch (e: ClassName)`)",
      );
    }
    const vd = catchClause.variableDeclaration;
    if (!ts.isIdentifier(vd.name)) {
      throw new CodegenError(vd, "catch binding name must be a simple identifier");
    }
    // Phase 1.5-3f: missing annotation defaults to `unknown`, matching TS's
    // strict-mode `catch (e)` type. `: unknown` is also accepted explicitly.
    // The user must then narrow with `if (e instanceof ClassName)` before
    // touching fields/methods.
    let errType: TopazType;
    if (!vd.type) {
      errType = T_UNKNOWN;
    } else {
      errType = this.typeFromAnnotation(vd.type, vd);
      if (errType.kind !== "unknown" && !isClassType(errType)) {
        throw new CodegenError(
          vd.type,
          `\`catch\` binding type must be a class or \`unknown\` (got ${typeIdent(errType)})`,
        );
      }
    }
    this.checkTryBodyNoEscape(stmt.tryBlock);

    const id = this.tmpCounter++;
    const frame = `__topaz_try_${id}`;
    const eName = vd.name.text;

    this.scope.push();
    let tryBodyLines: string[];
    try {
      tryBodyLines = stmt.tryBlock.statements.map((s) => this.emitStatement(s, indent + 2));
    } finally {
      this.scope.pop();
    }

    this.scope.push();
    let catchBodyStr: string;
    try {
      this.scope.declare(eName, errType, /* isConst */ false, vd);
      const catchBodyLines = catchClause.block.statements.map((s) =>
        this.emitStatement(s, indent + 2),
      );
      catchBodyStr = catchBodyLines.join("\n");
    } finally {
      this.scope.pop();
    }

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
    if (catchBodyStr) lines.push(catchBodyStr);
    lines.push(`${pad}  }`);
    lines.push(`${pad}}`);
    return lines.join("\n");
  }

  // Reject return/break/continue inside the try body — those exit the
  // surrounding C block before `topaz_try_pop()` runs, which would leave the
  // frame on the stack pointing at a dead jmp_buf. Skips into nested
  // functions/classes/methods since their control flow doesn't cross the try
  // boundary. Lazy/conservative: doesn't try to distinguish break/continue
  // confined to a loop *inside* the try body — those are technically safe,
  // but we forbid them uniformly to keep the rule one sentence long.
  private checkTryBodyNoEscape(block: ts.Block): void {
    const walk = (node: ts.Node): void => {
      if (ts.isReturnStatement(node)) {
        throw new CodegenError(
          node,
          "`return` inside a `try` body is unsupported (would skip topaz_try_pop)",
        );
      }
      if (ts.isBreakStatement(node)) {
        throw new CodegenError(
          node,
          "`break` inside a `try` body is unsupported (would skip topaz_try_pop); lift the loop out of the try",
        );
      }
      if (ts.isContinueStatement(node)) {
        throw new CodegenError(
          node,
          "`continue` inside a `try` body is unsupported (would skip topaz_try_pop); lift the loop out of the try",
        );
      }
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)
      ) {
        return;
      }
      ts.forEachChild(node, walk);
    };
    for (const s of block.statements) walk(s);
  }

  private emitStatementAsBlock(
    stmt: ts.Statement,
    indent: number,
    narrow?: { name: string; type: TopazType },
  ): string {
    const pad = "  ".repeat(indent);
    if (ts.isBlock(stmt)) {
      this.scope.push();
      if (narrow) this.scope.narrow(narrow.name, narrow.type);
      const out = this.emitBlock(stmt, indent);
      this.scope.pop();
      return out;
    }
    this.scope.push();
    if (narrow) this.scope.narrow(narrow.name, narrow.type);
    const inner = this.emitStatement(stmt, indent + 1);
    this.scope.pop();
    return `${pad}{\n${inner}\n${pad}}`;
  }

  // Phase 1.5-6 prep #9: try to hoist a top-level `const NAME: T = LIT;` to
  // a file-static `static const T NAME = LIT;`. Returns the C declaration
  // line on success (and registers the binding in scope.stack[0] as a
  // side effect); returns undefined for any decl that doesn't qualify
  // (let, multi-binding list, destructuring, no initializer, non-scalar
  // literal initializer, type-annotation mismatch, etc.) — those fall
  // through to the regular emitVarDecls path inside main() body.
  private tryHoistModuleConst(stmt: ts.Statement): string | undefined {
    if (!ts.isVariableStatement(stmt)) return undefined;
    const list = stmt.declarationList;
    const isConst = (list.flags & ts.NodeFlags.Const) !== 0;
    if (!isConst) return undefined;
    if (list.declarations.length !== 1) return undefined;
    const d = list.declarations[0]!;
    if (!ts.isIdentifier(d.name)) return undefined;
    if (!d.initializer) return undefined;
    const lit = this.tryScalarLiteralInit(d.initializer);
    if (!lit) return undefined;
    let type: TopazType = lit.type;
    if (d.type) {
      const annotated = this.typeFromAnnotation(d.type, d);
      if (!typeEq(annotated, lit.type)) return undefined;
      type = annotated;
    }
    const name = d.name.text;
    this.scope.declare(name, type, /* isConst */ true, d);
    return `static const ${cTypeName(type)} ${name} = ${lit.cExpr};`;
  }

  // Phase 1.5-6 prep #9: recognize the set of initializers that are
  // representable as a C compile-time constant expression of scalar type.
  // Only number / boolean literals (with optional unary +/- on number)
  // qualify; string literals are kept in main() body for now because the
  // `topaz_string` struct literal form needs separate accommodation.
  private tryScalarLiteralInit(
    expr: ts.Expression,
  ): { type: TopazType; cExpr: string } | undefined {
    if (ts.isNumericLiteral(expr)) {
      const t = expr.text;
      return { type: T_NUMBER, cExpr: /[.eE]/.test(t) ? t : `${t}.0` };
    }
    if (expr.kind === ts.SyntaxKind.TrueKeyword) {
      return { type: T_BOOLEAN, cExpr: "true" };
    }
    if (expr.kind === ts.SyntaxKind.FalseKeyword) {
      return { type: T_BOOLEAN, cExpr: "false" };
    }
    if (
      ts.isPrefixUnaryExpression(expr) &&
      (expr.operator === ts.SyntaxKind.MinusToken ||
        expr.operator === ts.SyntaxKind.PlusToken) &&
      ts.isNumericLiteral(expr.operand)
    ) {
      const t = expr.operand.text;
      const num = /[.eE]/.test(t) ? t : `${t}.0`;
      const op = expr.operator === ts.SyntaxKind.MinusToken ? "-" : "+";
      return { type: T_NUMBER, cExpr: `${op}${num}` };
    }
    return undefined;
  }

  private emitVarDecls(list: ts.VariableDeclarationList, indent: number): string {
    const pad = "  ".repeat(indent);
    const isConst = (list.flags & ts.NodeFlags.Const) !== 0;
    const isLet = (list.flags & ts.NodeFlags.Let) !== 0;
    if (!isConst && !isLet) {
      throw new CodegenError(list, "var is unsupported; use let or const");
    }
    const lines: string[] = [];
    for (const d of list.declarations) {
      // Phase 1.5-6 prep-destructuring: `const { a, b } = expr;` is lowered
      // to a snapshot tmp + per-binding field reads. Lives only at statement
      // level (for-init still requires a single identifier — see emitForStatement).
      if (ts.isObjectBindingPattern(d.name)) {
        lines.push(this.emitObjectDestructuringDecl(d, isConst, indent));
        continue;
      }
      if (ts.isArrayBindingPattern(d.name)) {
        throw new CodegenError(
          d,
          "array destructuring `const [a, b] = ...` is unsupported (use index access or, for Map/Set, `for (const [k, v] of ...entries())`)",
        );
      }
      const { type, cName, initStr } = this.declareVar(d, isConst);
      lines.push(`${pad}${cTypeName(type)} ${cName}${initStr};`);
    }
    return lines.join("\n");
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
    decl: ts.VariableDeclaration,
    isConst: boolean,
    indent: number,
  ): string {
    const pad = "  ".repeat(indent);
    const pattern = decl.name as ts.ObjectBindingPattern;
    if (decl.type) {
      throw new CodegenError(
        decl,
        "type annotation on object destructuring pattern is unsupported (annotate the receiver expression, e.g. `const x: T = ...; const { a } = x;`)",
      );
    }
    if (!decl.initializer) {
      throw new CodegenError(decl, "destructuring declaration must have an initializer");
    }
    if (pattern.elements.length === 0) {
      throw new CodegenError(pattern, "empty object destructuring pattern is unsupported");
    }
    for (const el of pattern.elements) {
      if (el.dotDotDotToken) {
        throw new CodegenError(el, "rest element `...r` in object destructuring is unsupported");
      }
      if (el.initializer) {
        throw new CodegenError(el, "default value `{ a = ... }` in object destructuring is unsupported");
      }
      if (el.propertyName) {
        throw new CodegenError(
          el,
          "property rename / nested pattern `{ a: x }` in object destructuring is unsupported",
        );
      }
      if (!ts.isIdentifier(el.name)) {
        throw new CodegenError(
          el,
          "nested destructuring is unsupported (each element must be a simple identifier)",
        );
      }
    }

    const recvType = this.inferType(decl.initializer);
    this.assertNotVoid(
      recvType,
      decl,
      "destructuring initializer (void-returning call cannot be destructured)",
    );

    // Receiver must be a class (anonymous / named / generic monomorph) or an
    // interface. Anything else cannot expose named fields uniformly. Helpful
    // hints are surfaced for the closest near-misses (T | undefined, dunion).
    let fields: Map<string, TopazType>;
    let methods: Set<string>;
    let receiverKind: "class" | "iface";
    let receiverName: string;
    if (isClassType(recvType)) {
      const cls = this.classes.get(classNameOf(recvType)!);
      if (!cls) {
        throw new CodegenError(decl, `internal: class '${classNameOf(recvType)!}' not registered`);
      }
      fields = cls.fields;
      methods = new Set(cls.methods.keys());
      receiverKind = "class";
      receiverName = cls.name;
    } else if (isInterfaceType(recvType)) {
      const iface = this.interfaces.get(interfaceNameOf(recvType)!);
      if (!iface) {
        throw new CodegenError(decl, `internal: interface '${interfaceNameOf(recvType)!}' not registered`);
      }
      fields = iface.fields;
      methods = new Set(iface.methods.keys());
      receiverKind = "iface";
      receiverName = iface.name;
    } else if (recvType.kind === "union") {
      throw new CodegenError(
        decl,
        `object destructuring on \`${typeIdent(recvType)}\` requires narrowing first (e.g. \`if (x !== undefined)\` or \`x!\`)`,
      );
    } else if (recvType.kind === "dunion") {
      throw new CodegenError(
        decl,
        "object destructuring on a discriminated union is unsupported (narrow with `switch (x.kind)` first)",
      );
    } else {
      throw new CodegenError(
        decl,
        `object destructuring requires a class or interface receiver; got ${typeIdent(recvType)}`,
      );
    }

    for (const el of pattern.elements) {
      const fname = (el.name as ts.Identifier).text;
      if (!fields.has(fname)) {
        if (methods.has(fname)) {
          throw new CodegenError(
            el,
            `'${fname}' is a method of '${receiverName}', not a field — methods cannot be destructured (method-as-value is unsupported)`,
          );
        }
        throw new CodegenError(
          el,
          `${receiverKind} '${receiverName}' has no field '${fname}'`,
        );
      }
    }

    // Emit the receiver expression once into a tmp, then per-binding reads.
    // For class receivers the tmp is a pointer; for iface receivers it is the
    // fat-pointer struct passed by value (cTypeName handles both spellings).
    const tmpId = this.tmpCounter++;
    const tmp = `__topaz_destr_${tmpId}`;
    const initExpr = this.emitExpression(decl.initializer);

    const lines: string[] = [];
    lines.push(`${pad}${cTypeName(recvType)} ${tmp} = ${initExpr};`);
    for (const el of pattern.elements) {
      const fname = (el.name as ts.Identifier).text;
      const fty = fields.get(fname)!;
      const accessor = receiverKind === "class"
        ? `${tmp}->${fname}`
        : `${tmp}.vt->get_${fname}(${tmp}.data)`;
      lines.push(`${pad}${cTypeName(fty)} ${fname} = ${accessor};`);
      this.scope.declare(fname, fty, isConst, el);
    }
    return lines.join("\n");
  }

  private declareVar(
    decl: ts.VariableDeclaration,
    isConst: boolean,
  ): { type: TopazType; cName: string; initStr: string } {
    if (!ts.isIdentifier(decl.name)) {
      throw new CodegenError(decl, "variable name must be a simple identifier");
    }
    if (!decl.initializer) {
      throw new CodegenError(decl, "variable declaration must have an initializer");
    }
    const name = decl.name.text;

    let type: TopazType;
    let initExpr: string;
    if (decl.type) {
      type = this.typeFromAnnotation(decl.type, decl);
      this.assertNotVoid(type, decl, "variable type");
      // emitWithExpected threads `type` through ArrayLiteral / NewExpression
      // context typing and applies class -> interface coercion when needed.
      initExpr = this.emitWithExpected(decl.initializer, type);
    } else {
      const initIsBareNew =
        ts.isNewExpression(decl.initializer) &&
        ts.isIdentifier(decl.initializer.expression) &&
        (decl.initializer.expression.text === "Map" ||
          decl.initializer.expression.text === "Set") &&
        (!decl.initializer.typeArguments || decl.initializer.typeArguments.length === 0);
      if (initIsBareNew) {
        throw new CodegenError(
          decl.initializer,
          "cannot infer constructor type arguments; write `new Map<K, V>()` / `new Set<T>()` or annotate the binding",
        );
      }
      type = this.inferType(decl.initializer);
      this.assertNotVoid(type, decl, "variable initializer (void-returning call cannot be stored)");
      if (ts.isArrayLiteralExpression(decl.initializer)) {
        initExpr = this.emitArrayLiteral(decl.initializer, type);
      } else if (ts.isNewExpression(decl.initializer)) {
        initExpr = this.emitNewExpression(decl.initializer, type);
      } else {
        initExpr = this.emitExpression(decl.initializer);
      }
    }
    this.scope.declare(name, type, isConst, decl);
    return { type, cName: name, initStr: ` = ${initExpr}` };
  }

  private emitForStatement(stmt: ts.ForStatement, indent: number): string {
    const pad = "  ".repeat(indent);
    this.scope.push();
    try {
      let initStr = "";
      if (stmt.initializer) {
        if (ts.isVariableDeclarationList(stmt.initializer)) {
          const init = stmt.initializer;
          if (init.declarations.length !== 1) {
            throw new CodegenError(init, "for-init with multiple declarations is unsupported");
          }
          const isConst = (init.flags & ts.NodeFlags.Const) !== 0;
          const isLet = (init.flags & ts.NodeFlags.Let) !== 0;
          if (!isConst && !isLet) {
            throw new CodegenError(init, "var is unsupported; use let or const");
          }
          const { type, cName, initStr: vInit } = this.declareVar(init.declarations[0]!, isConst);
          initStr = `${cTypeName(type)} ${cName}${vInit}`;
        } else {
          initStr = this.emitExpression(stmt.initializer as ts.Expression);
        }
      }
      if (!stmt.condition) {
        throw new CodegenError(stmt, "for-loop requires a condition");
      }
      this.expectType(stmt.condition, T_BOOLEAN);
      const condStr = this.emitExpression(stmt.condition);
      const incrStr = stmt.incrementor ? this.emitExpression(stmt.incrementor) : "";

      let bodyStr: string;
      if (ts.isBlock(stmt.statement)) {
        this.scope.push();
        bodyStr = this.emitBlock(stmt.statement, indent);
        this.scope.pop();
      } else {
        this.scope.push();
        const inner = this.emitStatement(stmt.statement, indent + 1);
        this.scope.pop();
        bodyStr = `${pad}{\n${inner}\n${pad}}`;
      }
      return `${pad}for (${initStr}; ${condStr}; ${incrStr}) ${bodyStr.trimStart()}`;
    } finally {
      this.scope.pop();
    }
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
  private emitForOfStatement(stmt: ts.ForOfStatement, indent: number): string {
    if (stmt.awaitModifier) {
      throw new CodegenError(stmt, "`for await` is unsupported (no async support yet)");
    }
    if (!ts.isVariableDeclarationList(stmt.initializer)) {
      throw new CodegenError(
        stmt.initializer,
        "for-of binding must be a `const` or `let` declaration (assigning to an existing variable is unsupported)",
      );
    }
    const init = stmt.initializer;
    if (init.declarations.length !== 1) {
      throw new CodegenError(init, "for-of binding must be a single declaration");
    }
    const isConst = (init.flags & ts.NodeFlags.Const) !== 0;
    const isLet = (init.flags & ts.NodeFlags.Let) !== 0;
    if (!isConst && !isLet) {
      throw new CodegenError(init, "var is unsupported; use let or const");
    }
    const decl = init.declarations[0]!;
    if (decl.initializer) {
      throw new CodegenError(decl, "for-of binding cannot have an initializer");
    }
    const binding = this.parseForOfBinding(decl);

    // Phase 1.5-3.5g: detect Map.values() / Map.keys() / Set.values() /
    // Set.keys() as a syntactic special form *before* the regular inferType
    // dispatch — `.values()` is rejected in expression position, so the
    // generic infer path would surface a less helpful error.
    //
    // Phase 1.5-3.5h-entries: `.entries()` also goes through this special form
    // path; pair binding lowers to two declarations off the same slot.
    if (
      ts.isCallExpression(stmt.expression) &&
      !stmt.expression.questionDotToken &&
      ts.isPropertyAccessExpression(stmt.expression.expression) &&
      !stmt.expression.expression.questionDotToken
    ) {
      const callExpr = stmt.expression;
      const callee = callExpr.expression as ts.PropertyAccessExpression;
      const methodName = callee.name.text;
      if (methodName === "values" || methodName === "keys" || methodName === "entries") {
        const baseType = this.inferType(callee.expression);
        if (isMapType(baseType) || isSetType(baseType)) {
          if (callExpr.arguments.length !== 0) {
            throw new CodegenError(callExpr, `.${methodName}() takes no arguments`);
          }
          if (methodName === "entries") {
            if (binding.kind !== "pair") {
              throw new CodegenError(
                decl.name,
                "for-of over .entries() requires destructuring binding `for (const [k, v] of ...)`",
              );
            }
            let keyType: TopazType;
            let valueType: TopazType;
            if (isMapType(baseType)) {
              this.recordMapMonomorph(baseType);
              keyType = mapKey(baseType)!;
              valueType = mapValue(baseType)!;
            } else {
              // Set.entries() yields [elem, elem] pairs (matches JS).
              this.recordSetMonomorph(baseType);
              keyType = setElem(baseType)!;
              valueType = setElem(baseType)!;
            }
            return this.emitForOfHashLowering(
              stmt, indent, baseType, callee.expression,
              { kind: "pair",
                firstName: binding.firstName, firstField: "key", firstType: keyType,
                secondName: binding.secondName, secondField: isMapType(baseType) ? "value" : "key", secondType: valueType,
              },
              decl, isConst,
            );
          }
          // .values() / .keys() — single binding required.
          if (binding.kind !== "single") {
            throw new CodegenError(
              decl.name,
              `for-of over .${methodName}() takes a single binding, not destructuring`,
            );
          }
          let bindType: TopazType;
          let field: "key" | "value";
          if (isMapType(baseType)) {
            this.recordMapMonomorph(baseType);
            if (methodName === "values") {
              bindType = mapValue(baseType)!;
              field = "value";
            } else {
              bindType = mapKey(baseType)!;
              field = "key";
            }
          } else {
            // Set: both .values() and .keys() yield the element (matches JS).
            this.recordSetMonomorph(baseType);
            bindType = setElem(baseType)!;
            field = "key";
          }
          return this.emitForOfHashLowering(
            stmt, indent, baseType, callee.expression,
            { kind: "single", name: binding.name, field, type: bindType },
            decl, isConst,
          );
        }
      }
    }

    // Non-special-form paths only accept single binding (no destructuring
    // for plain Array / Set / Iterator iteration — we have no tuple type
    // and `[a, b] = arr` on an Array<T> would require T|undefined semantics
    // for missing elements which we don't want to leak in for-of binding).
    if (binding.kind === "pair") {
      throw new CodegenError(
        decl.name,
        "destructuring binding in for-of is only supported for .entries() on Map / Set",
      );
    }
    const bindName = binding.name;

    const rhsType = this.inferType(stmt.expression);

    // Phase 1.5-3.5g: plain Set RHS iterates over elements (JS treats Set as
    // its own iterable; `[...set]` and `for (const x of set)` both yield
    // values). Uses the same hash-walk helper as Set.values().
    if (isSetType(rhsType)) {
      this.recordSetMonomorph(rhsType);
      const elemType = setElem(rhsType)!;
      return this.emitForOfHashLowering(
        stmt, indent, rhsType, stmt.expression,
        { kind: "single", name: bindName, field: "key", type: elemType },
        decl, isConst,
      );
    }

    // Phase 1.5-3.5g-iterator: arbitrary Iterator<T> RHS (e.g. a bound iter,
    // a function-returned iter, or a chained .values() left in a tmp) lowers
    // to a while-loop driven by the iter's `next(state, &done)` callback. The
    // hash-form lowering above stays as a fast-path optimization for direct
    // .values() / .keys() / Set RHS — both forms are observationally equal.
    if (rhsType.kind === "iter") {
      return this.emitForOfIteratorLowering(
        stmt, indent, rhsType, stmt.expression,
        bindName, decl, isConst,
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
        stmt.expression,
        `for-of requires an Array<T>, Set<T>, Iterator<T>, Map.values(), Map.keys(), or Map.entries() (got ${typeIdent(rhsType)})${hint}`,
      );
    }
    this.recordArrayMonomorph(rhsType);
    const elemType = arrayElem(rhsType)!;

    if (decl.type) {
      const declared = this.typeFromAnnotation(decl.type, decl);
      if (!typeEq(declared, elemType)) {
        throw new CodegenError(
          decl.type,
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
    const rhsExpr = this.emitExpression(stmt.expression);
    const innerPad = "  ".repeat(indent + 2);

    // Outer Topaz scope holds the binding so the body's inferType / scope
    // lookups see the right element type. We also push a second frame for
    // the body itself so any narrowing inside the loop pops cleanly.
    this.scope.push();
    try {
      this.scope.declare(bindName, elemType, isConst, decl);
      this.scope.push();
      try {
        const stmtList: ts.Statement[] = ts.isBlock(stmt.statement)
          ? Array.from(stmt.statement.statements)
          : [stmt.statement];
        const stmtLines: string[] = [];
        for (const s of stmtList) {
          stmtLines.push(this.emitStatement(s, indent + 2));
          this.applyCarryNarrowing(s);
        }

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
        return lines.join("\n");
      } finally {
        this.scope.pop();
      }
    } finally {
      this.scope.pop();
    }
  }

  // Phase 1.5-3.5h-entries: parse a for-of binding decl into either a single
  // identifier or a 2-element array destructuring `[k, v]`. Object
  // destructuring, rest, default, property rename, nested patterns, omitted
  // (sparse) elements, and pair binding with anything other than 2 elements
  // are all rejected explicitly with hint text.
  private parseForOfBinding(
    decl: ts.VariableDeclaration,
  ):
    | { kind: "single"; name: string }
    | { kind: "pair"; firstName: string; secondName: string }
  {
    if (ts.isIdentifier(decl.name)) {
      return { kind: "single", name: decl.name.text };
    }
    if (ts.isObjectBindingPattern(decl.name)) {
      throw new CodegenError(
        decl.name,
        "object destructuring is unsupported in for-of binding (use a class field accessor in the body)",
      );
    }
    if (ts.isArrayBindingPattern(decl.name)) {
      if (decl.type) {
        throw new CodegenError(
          decl.type,
          "type annotation on destructuring binding is unsupported (omit the annotation; element types are inferred from the iterable)",
        );
      }
      const elements = decl.name.elements;
      if (elements.length !== 2) {
        throw new CodegenError(
          decl.name,
          `destructuring binding in for-of must have exactly 2 elements [k, v] (got ${elements.length})`,
        );
      }
      const names: string[] = [];
      for (const el of elements) {
        if (ts.isOmittedExpression(el)) {
          throw new CodegenError(el, "omitted (sparse) destructuring element is unsupported");
        }
        if (el.dotDotDotToken) {
          throw new CodegenError(el, "rest element in destructuring is unsupported");
        }
        if (el.initializer) {
          throw new CodegenError(el, "default value in destructuring is unsupported");
        }
        if (el.propertyName) {
          throw new CodegenError(el, "property rename in destructuring is unsupported");
        }
        if (!ts.isIdentifier(el.name)) {
          throw new CodegenError(
            el.name,
            "nested destructuring is unsupported (each element must be a simple identifier)",
          );
        }
        names.push(el.name.text);
      }
      return { kind: "pair", firstName: names[0]!, secondName: names[1]! };
    }
    throw new CodegenError(
      decl.name,
      "for-of binding must be an identifier or [k, v] destructuring",
    );
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
    stmt: ts.ForOfStatement,
    indent: number,
    containerType: TopazType,
    recvExpr: ts.Expression,
    bindSpec:
      | { kind: "single"; name: string; field: "key" | "value"; type: TopazType }
      | {
          kind: "pair";
          firstName: string; firstField: "key" | "value"; firstType: TopazType;
          secondName: string; secondField: "key" | "value"; secondType: TopazType;
        },
    decl: ts.VariableDeclaration,
    isConst: boolean,
  ): string {
    const pad = "  ".repeat(indent);

    if (bindSpec.kind === "single" && decl.type) {
      const declared = this.typeFromAnnotation(decl.type, decl);
      if (!typeEq(declared, bindSpec.type)) {
        const what =
          bindSpec.field === "value" ? "value" : (isMapType(containerType) ? "key" : "element");
        throw new CodegenError(
          decl.type,
          `for-of binding type ${typeIdent(declared)} does not match ${what} type ${typeIdent(bindSpec.type)}`,
        );
      }
    }

    const id = this.tmpCounter++;
    const htTmp = `__topaz_for_ht_${id}`;
    const idxTmp = `__topaz_for_idx_${id}`;
    const htCType = cTypeName(containerType);
    const recvStr = this.emitExpression(recvExpr);
    const innerPad = "  ".repeat(indent + 2);

    this.scope.push();
    try {
      if (bindSpec.kind === "single") {
        this.scope.declare(bindSpec.name, bindSpec.type, isConst, decl);
      } else {
        this.scope.declare(bindSpec.firstName, bindSpec.firstType, isConst, decl);
        this.scope.declare(bindSpec.secondName, bindSpec.secondType, isConst, decl);
      }
      this.scope.push();
      try {
        const stmtList: ts.Statement[] = ts.isBlock(stmt.statement)
          ? Array.from(stmt.statement.statements)
          : [stmt.statement];
        const stmtLines: string[] = [];
        for (const s of stmtList) {
          stmtLines.push(this.emitStatement(s, indent + 2));
          this.applyCarryNarrowing(s);
        }

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
        return lines.join("\n");
      } finally {
        this.scope.pop();
      }
    } finally {
      this.scope.pop();
    }
  }

  // Phase 1.5-3.5g-iterator: drive an arbitrary Iterator<T> via its `next`
  // callback in a while-loop. The iter is snapshotted into a tmp so the RHS is
  // evaluated once; each iteration calls `it.next(it.state, &done)` and stops
  // when done. The return value when done is undefined-ish but ignored.
  private emitForOfIteratorLowering(
    stmt: ts.ForOfStatement,
    indent: number,
    iterType: Extract<TopazType, { kind: "iter" }>,
    recvExpr: ts.Expression,
    bindName: string,
    decl: ts.VariableDeclaration,
    isConst: boolean,
  ): string {
    const pad = "  ".repeat(indent);
    const bindType = iterType.elem;

    if (decl.type) {
      const declared = this.typeFromAnnotation(decl.type, decl);
      if (!typeEq(declared, bindType)) {
        throw new CodegenError(
          decl.type,
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
    try {
      this.scope.declare(bindName, bindType, isConst, decl);
      this.scope.push();
      try {
        const stmtList: ts.Statement[] = ts.isBlock(stmt.statement)
          ? Array.from(stmt.statement.statements)
          : [stmt.statement];
        const stmtLines: string[] = [];
        for (const s of stmtList) {
          stmtLines.push(this.emitStatement(s, indent + 2));
          this.applyCarryNarrowing(s);
        }

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
        return lines.join("\n");
      } finally {
        this.scope.pop();
      }
    } finally {
      this.scope.pop();
    }
  }

  private emitSwitchStatement(stmt: ts.SwitchStatement, indent: number): string {
    const pad = "  ".repeat(indent);
    const discType = this.inferType(stmt.expression);
    const clauses = stmt.caseBlock.clauses;

    // Phase 1.5-3e: detect `switch (<id>.<discriminator>)` on a dunion-typed
    // identifier. When matched, each case body sees `<id>` narrowed to the
    // class whose discriminator literal equals the case label. Reuses the
    // ordinary scope.narrow path so identifier emit casts via `.data`.
    let dunionTarget: { name: string; dunion: Extract<TopazType, { kind: "dunion" }> } | undefined;
    if (
      ts.isPropertyAccessExpression(stmt.expression) &&
      ts.isIdentifier(stmt.expression.expression)
    ) {
      const idName = stmt.expression.expression.text;
      const b = this.scope.lookup(idName);
      if (b && b.type.kind === "dunion" && stmt.expression.name.text === b.type.discriminator) {
        dunionTarget = { name: idName, dunion: b.type };
      }
    }

    let defaultClause: ts.DefaultClause | undefined;
    for (let i = 0; i < clauses.length; i++) {
      const c = clauses[i]!;
      if (ts.isDefaultClause(c)) {
        if (i !== clauses.length - 1) {
          throw new CodegenError(c, "`default` must be the last clause of `switch`");
        }
        defaultClause = c;
      }
    }

    type Group = { conds: ts.CaseClause[]; body: readonly ts.Statement[] };
    const groups: Group[] = [];
    let pending: ts.CaseClause[] = [];
    for (const c of clauses) {
      if (ts.isCaseClause(c)) {
        this.expectType(c.expression, discType);
        pending.push(c);
        if (c.statements.length > 0) {
          groups.push({ conds: pending, body: c.statements });
          pending = [];
        }
      }
    }
    if (pending.length > 0) {
      groups.push({ conds: pending, body: [] });
    }

    const isTerminator = (s: ts.Statement): boolean =>
      ts.isBreakStatement(s) ||
      ts.isReturnStatement(s) ||
      ts.isThrowStatement(s) ||
      ts.isContinueStatement(s);
    for (const g of groups) {
      if (g.body.length > 0 && !isTerminator(g.body[g.body.length - 1]!)) {
        throw new CodegenError(
          g.body[g.body.length - 1]!,
          "case body must end with `break` or `return` (implicit fall-through is unsupported)",
        );
      }
    }

    // Phase 1.5-3e: pre-compute, for a dunion switch, which class each case
    // narrows to. A case label that matches multiple variants (impossible
    // under tryMakeDiscriminatedUnion's uniqueness check) or none falls back
    // to no narrowing. Multi-label fall-through groups only narrow if every
    // label points at the same class.
    const groupNarrowClass: (string | undefined)[] = [];
    if (dunionTarget) {
      const literalToClass = new Map<string, string>();
      for (const cname of dunionTarget.dunion.variants) {
        literalToClass.set(this.dunionLiteralFor(dunionTarget.dunion, cname), cname);
      }
      for (const g of groups) {
        let acc: string | undefined;
        let agree = true;
        for (const c of g.conds) {
          if (!ts.isStringLiteral(c.expression) && !ts.isNoSubstitutionTemplateLiteral(c.expression)) {
            agree = false;
            break;
          }
          const cls = literalToClass.get(c.expression.text);
          if (!cls) { agree = false; break; }
          if (acc === undefined) acc = cls;
          else if (acc !== cls) { agree = false; break; }
        }
        groupNarrowClass.push(agree ? acc : undefined);
      }
    }

    const id = this.switchCounter++;
    const tmp = `__topaz_sw_${id}`;
    const discExpr = this.emitExpression(stmt.expression);

    const out: string[] = [];
    out.push(`${pad}{`);
    out.push(`${pad}  ${cTypeName(discType)} ${tmp} = ${discExpr};`);
    out.push(`${pad}  do {`);

    this.scope.push();
    try {
      const cmp = (rhs: string): string =>
        discType.kind === "string"
          ? `topaz_string_eq(${tmp}, ${rhs})`
          : `${tmp} == ${rhs}`;
      let first = true;
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi]!;
        const conds = g.conds.map((c) => cmp(this.emitExpression(c.expression))).join(" || ");
        const head = first ? "if" : "else if";
        if (g.body.length === 0) {
          out.push(`${pad}    ${head} (${conds}) { break; }`);
        } else {
          out.push(`${pad}    ${head} (${conds}) {`);
          this.scope.push();
          try {
            const narrowCls = groupNarrowClass[gi];
            if (dunionTarget && narrowCls) {
              this.scope.narrow(dunionTarget.name, classOf(narrowCls));
            }
            for (const s of g.body) {
              out.push(this.emitStatement(s, indent + 3));
            }
          } finally {
            this.scope.pop();
          }
          out.push(`${pad}    }`);
        }
        first = false;
      }
      if (defaultClause) {
        const head = first ? "if (1)" : "else";
        if (defaultClause.statements.length === 0) {
          out.push(`${pad}    ${head} { break; }`);
        } else {
          out.push(`${pad}    ${head} {`);
          for (const s of defaultClause.statements) {
            out.push(this.emitStatement(s, indent + 3));
          }
          out.push(`${pad}    }`);
        }
      }
    } finally {
      this.scope.pop();
    }

    out.push(`${pad}  } while (0);`);
    out.push(`${pad}}`);
    return out.join("\n");
  }

  private checkContinueAllowed(stmt: ts.ContinueStatement): void {
    let p: ts.Node | undefined = stmt.parent;
    while (p) {
      if (
        ts.isWhileStatement(p) ||
        ts.isDoStatement(p) ||
        ts.isForStatement(p) ||
        ts.isForInStatement(p) ||
        ts.isForOfStatement(p)
      ) {
        return;
      }
      if (ts.isSwitchStatement(p)) {
        throw new CodegenError(
          stmt,
          "`continue` inside `switch` is unsupported (switch lowers to do/while(0))",
        );
      }
      if (ts.isFunctionLike(p) || ts.isSourceFile(p)) {
        throw new CodegenError(stmt, "`continue` outside of a loop");
      }
      p = p.parent;
    }
  }

  private emitExpression(expr: ts.Expression): string {
    if (ts.isNumericLiteral(expr)) {
      const t = expr.text;
      return /[.eE]/.test(t) ? t : `${t}.0`;
    }
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return "true";
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return "false";
    if (expr.kind === ts.SyntaxKind.ThisKeyword) {
      if (!this.currentClass) {
        throw new CodegenError(expr, "`this` is only valid inside class methods or constructors");
      }
      return TOPAZ_THIS;
    }
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return this.emitStringLiteral(expr);
    }
    if (ts.isTemplateExpression(expr)) {
      return this.emitTemplateExpression(expr);
    }
    if (ts.isIdentifier(expr)) {
      // Phase 1.5-3.5e: inside an arrow body, lookup is barriered. If the
      // identifier resolves only via captureContext, rewrite the read to go
      // through the env struct.
      const local = this.scope.lookup(expr.text);
      if (!local && this.captureContext && this.captureContext.captures.has(expr.text)) {
        const envType = this.captureContext.envType;
        return `(((${envType} *)__topaz_env)->${expr.text})`;
      }
      const b = local;
      if (!b) {
        throw new CodegenError(expr, `unknown identifier '${expr.text}'`);
      }
      // Phase 1.5-3c: when the binding's C representation is the scalar opt
      // struct (`topaz_opt_<scalar>`) but narrowing has stripped the
      // `undefined` variant, reads must reach through `.value`. Reference /
      // interface T | undefined share T's C type, so no accessor is needed.
      const base = this.scope.lookupBase(expr.text)!;
      if (isScalarOptUnion(base.type) && !typeEq(base.type, b.type)) {
        return `(${expr.text}).value`;
      }
      // Phase 1.5-3e: narrowed dunion -> class. The fat struct's `data` slot
      // holds the underlying class instance pointer; cast it back to the
      // concrete class type for downstream uses.
      if (base.type.kind === "dunion" && isClassType(b.type)) {
        const cname = classNameOf(b.type)!;
        return `((topaz_class_${cname} *)(${expr.text}).data)`;
      }
      // Phase 1.5-3f: narrowed unknown -> class. The base C type is `void *`
      // (the catch payload); cast to the concrete class pointer so field /
      // method access type-checks at the C level.
      if (base.type.kind === "unknown" && isClassType(b.type)) {
        const cname = classNameOf(b.type)!;
        return `((topaz_class_${cname} *)(${expr.text}))`;
      }
      return expr.text;
    }
    if (ts.isParenthesizedExpression(expr)) {
      return `(${this.emitExpression(expr.expression)})`;
    }
    // Phase 1.5-3.5e: arrow expressions in non-contextual positions need
    // explicit param + return annotations (no expected type to source them
    // from). emitWithExpected provides the contextual path with an expected
    // fn type for the four assignment sites.
    if (ts.isArrowFunction(expr)) {
      return this.emitArrowFunction(expr, undefined);
    }
    // Function expressions (`function () {}`) are not supported — use arrows.
    if (ts.isFunctionExpression(expr)) {
      throw new CodegenError(expr, "function expressions are unsupported (use an arrow `(...) => ...` instead)");
    }
    if (ts.isPropertyAccessExpression(expr) && expr.questionDotToken) {
      return this.emitOptionalPropertyAccess(expr);
    }
    if (ts.isElementAccessExpression(expr) && expr.questionDotToken) {
      return this.emitOptionalElementAccess(expr);
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      // Phase 1.5-3e: `dunion.kind` reads the discriminator string from the
      // fat struct. inferType already enforced that only the discriminator
      // field is accessible.
      if (baseType.kind === "dunion") {
        return `((${this.emitExpression(expr.expression)}).${baseType.discriminator})`;
      }
      if (baseType.kind === "string" && expr.name.text === "length") {
        return `((topaz_number)(${this.emitExpression(expr.expression)}).len)`;
      }
      if (isArrayType(baseType) && expr.name.text === "length") {
        return `((topaz_number)(${this.emitExpression(expr.expression)})->len)`;
      }
      if ((isMapType(baseType) || isSetType(baseType)) && expr.name.text === "size") {
        return `((topaz_number)(${this.emitExpression(expr.expression)})->size)`;
      }
      if (isClassType(baseType)) {
        const cls = this.classes.get(classNameOf(baseType)!)!;
        if (cls.fields.has(expr.name.text)) {
          return `((${this.emitExpression(expr.expression)})->${expr.name.text})`;
        }
        if (cls.methods.has(expr.name.text)) {
          throw new CodegenError(
            expr,
            `method '${expr.name.text}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          expr,
          `class '${cls.name}' has no member '${expr.name.text}'`,
        );
      }
      if (isInterfaceType(baseType)) {
        const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
        const fname = expr.name.text;
        if (iface.fields.has(fname)) {
          const id = this.tmpCounter++;
          const tmp = `__topaz_ib_${id}`;
          const baseStr = this.emitExpression(expr.expression);
          return `({ ${cTypeName(baseType)} ${tmp} = ${baseStr}; ${tmp}.vt->get_${fname}(${tmp}.data); })`;
        }
        if (iface.methods.has(fname)) {
          throw new CodegenError(
            expr,
            `method '${fname}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          expr,
          `interface '${iface.name}' has no member '${fname}'`,
        );
      }
      throw new CodegenError(
        expr,
        `unsupported property access '.${expr.name.text}' on ${typeIdent(baseType)}`,
      );
    }
    if (ts.isElementAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      const elem = arrayElem(baseType);
      if (!elem) {
        throw new CodegenError(expr, `index access is only supported on Array (got ${typeIdent(baseType)})`);
      }
      this.expectType(expr.argumentExpression, T_NUMBER);
      const name = arrayShortName(baseType);
      return `topaz_array_${name}_at(${this.emitExpression(expr.expression)}, ${this.emitExpression(expr.argumentExpression)})`;
    }
    if (ts.isArrayLiteralExpression(expr)) {
      return this.emitArrayLiteral(expr, /* expected */ undefined);
    }
    if (ts.isNonNullExpression(expr)) {
      // Phase 1.5-3.5c: stmt-expression around a single evaluation of the
      // operand, runtime check on the sentinel slot, then yield the unwrapped
      // value. Scalar T | undefined uses the `topaz_opt_<scalar>` struct
      // (.present / .value); reference T uses NULL pointer sentinel; iface T
      // uses fat-pointer .data == NULL sentinel.
      const inner = this.inferType(expr.expression); // verifies T | undefined
      const stripped = withoutUndefined(inner)!;
      const valStr = this.emitExpression(expr.expression);
      const id = this.tmpCounter++;
      const tmp = `__topaz_nn_${id}`;
      const ct = cTypeName(inner);
      const panic = `fputs("topaz: non-null assertion failed\\n", stderr); abort();`;
      if (isScalarType(stripped)) {
        return `({ ${ct} ${tmp} = ${valStr}; if (!${tmp}.present) { ${panic} } ${tmp}.value; })`;
      }
      if (isInterfaceType(stripped)) {
        return `({ ${ct} ${tmp} = ${valStr}; if (${tmp}.data == NULL) { ${panic} } ${tmp}; })`;
      }
      return `({ ${ct} ${tmp} = ${valStr}; if (${tmp} == NULL) { ${panic} } ${tmp}; })`;
    }
    if (ts.isPrefixUnaryExpression(expr)) {
      this.inferType(expr); // type-check
      const op = this.prefixOp(expr);
      return `(${op}${this.emitExpression(expr.operand)})`;
    }
    if (ts.isPostfixUnaryExpression(expr)) {
      this.inferType(expr);
      const op = this.postfixOp(expr);
      return `(${this.emitExpression(expr.operand)}${op})`;
    }
    if (ts.isBinaryExpression(expr)) {
      this.inferType(expr); // type-check + const-check
      const tok = expr.operatorToken.kind;
      // Element-access assignment lowers to topaz_array_X_set; compound
      // assignment on a[i] is unsupported because we'd evaluate the index twice.
      if (
        ts.isElementAccessExpression(expr.left) &&
        (tok === ts.SyntaxKind.EqualsToken ||
          tok === ts.SyntaxKind.PlusEqualsToken ||
          tok === ts.SyntaxKind.MinusEqualsToken ||
          tok === ts.SyntaxKind.AsteriskEqualsToken ||
          tok === ts.SyntaxKind.SlashEqualsToken ||
          tok === ts.SyntaxKind.PercentEqualsToken)
      ) {
        if (tok !== ts.SyntaxKind.EqualsToken) {
          throw new CodegenError(expr, "compound assignment on array element is unsupported; use a[i] = ...");
        }
        const baseType = this.inferType(expr.left.expression);
        const name = arrayShortName(baseType);
        const elem = arrayElem(baseType)!;
        const base = this.emitExpression(expr.left.expression);
        const idx = this.emitExpression(expr.left.argumentExpression);
        // Use emitWithExpected so class -> interface coercion fires when the
        // array is Array<Interface> and the RHS is a class instance.
        const val = this.emitWithExpected(expr.right, elem);
        return `topaz_array_${name}_set(${base}, ${idx}, ${val})`;
      }
      // Interface property assignment goes through the vtable's setter; no
      // C lvalue exists for the underlying field. Compound forms would need
      // to evaluate the base twice, so reject them.
      if (
        ts.isPropertyAccessExpression(expr.left) &&
        (tok === ts.SyntaxKind.EqualsToken ||
          tok === ts.SyntaxKind.PlusEqualsToken ||
          tok === ts.SyntaxKind.MinusEqualsToken ||
          tok === ts.SyntaxKind.AsteriskEqualsToken ||
          tok === ts.SyntaxKind.SlashEqualsToken ||
          tok === ts.SyntaxKind.PercentEqualsToken)
      ) {
        const baseT = this.inferType(expr.left.expression);
        if (isInterfaceType(baseT)) {
          if (tok !== ts.SyntaxKind.EqualsToken) {
            throw new CodegenError(
              expr,
              "compound assignment on interface field is unsupported; use iface.field = ...",
            );
          }
          const iname = interfaceNameOf(baseT)!;
          const iface = this.interfaces.get(iname)!;
          const fname = expr.left.name.text;
          const ftype = iface.fields.get(fname)!;
          const id = this.tmpCounter++;
          const tmp = `__topaz_ib_${id}`;
          const baseStr = this.emitExpression(expr.left.expression);
          const rhsStr = this.emitWithExpected(expr.right, ftype);
          // The vtable setter returns void, so this expression's value is
          // void. Chained assignment (`x = (iface.field = v)`) is therefore
          // unsupported — acceptable for now since it's a rare pattern.
          return `({ ${cTypeName(baseT)} ${tmp} = ${baseStr}; ${tmp}.vt->set_${fname}(${tmp}.data, ${rhsStr}); })`;
        }
      }
      // Plain assignment with rhs coercion (covers `let a: Shape = ...; a = new Circle(...)`
      // as well as `obj.field = new Circle(...)` when field is an interface).
      if (tok === ts.SyntaxKind.EqualsToken) {
        const lt = this.inferType(expr.left);
        const rt = this.inferType(expr.right);
        if (!typeEq(lt, rt) && this.isAssignableTo(rt, lt)) {
          const lhsStr = this.emitExpression(expr.left);
          const rhsStr = this.emitWithExpected(expr.right, lt);
          return `(${lhsStr} = ${rhsStr})`;
        }
      }
      // JS `%` is fmod for number; C's `%` rejects double, so always lower.
      if (tok === ts.SyntaxKind.PercentToken) {
        return `topaz_fmod(${this.emitExpression(expr.left)}, ${this.emitExpression(expr.right)})`;
      }
      if (tok === ts.SyntaxKind.PercentEqualsToken) {
        const lhs = this.emitExpression(expr.left);
        return `(${lhs} = topaz_fmod(${lhs}, ${this.emitExpression(expr.right)}))`;
      }
      if (tok === ts.SyntaxKind.PlusToken && this.inferType(expr.left).kind === "string") {
        return `topaz_string_concat(${this.emitExpression(expr.left)}, ${this.emitExpression(expr.right)})`;
      }
      if (
        tok === ts.SyntaxKind.PlusEqualsToken &&
        this.inferType(expr.left).kind === "string"
      ) {
        const lhs = this.emitExpression(expr.left);
        return `(${lhs} = topaz_string_concat(${lhs}, ${this.emitExpression(expr.right)}))`;
      }
      if (
        (tok === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          tok === ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
        this.inferType(expr.left).kind === "string"
      ) {
        const inner = `topaz_string_eq(${this.emitExpression(expr.left)}, ${this.emitExpression(expr.right)})`;
        return tok === ts.SyntaxKind.EqualsEqualsEqualsToken ? inner : `(!${inner})`;
      }
      // Phase 1.5-3.5c: `a ?? b` lowers to a stmt-expression that snapshots
      // `a` into a tmp, checks the sentinel slot, and yields either the
      // unwrapped value or the fallback `b`. inferType has already verified
      // that `a: T | undefined` and `b` is either T (result T) or T |
      // undefined (result T | undefined, for `a ?? b ?? c` chaining). For
      // scalar T, when the result is T | undefined we keep the whole opt
      // struct so the C ternary's branches share a type; reference / iface
      // T have the same C representation either way, so no branch needed.
      if (tok === ts.SyntaxKind.QuestionQuestionToken) {
        const lt = this.inferType(expr.left);
        const inner = withoutUndefined(lt)!;
        const rt = this.inferType(expr.right);
        const rhsIsOptional = !this.isAssignableTo(rt, inner) && this.isAssignableTo(rt, lt);
        const expected = rhsIsOptional ? lt : inner;
        const lhsStr = this.emitExpression(expr.left);
        const rhsStr = this.emitWithExpected(expr.right, expected);
        const id = this.tmpCounter++;
        const tmp = `__topaz_nc_${id}`;
        const lct = cTypeName(lt);
        if (isScalarType(inner)) {
          const presentBranch = rhsIsOptional ? tmp : `${tmp}.value`;
          return `({ ${lct} ${tmp} = ${lhsStr}; ${tmp}.present ? ${presentBranch} : (${rhsStr}); })`;
        }
        if (isInterfaceType(inner)) {
          return `({ ${lct} ${tmp} = ${lhsStr}; ${tmp}.data != NULL ? ${tmp} : (${rhsStr}); })`;
        }
        return `({ ${lct} ${tmp} = ${lhsStr}; ${tmp} != NULL ? ${tmp} : (${rhsStr}); })`;
      }
      // Phase 1.5-3f: `x instanceof ClassName` lowers to a tag-pointer
      // comparison. Every class struct carries `__topaz_class_tag` at offset
      // 0, set by the constructor to a per-class sentinel address; the check
      // dereferences the void* payload through that field.
      if (tok === ts.SyntaxKind.InstanceOfKeyword) {
        const cls = (expr.right as ts.Identifier).text;
        const id = this.tmpCounter++;
        const tmp = `__topaz_io_${id}`;
        const left = this.emitExpression(expr.left);
        return `({ void *${tmp} = (void *)(${left}); ${tmp} != NULL && *((const char * const *)${tmp}) == &topaz_class_${cls}_tag; })`;
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
      if (
        tok === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        tok === ts.SyntaxKind.ExclamationEqualsEqualsToken
      ) {
        const leftIsUndef = ts.isIdentifier(expr.left) && expr.left.text === "undefined";
        const rightIsUndef = ts.isIdentifier(expr.right) && expr.right.text === "undefined";
        if (leftIsUndef !== rightIsUndef) {
          const valueExpr = leftIsUndef ? expr.right : expr.left;
          const t = this.inferType(valueExpr);
          const inner = withoutUndefined(t);
          const op = tok === ts.SyntaxKind.EqualsEqualsEqualsToken ? "==" : "!=";
          const valStr = this.emitExpression(valueExpr);
          if (inner && isScalarType(inner)) {
            const want = tok === ts.SyntaxKind.EqualsEqualsEqualsToken ? "false" : "true";
            return `${valStr}.present == ${want}`;
          }
          if (inner && isInterfaceType(inner)) {
            return `${valStr}.data ${op} NULL`;
          }
          return `${valStr} ${op} NULL`;
        }
      }
      const op = this.binaryOp(expr.operatorToken);
      return `(${this.emitExpression(expr.left)} ${op} ${this.emitExpression(expr.right)})`;
    }
    if (ts.isCallExpression(expr)) {
      return this.emitCall(expr);
    }
    if (ts.isNewExpression(expr)) {
      return this.emitNewExpression(expr, /* expected */ undefined);
    }
    unsupported(expr, "expression");
  }

  private emitArrayLiteral(
    expr: ts.ArrayLiteralExpression,
    expected: TopazType | undefined,
  ): string {
    for (const e of expr.elements) {
      if (e.kind === ts.SyntaxKind.OmittedExpression) {
        throw new CodegenError(e, "holes in array literals are unsupported");
      }
    }
    // Phase 1.5-3.5h-spread: spread (`...x`) is allowed when the source is an
    // Array<T> whose elem type matches the destination's elem type EXACTLY.
    // Set / Iterator sources stay rejected here (tracked in future sub-steps).
    const hasSpread = expr.elements.some((e) => ts.isSpreadElement(e));
    let arrType: TopazType;
    if (expr.elements.length === 0) {
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
      const first = expr.elements[0]!;
      let elem: TopazType;
      if (ts.isSpreadElement(first)) {
        const srcType = this.inferType(first.expression);
        if (!isArrayType(srcType)) {
          throw new CodegenError(
            first,
            `spread source in array literal must be an Array<T>, got ${typeIdent(srcType)}`,
          );
        }
        elem = arrayElem(srcType)!;
      } else {
        elem = this.inferType(first as ts.Expression);
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
      if (expr.elements.length > 0) {
        parts.push(`topaz_array_${name}_reserve(${tmp}, ${expr.elements.length});`);
      }
      for (const e of expr.elements) {
        parts.push(`topaz_array_${name}_push(${tmp}, ${this.emitWithExpected(e as ts.Expression, elemType)});`);
      }
    } else {
      // Snapshot every spread source first so the reserve sum / push loop see
      // a stable .len and .data, and each source expression evaluates once.
      const spreadTmps: string[] = [];
      const fixedCount = expr.elements.filter((e) => !ts.isSpreadElement(e)).length;
      for (const e of expr.elements) {
        if (!ts.isSpreadElement(e)) continue;
        const srcType = this.inferType(e.expression);
        if (!isArrayType(srcType)) {
          throw new CodegenError(
            e,
            `spread source in array literal must be an Array<T>, got ${typeIdent(srcType)}`,
          );
        }
        const srcElem = arrayElem(srcType)!;
        if (!typeEq(srcElem, elemType)) {
          throw new CodegenError(
            e,
            `spread element type ${typeIdent(srcElem)} does not match destination element type ${typeIdent(elemType)}`,
          );
        }
        const spId = this.tmpCounter++;
        const spTmp = `__topaz_sp_${spId}`;
        const spName = arrayShortName(srcType);
        parts.push(`topaz_array_${spName} *${spTmp} = ${this.emitExpression(e.expression)};`);
        spreadTmps.push(spTmp);
      }
      const reserveSum = [String(fixedCount), ...spreadTmps.map((t) => `${t}->len`)].join(" + ");
      parts.push(`topaz_array_${name}_reserve(${tmp}, ${reserveSum});`);
      let spIdx = 0;
      for (const e of expr.elements) {
        if (ts.isSpreadElement(e)) {
          const spTmp = spreadTmps[spIdx++]!;
          const iterId = this.tmpCounter++;
          const iVar = `__topaz_si_${iterId}`;
          parts.push(
            `for (size_t ${iVar} = 0; ${iVar} < ${spTmp}->len; ${iVar}++) topaz_array_${name}_push(${tmp}, ${spTmp}->data[${iVar}]);`,
          );
        } else {
          parts.push(`topaz_array_${name}_push(${tmp}, ${this.emitWithExpected(e as ts.Expression, elemType)});`);
        }
      }
    }
    return `({ ${parts.join(" ")} ${tmp}; })`;
  }

  private emitNewExpression(
    expr: ts.NewExpression,
    expected: TopazType | undefined,
  ): string {
    if (!ts.isIdentifier(expr.expression)) {
      throw new CodegenError(expr, "only `new Map<K, V>()`, `new Set<T>()`, and class instantiation are supported");
    }
    // Phase 1.5-3.5h-spread: same positional-arguments invariant as emitCall.
    for (const a of expr.arguments ?? []) {
      if (ts.isSpreadElement(a)) {
        throw new CodegenError(
          a,
          "spread in `new` arguments is unsupported",
        );
      }
    }
    const name = expr.expression.text;
    if (name === "Array") {
      throw new CodegenError(
        expr,
        "use array literal syntax (`[...]` or `[]`) instead of `new Array()`",
      );
    }
    if ((name === "Map" || name === "Set") && expr.arguments && expr.arguments.length > 0) {
      throw new CodegenError(
        expr,
        `${name}() constructor arguments are unsupported (initialize via .set/.add)`,
      );
    }
    if (name === "Map") {
      let mapType: TopazType;
      if (expr.typeArguments && expr.typeArguments.length === 2) {
        const k = this.typeFromAnnotation(expr.typeArguments[0]!, expr);
        const v = this.typeFromAnnotation(expr.typeArguments[1]!, expr);
        const t = mapOf(k, v);
        if (!t) {
          throw new CodegenError(expr, `no Map monomorph for key=${typeIdent(k)}, value=${typeIdent(v)}`);
        }
        if (expected && !typeEq(expected, t)) {
          throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(t)}`);
        }
        mapType = t;
      } else if (expr.typeArguments && expr.typeArguments.length !== 2) {
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
      let setType: TopazType;
      if (expr.typeArguments && expr.typeArguments.length === 1) {
        const elem = this.typeFromAnnotation(expr.typeArguments[0]!, expr);
        const t = setOf(elem);
        if (!t) {
          throw new CodegenError(expr, `no Set monomorph for element type ${typeIdent(elem)}`);
        }
        if (expected && !typeEq(expected, t)) {
          throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(t)}`);
        }
        setType = t;
      } else if (expr.typeArguments && expr.typeArguments.length !== 1) {
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
      this.recordSetMonomorph(setType);
      return `topaz_set_${setShortName(setType)}_new()`;
    }
    if (this.interfaces.has(name)) {
      throw new CodegenError(expr, `cannot \`new\` an interface '${name}'; instantiate an implementing class instead`);
    }
    // Phase 1.4c-3: `new Box<number>()` mangles to the substituted class
    // name and dispatches through the same path as concrete classes.
    let className = name;
    if (this.genericClasses.has(name)) {
      const t = this.instantiateGenericClass(name, expr.typeArguments, expr);
      className = classNameOf(t)!;
    } else if (expr.typeArguments && expr.typeArguments.length > 0) {
      if (this.classes.has(name)) {
        throw new CodegenError(expr, `class '${name}' takes no type arguments`);
      }
    }
    if (this.classes.has(className)) {
      const cls = this.classes.get(className)!;
      const args = expr.arguments ?? ([] as readonly ts.Expression[]);
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

  private emitStringLiteral(
    expr:
      | ts.StringLiteral
      | ts.NoSubstitutionTemplateLiteral
      | ts.TemplateHead
      | ts.TemplateMiddle
      | ts.TemplateTail,
  ): string {
    const cooked = expr.text;
    let escaped = '"';
    let byteLen = 0;
    for (let i = 0; i < cooked.length; i++) {
      const c = cooked.charCodeAt(i);
      if (c >= 0x80) {
        throw new CodegenError(
          expr,
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
        escaped += `\\x${c.toString(16).padStart(2, "0")}`;
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
  // we don't burn one arena alloc per gap.
  private emitTemplateExpression(expr: ts.TemplateExpression): string {
    const stringify = (sub: ts.Expression): string => {
      const t = this.inferType(sub);
      const inner = this.emitExpression(sub);
      if (t.kind === "string") return inner;
      if (t.kind === "number") return `topaz_number_to_string(${inner})`;
      if (t.kind === "boolean") return `topaz_boolean_to_string(${inner})`;
      // inferType's TemplateExpression branch already vets each span; this
      // arm is defensive in case stringify gets reused later.
      throw new CodegenError(
        sub,
        `template literal substitution must be number / boolean / string, got ${typeIdent(t)}`,
      );
    };

    let acc: string | null = null;
    const append = (piece: string) => {
      acc = acc === null ? piece : `topaz_string_concat(${acc}, ${piece})`;
    };

    if (expr.head.text !== "") append(this.emitStringLiteral(expr.head));
    for (const span of expr.templateSpans) {
      append(stringify(span.expression));
      if (span.literal.text !== "") append(this.emitStringLiteral(span.literal));
    }
    // All-empty template (`${a}` with empty head + empty tail) still needs to
    // yield a `topaz_string` value; fall back to the first substitution which
    // is already stringified.
    if (acc === null) {
      // Unreachable: templateSpans is non-empty for TemplateExpression and
      // we've already appended at least one stringified span above. Defensive
      // return keeps the type signature honest.
      return `((topaz_string){ "", 0 })`;
    }
    return acc;
  }

  private prefixOp(expr: ts.PrefixUnaryExpression): string {
    switch (expr.operator) {
      case ts.SyntaxKind.MinusToken: return "-";
      case ts.SyntaxKind.PlusToken: return "+";
      case ts.SyntaxKind.ExclamationToken: return "!";
      case ts.SyntaxKind.PlusPlusToken: return "++";
      case ts.SyntaxKind.MinusMinusToken: return "--";
      default: unsupported(expr, "prefix unary operator");
    }
  }

  private postfixOp(expr: ts.PostfixUnaryExpression): string {
    switch (expr.operator) {
      case ts.SyntaxKind.PlusPlusToken: return "++";
      case ts.SyntaxKind.MinusMinusToken: return "--";
      default: unsupported(expr, "postfix unary operator");
    }
  }

  private binaryOp(tok: ts.BinaryOperatorToken): string {
    switch (tok.kind) {
      case ts.SyntaxKind.PlusToken: return "+";
      case ts.SyntaxKind.MinusToken: return "-";
      case ts.SyntaxKind.AsteriskToken: return "*";
      case ts.SyntaxKind.SlashToken: return "/";
      case ts.SyntaxKind.PercentToken: return "%";
      case ts.SyntaxKind.LessThanToken: return "<";
      case ts.SyntaxKind.LessThanEqualsToken: return "<=";
      case ts.SyntaxKind.GreaterThanToken: return ">";
      case ts.SyntaxKind.GreaterThanEqualsToken: return ">=";
      case ts.SyntaxKind.EqualsEqualsEqualsToken: return "==";
      case ts.SyntaxKind.ExclamationEqualsEqualsToken: return "!=";
      case ts.SyntaxKind.AmpersandAmpersandToken: return "&&";
      case ts.SyntaxKind.BarBarToken: return "||";
      case ts.SyntaxKind.EqualsToken: return "=";
      case ts.SyntaxKind.PlusEqualsToken: return "+=";
      case ts.SyntaxKind.MinusEqualsToken: return "-=";
      case ts.SyntaxKind.AsteriskEqualsToken: return "*=";
      case ts.SyntaxKind.SlashEqualsToken: return "/=";
      case ts.SyntaxKind.PercentEqualsToken: return "%=";
      case ts.SyntaxKind.EqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsToken:
        throw new CodegenError(tok, "loose equality (== / !=) is unsupported; use === / !==");
      default:
        unsupported(tok, "binary operator");
    }
  }

  private emitCall(expr: ts.CallExpression): string {
    const callee = expr.expression;

    // Phase 1.5-3.5d: optional method call `a?.b()`. The `?.` token sits on
    // the inner property access; the call itself is regular. `a?.()`
    // (optional call) is rejected separately below.
    if (ts.isPropertyAccessExpression(callee) && callee.questionDotToken) {
      return this.emitOptionalMethodCall(expr, callee);
    }
    if (expr.questionDotToken) {
      throw new CodegenError(
        expr,
        "optional call `f?.()` is unsupported (only `a?.b`, `a?.b()`, and `a?.[i]` are supported)",
      );
    }
    // Phase 1.5-3.5h-spread: spread in call arguments is rejected up-front so
    // every downstream callee can iterate `expr.arguments` positionally. Spread
    // in array literals is supported separately by emitArrayLiteral.
    for (const a of expr.arguments) {
      if (ts.isSpreadElement(a)) {
        throw new CodegenError(
          a,
          "spread in call arguments is unsupported (rewrite as a loop, e.g. `for (const x of xs) f(x)`)",
        );
      }
    }

    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "console" &&
      callee.name.text === "log"
    ) {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "console.log expects exactly one argument");
      }
      const arg = expr.arguments[0]!;
      const t = this.inferType(arg);
      if (t.kind === "undefined" || t.kind === "union") {
        throw new CodegenError(
          arg,
          `console.log on ${typeIdent(t)} is unsupported (narrow it with \`if (x !== undefined)\` first)`,
        );
      }
      if (t.kind === "unknown") {
        throw new CodegenError(
          arg,
          "console.log on `unknown` is unsupported (narrow it with `if (x instanceof ClassName)` first)",
        );
      }
      if (isReferenceType(t) || isInterfaceType(t)) {
        throw new CodegenError(arg, `console.log on ${typeIdent(t)} is unsupported`);
      }
      const fn =
        t.kind === "boolean" ? "topaz_console_log_boolean"
        : t.kind === "string" ? "topaz_console_log_string"
        : "topaz_console_log_number";
      return `${fn}(${this.emitExpression(arg)})`;
    }

    if (ts.isPropertyAccessExpression(callee)) {
      const baseType = this.inferType(callee.expression);
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
      throw new CodegenError(callee, `unsupported method '.${callee.name.text}' on ${typeIdent(baseType)}`);
    }

    if (ts.isIdentifier(callee)) {
      if (this.genericFunctions.has(callee.text)) {
        const resolved = this.resolveGenericCall(callee, expr)!;
        const args = this.emitCallArgs(
          expr.arguments,
          resolved.sig.params,
          `${callee.text}()`,
          expr,
        ).join(", ");
        return `${resolved.mangled}(${args})`;
      }
      const sig = this.functionSigs.get(callee.text);
      if (sig) {
        const args = this.emitCallArgs(expr.arguments, sig.params, `${callee.text}()`, expr).join(", ");
        return `${callee.text}(${args})`;
      }
      // Phase 1.5-3.5e: fn-typed local (a binding holding an arrow / fn
      // value). Resolve the fn type from the scope (or captureContext) and
      // dispatch through the fat pointer.
      const calleeType = this.inferType(callee);
      if (calleeType.kind === "fn") {
        return this.emitFnValueCall(expr, callee, calleeType);
      }
      throw new CodegenError(callee, `unknown function '${callee.text}'`);
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
    expr: ts.CallExpression,
    callee: ts.Expression,
    fnType: TopazType,
  ): string {
    if (fnType.kind !== "fn") throw new Error("emitFnValueCall: not fn");
    if (expr.arguments.length !== fnType.params.length) {
      throw new CodegenError(
        expr,
        `fn value expects ${fnType.params.length} argument(s), got ${expr.arguments.length}`,
      );
    }
    const args = expr.arguments
      .map((a, i) => this.emitWithExpected(a, fnType.params[i]!.type))
      .join(", ");
    const tmp = `__topaz_fc_${this.tmpCounter++}`;
    const calleeStr = this.emitExpression(callee);
    const fnTypeName = typeIdent(fnType);
    const callArgs = args.length > 0 ? `${tmp}.env, ${args}` : `${tmp}.env`;
    return `({ ${fnTypeName} ${tmp} = ${calleeStr}; ${tmp}.fn(${callArgs}); })`;
  }

  private emitArrayMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const name = arrayShortName(baseType);
    const elem = arrayElem(baseType)!;
    const method = callee.name.text;
    const base = this.emitExpression(callee.expression);
    if (method === "push") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Array.push expects exactly one argument");
      }
      return `topaz_array_${name}_push(${base}, ${this.emitWithExpected(expr.arguments[0]!, elem)})`;
    }
    if (method === "pop") {
      if (expr.arguments.length !== 0) {
        throw new CodegenError(expr, "Array.pop expects no arguments");
      }
      return `topaz_array_${name}_pop(${base})`;
    }
    if (method === "map") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Array.map expects exactly one argument");
      }
      const cb = expr.arguments[0]!;
      const fnType = this.inferCallbackFn(cb, [elem], "Array.map");
      const u = fnType.returnType;
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
      if (expr.arguments.length > 2) {
        throw new CodegenError(expr, "Array.slice expects at most two arguments");
      }
      // Type-check each present argument as `number` up-front so the error
      // surfaces here rather than as a cryptic C compile error inside the
      // stmt-expression.
      for (const arg of expr.arguments) {
        const at = this.inferType(arg);
        if (at.kind !== "number") {
          throw new CodegenError(
            arg,
            `Array.slice argument must be number, got ${typeIdent(at)}`,
          );
        }
      }
      const startExpr = expr.arguments.length >= 1
        ? `(double)(${this.emitWithExpected(expr.arguments[0]!, T_NUMBER)})`
        : "(double)NAN";
      const endExpr = expr.arguments.length >= 2
        ? `(double)(${this.emitWithExpected(expr.arguments[1]!, T_NUMBER)})`
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
      if (expr.arguments.length === 0) {
        throw new CodegenError(expr, "Array.includes expects exactly one argument");
      }
      if (expr.arguments.length > 1) {
        // Second `fromIndex` argument is unsupported (would need to negative-
        // index normalize via topaz_slice_normalize, which is not yet wired
        // up — defer to 1.5-3.5f-slice).
        throw new CodegenError(expr, "Array.includes `fromIndex` argument is unsupported");
      }
      // `target` must match elem exactly. emitWithExpected handles class -> iface
      // coercion automatically when elem is an interface.
      const tStr = this.emitWithExpected(expr.arguments[0]!, elem);
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
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Array.filter expects exactly one argument");
      }
      const cb = expr.arguments[0]!;
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
      if (expr.arguments.length > 1) {
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
      if (expr.arguments.length === 1) {
        const sepType = this.inferType(expr.arguments[0]!);
        if (sepType.kind !== "string") {
          throw new CodegenError(
            expr.arguments[0]!,
            `Array.join separator must be string, got ${typeIdent(sepType)}`,
          );
        }
        sepStr = this.emitWithExpected(expr.arguments[0]!, T_STRING);
      } else {
        // `","` static literal as a `topaz_string` compound literal.
        sepStr = `((topaz_string){ ",", 1 })`;
      }
      this.recordArrayJoinMonomorph(baseType);
      return `topaz_array_${name}_join(${base}, ${sepStr})`;
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on ${typeIdent(baseType)}`);
  }

  // Phase 1.5-6 prep #10: String.prototype.charCodeAt / .slice. Arguments
  // are number-EXACT (no number-literal-via-string coercion), and missing
  // slice args lower to `(double)NAN` so topaz_slice_normalize picks the
  // default. charCodeAt requires exactly one argument; slice accepts 0..2.
  private emitStringMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
  ): string {
    const method = callee.name.text;
    const base = this.emitExpression(callee.expression);
    if (method === "charCodeAt") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "String.charCodeAt expects exactly one argument");
      }
      const argType = this.inferType(expr.arguments[0]!);
      if (argType.kind !== "number") {
        throw new CodegenError(
          expr.arguments[0]!,
          `String.charCodeAt argument must be number, got ${typeIdent(argType)}`,
        );
      }
      const idx = this.emitWithExpected(expr.arguments[0]!, T_NUMBER);
      return `topaz_string_char_code_at(${base}, ${idx})`;
    }
    if (method === "slice") {
      if (expr.arguments.length > 2) {
        throw new CodegenError(expr, "String.slice expects at most two arguments");
      }
      for (const arg of expr.arguments) {
        const at = this.inferType(arg);
        if (at.kind !== "number") {
          throw new CodegenError(
            arg,
            `String.slice argument must be number, got ${typeIdent(at)}`,
          );
        }
      }
      const startExpr = expr.arguments.length >= 1
        ? `(double)(${this.emitWithExpected(expr.arguments[0]!, T_NUMBER)})`
        : "(double)NAN";
      const endExpr = expr.arguments.length >= 2
        ? `(double)(${this.emitWithExpected(expr.arguments[1]!, T_NUMBER)})`
        : "(double)NAN";
      return `topaz_string_slice(${base}, ${startExpr}, ${endExpr})`;
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on topaz_string`);
  }

  private inferStringMethodReturn(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
  ): TopazType {
    const method = callee.name.text;
    if (method === "charCodeAt") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "String.charCodeAt expects exactly one argument");
      }
      const argType = this.inferType(expr.arguments[0]!);
      if (argType.kind !== "number") {
        throw new CodegenError(
          expr.arguments[0]!,
          `String.charCodeAt argument must be number, got ${typeIdent(argType)}`,
        );
      }
      return T_NUMBER;
    }
    if (method === "slice") {
      if (expr.arguments.length > 2) {
        throw new CodegenError(expr, "String.slice expects at most two arguments");
      }
      for (const arg of expr.arguments) {
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
    throw new CodegenError(callee, `unsupported method '.${method}' on topaz_string`);
  }

  private emitMapMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const name = mapShortName(baseType);
    const k = mapKey(baseType)!;
    const v = mapValue(baseType)!;
    const method = callee.name.text;
    const base = this.emitExpression(callee.expression);
    if (method === "set") {
      if (expr.arguments.length !== 2) {
        throw new CodegenError(expr, "Map.set expects exactly two arguments");
      }
      // emitWithExpected enables class -> interface coercion for the value
      // when V is an interface; keys are still scalar so this is a no-op for
      // them, but the helper handles both uniformly.
      const ke = this.emitWithExpected(expr.arguments[0]!, k);
      const ve = this.emitWithExpected(expr.arguments[1]!, v);
      return `topaz_map_${name}_set(${base}, ${ke}, ${ve})`;
    }
    if (method === "get") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Map.get expects exactly one argument");
      }
      return `topaz_map_${name}_get(${base}, ${this.emitWithExpected(expr.arguments[0]!, k)})`;
    }
    if (method === "has") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Map.has expects exactly one argument");
      }
      return `topaz_map_${name}_has(${base}, ${this.emitWithExpected(expr.arguments[0]!, k)})`;
    }
    if (method === "delete") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Map.delete expects exactly one argument");
      }
      return `topaz_map_${name}_delete(${base}, ${this.emitWithExpected(expr.arguments[0]!, k)})`;
    }
    // Phase 1.5-3.5g-iterator: `.values()` / `.keys()` now yield an Iterator<T>
    // value — a fat pointer struct allocated on the arena. The for-of dispatch
    // recognizes the call as a special form for direct hash-walk lowering;
    // standalone uses produce a real iter that can be bound / passed / consumed
    // via for-of (which uses the while-form lowering instead).
    if (method === "values") {
      if (expr.arguments.length !== 0) {
        throw new CodegenError(expr, "Map.values takes no arguments");
      }
      return this.emitIterConstruction(callee.expression, baseType, "map_values", v, "value");
    }
    if (method === "keys") {
      if (expr.arguments.length !== 0) {
        throw new CodegenError(expr, "Map.keys takes no arguments");
      }
      return this.emitIterConstruction(callee.expression, baseType, "map_keys", k, "key");
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
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const cls = this.classes.get(classNameOf(baseType)!)!;
    const mname = callee.name.text;
    const method = cls.methods.get(mname);
    if (!method) {
      if (cls.fields.has(mname)) {
        throw new CodegenError(callee, `'${mname}' is a field, not a method, on class '${cls.name}'`);
      }
      throw new CodegenError(callee, `class '${cls.name}' has no method '${mname}'`);
    }
    const base = this.emitExpression(callee.expression);
    const argParts = [
      base,
      ...this.emitCallArgs(expr.arguments, method.params, `${cls.name}.${mname}`, expr),
    ];
    return `topaz_class_${cls.name}_method_${mname}(${argParts.join(", ")})`;
  }

  private emitInterfaceMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
    const mname = callee.name.text;
    const sig = iface.methods.get(mname);
    if (!sig) {
      if (iface.fields.has(mname)) {
        throw new CodegenError(callee, `'${mname}' is a field, not a method, on interface '${iface.name}'`);
      }
      throw new CodegenError(callee, `interface '${iface.name}' has no method '${mname}'`);
    }
    const id = this.tmpCounter++;
    const tmp = `__topaz_ib_${id}`;
    const baseStr = this.emitExpression(callee.expression);
    const argParts = [
      `${tmp}.data`,
      ...this.emitCallArgs(expr.arguments, sig.params, `${iface.name}.${mname}`, expr),
    ];
    return `({ ${cTypeName(baseType)} ${tmp} = ${baseStr}; ${tmp}.vt->${mname}(${argParts.join(", ")}); })`;
  }

  private emitSetMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const name = setShortName(baseType);
    const elem = setElem(baseType)!;
    const method = callee.name.text;
    const base = this.emitExpression(callee.expression);
    if (method === "add") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Set.add expects exactly one argument");
      }
      return `topaz_set_${name}_add(${base}, ${this.emitWithExpected(expr.arguments[0]!, elem)})`;
    }
    if (method === "has") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Set.has expects exactly one argument");
      }
      return `topaz_set_${name}_has(${base}, ${this.emitWithExpected(expr.arguments[0]!, elem)})`;
    }
    if (method === "delete") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Set.delete expects exactly one argument");
      }
      return `topaz_set_${name}_delete(${base}, ${this.emitWithExpected(expr.arguments[0]!, elem)})`;
    }
    // Phase 1.5-3.5g-iterator: Set.values() / Set.keys() yield an Iterator<T>;
    // both share `set_values` semantics (Set yields elem for either, matching
    // JS), so we always pass source="set_values" + field="key".
    if (method === "values" || method === "keys") {
      if (expr.arguments.length !== 0) {
        throw new CodegenError(expr, `Set.${method} takes no arguments`);
      }
      return this.emitIterConstruction(callee.expression, baseType, "set_values", elem, "key");
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
    expr: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.CallExpression,
    receiver: ts.Expression,
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
    expr: ts.PropertyAccessExpression,
  ): { baseType: TopazType; inner: TopazType; fieldType: TopazType } {
    const { baseType, inner } = this.resolveOptionalReceiver(expr, expr.expression);
    const fname = expr.name.text;
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
    callee: ts.PropertyAccessExpression,
  ): { baseType: TopazType; inner: TopazType; sig: { params: ParamInfo[]; returnType: TopazType } } {
    const { baseType, inner } = this.resolveOptionalReceiver(callee, callee.expression);
    const mname = callee.name.text;
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
    expr: ts.ElementAccessExpression,
  ): { baseType: TopazType; inner: TopazType; elem: TopazType } {
    const { baseType, inner } = this.resolveOptionalReceiver(expr, expr.expression);
    if (!isArrayType(inner)) {
      throw new CodegenError(
        expr,
        `optional index access \`?.[i]\` is only supported on Array receivers (got ${typeIdent(baseType)})`,
      );
    }
    this.expectType(expr.argumentExpression, T_NUMBER);
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
    anchor: ts.Node;
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

  private emitOptionalPropertyAccess(expr: ts.PropertyAccessExpression): string {
    const { baseType, inner, fieldType } = this.resolveOptionalFieldType(expr);
    const baseStr = this.emitExpression(expr.expression);
    const fname = expr.name.text;
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

  private emitOptionalElementAccess(expr: ts.ElementAccessExpression): string {
    const { baseType, inner, elem } = this.resolveOptionalIndexType(expr);
    const baseStr = this.emitExpression(expr.expression);
    const idxStr = this.emitExpression(expr.argumentExpression);
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
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
  ): string {
    const { baseType, inner, sig } = this.resolveOptionalMethodSig(callee);
    if (expr.arguments.length !== sig.params.length) {
      throw new CodegenError(
        expr,
        `${typeIdent(inner)}.${callee.name.text} expects ${sig.params.length} argument(s), got ${expr.arguments.length}`,
      );
    }
    const baseStr = this.emitExpression(callee.expression);
    const argStrs = expr.arguments.map((a, i) => this.emitWithExpected(a, sig.params[i]!.type));
    const mname = callee.name.text;
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

  private inferType(expr: ts.Expression): TopazType {
    if (ts.isNumericLiteral(expr)) return T_NUMBER;
    if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) {
      return T_BOOLEAN;
    }
    if (expr.kind === ts.SyntaxKind.ThisKeyword) {
      if (!this.currentClass) {
        throw new CodegenError(expr, "`this` is only valid inside class methods or constructors");
      }
      return classOf(this.currentClass);
    }
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return T_STRING;
    }
    // Phase 1.5-3.5e: an arrow's type is built from its param + return
    // annotations. Without contextual typing we require all annotations; a
    // contextual call site (emitWithExpected) feeds the expected type
    // separately. Note: this triggers a redundant emit-into-discard but
    // matches how other compound expressions handle inferType (the slot is
    // append-only and stable).
    if (ts.isArrowFunction(expr)) {
      return this.inferArrowType(expr, undefined);
    }
    if (ts.isFunctionExpression(expr)) {
      throw new CodegenError(expr, "function expressions are unsupported (use an arrow `(...) => ...` instead)");
    }
    if (ts.isTemplateExpression(expr)) {
      // Phase 1.5-3.5: each ${} substitution must be number / boolean / string
      // (after narrowing). Class / interface / array / map / set / union have
      // no defined toString policy yet — surface the error at the substitution.
      for (const span of expr.templateSpans) {
        const sub = this.inferType(span.expression);
        if (sub.kind !== "number" && sub.kind !== "boolean" && sub.kind !== "string") {
          throw new CodegenError(
            span.expression,
            `template literal substitution must be number / boolean / string, got ${typeIdent(sub)}`,
          );
        }
      }
      return T_STRING;
    }
    if (ts.isParenthesizedExpression(expr)) return this.inferType(expr.expression);
    // Phase 1.5-6 prep: object literal expressions have no inferable type on
    // their own — they need a contextual anonymous-class target. Reject here
    // so the error surfaces at the literal site instead of inside a deeper
    // emitExpression fallthrough.
    if (ts.isObjectLiteralExpression(expr)) {
      throw new CodegenError(
        expr,
        "object literal expression requires a contextually typed anonymous-class target (annotate the binding / return type)",
      );
    }
    if (ts.isIdentifier(expr)) {
      if (expr.text === "undefined") return T_UNDEFINED;
      const local = this.scope.lookup(expr.text);
      if (!local && this.captureContext && this.captureContext.captures.has(expr.text)) {
        return this.captureContext.captures.get(expr.text)!;
      }
      if (local) return local.type;
      // Phase 1.5-3.5g-array-fn: top-level functions are addressable as fn
      // values when referenced by name (`seeds.map(makeAdder)`). Generic
      // functions need a call-site type-arg list to monomorphize, so they
      // stay rejected here.
      const sig = this.functionSigs.get(expr.text);
      if (sig) {
        const fnType: TopazType = { kind: "fn", params: sig.params, returnType: sig.returnType };
        return fnType;
      }
      throw new CodegenError(expr, `unknown identifier '${expr.text}'`);
    }
    if (ts.isPropertyAccessExpression(expr) && expr.questionDotToken) {
      const { fieldType } = this.resolveOptionalFieldType(expr);
      return makeUnion([fieldType, T_UNDEFINED]);
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      if (baseType.kind === "union") {
        throw new CodegenError(
          expr,
          `cannot access '.${expr.name.text}' on union type ${typeIdent(baseType)} — narrow it first with \`if (x !== undefined)\``,
        );
      }
      // Phase 1.5-3f: unknown values (catch payload) need `instanceof` to
      // be readable. Surfacing the error here so identifier-level access
      // gets a clear hint instead of a generic "unsupported property" trip.
      if (baseType.kind === "unknown") {
        throw new CodegenError(
          expr,
          `cannot access '.${expr.name.text}' on \`unknown\` — narrow it first with \`if (x instanceof ClassName)\``,
        );
      }
      // Phase 1.5-3e: dunion exposes only the discriminator field; everything
      // else requires narrowing via `switch (d.kind)`.
      if (baseType.kind === "dunion") {
        if (expr.name.text === baseType.discriminator) {
          return T_STRING;
        }
        throw new CodegenError(
          expr,
          `cannot access '.${expr.name.text}' on discriminated union ${typeIdent(baseType)} — narrow it first with \`switch (x.${baseType.discriminator})\``,
        );
      }
      if (baseType.kind === "string" && expr.name.text === "length") {
        return T_NUMBER;
      }
      if (isArrayType(baseType) && expr.name.text === "length") {
        return T_NUMBER;
      }
      if ((isMapType(baseType) || isSetType(baseType)) && expr.name.text === "size") {
        return T_NUMBER;
      }
      if (isClassType(baseType)) {
        const cls = this.classes.get(classNameOf(baseType)!)!;
        const fieldType = cls.fields.get(expr.name.text);
        if (fieldType) return fieldType;
        if (cls.methods.has(expr.name.text)) {
          throw new CodegenError(
            expr,
            `method '${expr.name.text}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          expr,
          `class '${cls.name}' has no member '${expr.name.text}'`,
        );
      }
      if (isInterfaceType(baseType)) {
        const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
        const f = iface.fields.get(expr.name.text);
        if (f) return f;
        if (iface.methods.has(expr.name.text)) {
          throw new CodegenError(
            expr,
            `method '${expr.name.text}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          expr,
          `interface '${iface.name}' has no member '${expr.name.text}'`,
        );
      }
      throw new CodegenError(
        expr,
        `unsupported property access '.${expr.name.text}' on ${typeIdent(baseType)}`,
      );
    }
    if (ts.isElementAccessExpression(expr) && expr.questionDotToken) {
      const { elem } = this.resolveOptionalIndexType(expr);
      return makeUnion([elem, T_UNDEFINED]);
    }
    if (ts.isElementAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      const elem = arrayElem(baseType);
      if (!elem) {
        throw new CodegenError(expr, `index access is only supported on Array (got ${typeIdent(baseType)})`);
      }
      this.expectType(expr.argumentExpression, T_NUMBER);
      return elem;
    }
    if (ts.isArrayLiteralExpression(expr)) {
      if (expr.elements.length === 0) {
        throw new CodegenError(
          expr,
          "cannot infer element type of empty array literal; add an `Array<T>` annotation",
        );
      }
      // Phase 1.5-3.5h-spread: infer elem from first element (spread -> source's
      // elem, fixed -> its type). Subsequent elements are validated by emit-time
      // type checks; inferType only needs the elem to look up the monomorph.
      const first = expr.elements[0]!;
      let elem: TopazType;
      if (ts.isSpreadElement(first)) {
        const srcType = this.inferType(first.expression);
        if (!isArrayType(srcType)) {
          throw new CodegenError(
            first,
            `spread source in array literal must be an Array<T>, got ${typeIdent(srcType)}`,
          );
        }
        elem = arrayElem(srcType)!;
      } else {
        elem = this.inferType(first);
        for (let i = 1; i < expr.elements.length; i++) {
          const e = expr.elements[i]!;
          if (!ts.isSpreadElement(e)) this.expectType(e, elem);
        }
      }
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(expr, `no Array monomorph for element type ${typeIdent(elem)}`);
      }
      this.recordArrayMonomorph(arr);
      return arr;
    }
    if (ts.isNonNullExpression(expr)) {
      // Phase 1.5-3.5c: `e!` asserts at runtime that the optional carries a
      // value, and yields the underlying T. Only `T | undefined` is accepted
      // (scalar / class / iface / array / map / set); a no-op `!` on an
      // already non-optional value is rejected so the assertion remains
      // meaningful (TS-style "Non-null assertion has no effect" warning is
      // upgraded to an error here).
      const inner = this.inferType(expr.expression);
      const stripped = withoutUndefined(inner);
      if (!stripped || typeEq(stripped, inner)) {
        throw new CodegenError(
          expr,
          `non-null assertion (\`!\`) requires a \`T | undefined\` operand; got ${typeIdent(inner)}`,
        );
      }
      if (!isScalarType(stripped) && !isReferenceType(stripped) && !isInterfaceType(stripped)) {
        throw new CodegenError(
          expr,
          `non-null assertion on ${typeIdent(inner)} is unsupported`,
        );
      }
      return stripped;
    }
    if (ts.isPrefixUnaryExpression(expr)) {
      switch (expr.operator) {
        case ts.SyntaxKind.MinusToken:
        case ts.SyntaxKind.PlusToken:
          this.expectType(expr.operand, T_NUMBER);
          return T_NUMBER;
        case ts.SyntaxKind.ExclamationToken:
          this.expectType(expr.operand, T_BOOLEAN);
          return T_BOOLEAN;
        case ts.SyntaxKind.PlusPlusToken:
        case ts.SyntaxKind.MinusMinusToken:
          this.checkAssignTarget(expr.operand, expr);
          this.expectType(expr.operand, T_NUMBER);
          return T_NUMBER;
        default:
          unsupported(expr, "prefix unary operator");
      }
    }
    if (ts.isPostfixUnaryExpression(expr)) {
      this.checkAssignTarget(expr.operand, expr);
      this.expectType(expr.operand, T_NUMBER);
      return T_NUMBER;
    }
    if (ts.isBinaryExpression(expr)) {
      const kind = expr.operatorToken.kind;
      switch (kind) {
        case ts.SyntaxKind.PlusToken: {
          const lt = this.inferType(expr.left);
          if (lt.kind === "string") {
            this.expectType(expr.right, T_STRING);
            return T_STRING;
          }
          this.expectType(expr.left, T_NUMBER);
          this.expectType(expr.right, T_NUMBER);
          return T_NUMBER;
        }
        case ts.SyntaxKind.MinusToken:
        case ts.SyntaxKind.AsteriskToken:
        case ts.SyntaxKind.SlashToken:
        case ts.SyntaxKind.PercentToken:
          this.expectType(expr.left, T_NUMBER);
          this.expectType(expr.right, T_NUMBER);
          return T_NUMBER;
        case ts.SyntaxKind.LessThanToken:
        case ts.SyntaxKind.LessThanEqualsToken:
        case ts.SyntaxKind.GreaterThanToken:
        case ts.SyntaxKind.GreaterThanEqualsToken:
          this.expectType(expr.left, T_NUMBER);
          this.expectType(expr.right, T_NUMBER);
          return T_BOOLEAN;
        case ts.SyntaxKind.EqualsEqualsEqualsToken:
        case ts.SyntaxKind.ExclamationEqualsEqualsToken: {
          const lt = this.inferType(expr.left);
          const rt = this.inferType(expr.right);
          if (!typesOverlap(lt, rt)) {
            throw new CodegenError(
              expr,
              `type mismatch: cannot compare ${typeIdent(lt)} === ${typeIdent(rt)} (no common variant)`,
            );
          }
          return T_BOOLEAN;
        }
        case ts.SyntaxKind.AmpersandAmpersandToken:
        case ts.SyntaxKind.BarBarToken:
          this.expectType(expr.left, T_BOOLEAN);
          this.expectType(expr.right, T_BOOLEAN);
          return T_BOOLEAN;
        case ts.SyntaxKind.EqualsToken: {
          this.checkAssignTarget(expr.left, expr);
          const lt = this.inferType(expr.left);
          this.expectType(expr.right, lt);
          return lt;
        }
        case ts.SyntaxKind.PlusEqualsToken: {
          this.checkAssignTarget(expr.left, expr);
          const lt = this.inferType(expr.left);
          if (lt.kind === "string") {
            this.expectType(expr.right, T_STRING);
            return T_STRING;
          }
          this.expectType(expr.left, T_NUMBER);
          this.expectType(expr.right, T_NUMBER);
          return T_NUMBER;
        }
        case ts.SyntaxKind.MinusEqualsToken:
        case ts.SyntaxKind.AsteriskEqualsToken:
        case ts.SyntaxKind.SlashEqualsToken:
        case ts.SyntaxKind.PercentEqualsToken:
          this.checkAssignTarget(expr.left, expr);
          this.expectType(expr.left, T_NUMBER);
          this.expectType(expr.right, T_NUMBER);
          return T_NUMBER;
        case ts.SyntaxKind.EqualsEqualsToken:
        case ts.SyntaxKind.ExclamationEqualsToken:
          throw new CodegenError(
            expr.operatorToken,
            "loose equality (== / !=) is unsupported; use === / !==",
          );
        case ts.SyntaxKind.QuestionQuestionToken: {
          // Phase 1.5-3.5c: `a ?? b` requires `a: T | undefined`. The result
          // is T when the RHS is T, or T | undefined when the RHS is itself
          // T | undefined (so chained `a ?? b ?? c` keeps optional through
          // the middle layer). The RHS must be assignable to one of those.
          const lt = this.inferType(expr.left);
          const inner = withoutUndefined(lt);
          if (!inner || typeEq(inner, lt)) {
            throw new CodegenError(
              expr,
              `\`??\` requires the left operand to be \`T | undefined\`; got ${typeIdent(lt)}`,
            );
          }
          if (!isScalarType(inner) && !isReferenceType(inner) && !isInterfaceType(inner)) {
            throw new CodegenError(
              expr,
              `\`??\` on ${typeIdent(lt)} is unsupported`,
            );
          }
          const rt = this.inferType(expr.right);
          if (this.isAssignableTo(rt, inner)) return inner;
          if (this.isAssignableTo(rt, lt)) return lt;
          throw new CodegenError(
            expr.right,
            `\`??\` right operand has type ${typeIdent(rt)}; expected ${typeIdent(inner)} or ${typeIdent(lt)}`,
          );
        }
        case ts.SyntaxKind.InstanceOfKeyword: {
          // Phase 1.5-3f: `instanceof` runtime type test for catch payloads.
          // Left must be `unknown` (the catch binding's type) or a class
          // instance (tautology, but allowed for symmetry). Right must be a
          // declared concrete class name; interface/generic targets need
          // separate plumbing not in scope for 1.5-3f.
          const lt = this.inferType(expr.left);
          if (lt.kind !== "unknown" && !isClassType(lt)) {
            throw new CodegenError(
              expr.left,
              `\`instanceof\` requires left side to be \`unknown\` or a class instance (got ${typeIdent(lt)})`,
            );
          }
          if (!ts.isIdentifier(expr.right)) {
            throw new CodegenError(
              expr.right,
              "`instanceof` right side must be a class name",
            );
          }
          if (!this.classes.has(expr.right.text)) {
            throw new CodegenError(
              expr.right,
              `unknown class '${expr.right.text}' on right side of \`instanceof\``,
            );
          }
          return T_BOOLEAN;
        }
        default:
          unsupported(expr.operatorToken, "binary operator");
      }
    }
    if (ts.isCallExpression(expr)) {
      const callee = expr.expression;
      // Phase 1.5-3.5d: optional method call `a?.b()` — the result is the
      // method's return type widened to `R | undefined`.
      if (ts.isPropertyAccessExpression(callee) && callee.questionDotToken) {
        const { sig } = this.resolveOptionalMethodSig(callee);
        return makeUnion([sig.returnType, T_UNDEFINED]);
      }
      if (expr.questionDotToken) {
        throw new CodegenError(
          expr,
          "optional call `f?.()` is unsupported (only `a?.b`, `a?.b()`, and `a?.[i]` are supported)",
        );
      }
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "console" &&
        callee.name.text === "log"
      ) {
        throw new CodegenError(expr, "console.log returns void and cannot be used as a value");
      }
      if (ts.isPropertyAccessExpression(callee)) {
        const baseType = this.inferType(callee.expression);
        if (isArrayType(baseType)) {
          const elem = arrayElem(baseType)!;
          if (callee.name.text === "push") {
            throw new CodegenError(expr, "Array.push returns void in this dialect and cannot be used as a value");
          }
          if (callee.name.text === "pop") {
            return elem;
          }
          if (callee.name.text === "map") {
            if (expr.arguments.length !== 1) {
              throw new CodegenError(expr, "Array.map expects exactly one argument");
            }
            const cb = expr.arguments[0]!;
            const fnType = this.inferCallbackFn(cb, [elem], "Array.map");
            const u = fnType.returnType;
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
          if (callee.name.text === "slice") {
            if (expr.arguments.length > 2) {
              throw new CodegenError(expr, "Array.slice expects at most two arguments");
            }
            for (const arg of expr.arguments) {
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
          if (callee.name.text === "includes") {
            if (expr.arguments.length === 0) {
              throw new CodegenError(expr, "Array.includes expects exactly one argument");
            }
            if (expr.arguments.length > 1) {
              throw new CodegenError(expr, "Array.includes `fromIndex` argument is unsupported");
            }
            // Side-effect: re-check that `target` matches elem so emit-side
            // and infer-side reject in lockstep.
            this.emitWithExpected(expr.arguments[0]!, elem);
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
          if (callee.name.text === "filter") {
            if (expr.arguments.length !== 1) {
              throw new CodegenError(expr, "Array.filter expects exactly one argument");
            }
            const cb = expr.arguments[0]!;
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
          if (callee.name.text === "join") {
            if (expr.arguments.length > 1) {
              throw new CodegenError(expr, "Array.join expects at most one argument");
            }
            if (elem.kind !== "number" && elem.kind !== "boolean" && elem.kind !== "string") {
              throw new CodegenError(
                expr,
                `Array.join is unsupported for element type ${typeIdent(elem)}; only scalar (number / boolean / string) elements are supported`,
              );
            }
            if (expr.arguments.length === 1) {
              const sepType = this.inferType(expr.arguments[0]!);
              if (sepType.kind !== "string") {
                throw new CodegenError(
                  expr.arguments[0]!,
                  `Array.join separator must be string, got ${typeIdent(sepType)}`,
                );
              }
            }
            this.recordArrayJoinMonomorph(baseType);
            return T_STRING;
          }
          throw new CodegenError(callee, `unsupported method '.${callee.name.text}' on ${typeIdent(baseType)}`);
        }
        if (isMapType(baseType)) {
          const v = mapValue(baseType)!;
          const m = callee.name.text;
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
          const m = callee.name.text;
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
          const method = cls.methods.get(callee.name.text);
          if (!method) {
            throw new CodegenError(callee, `class '${cls.name}' has no method '${callee.name.text}'`);
          }
          return method.returnType;
        }
        if (isInterfaceType(baseType)) {
          const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
          const sig = iface.methods.get(callee.name.text);
          if (!sig) {
            throw new CodegenError(callee, `interface '${iface.name}' has no method '${callee.name.text}'`);
          }
          return sig.returnType;
        }
        throw new CodegenError(callee, `unsupported method '.${callee.name.text}' on ${typeIdent(baseType)}`);
      }
      if (ts.isIdentifier(callee)) {
        if (this.genericFunctions.has(callee.text)) {
          const resolved = this.resolveGenericCall(callee, expr)!;
          return resolved.sig.returnType;
        }
        const sig = this.functionSigs.get(callee.text);
        if (sig) return sig.returnType;
        // Phase 1.5-3.5e: fn-typed local — look up its inferred type and use
        // its declared return type.
        const calleeType = this.inferType(callee);
        if (calleeType.kind === "fn") return calleeType.returnType;
        throw new CodegenError(callee, `unknown function '${callee.text}'`);
      }
      // Phase 1.5-3.5e: any other expression that types as a fn value.
      const ct = this.inferType(callee);
      if (ct.kind === "fn") return ct.returnType;
      unsupported(callee, "call target");
    }
    if (ts.isNewExpression(expr)) {
      if (!ts.isIdentifier(expr.expression)) {
        throw new CodegenError(expr, "only `new Map<K, V>()` and `new Set<T>()` are supported");
      }
      const name = expr.expression.text;
      if (name === "Map") {
        if (!expr.typeArguments || expr.typeArguments.length !== 2) {
          throw new CodegenError(expr, "Map<K, V> requires exactly two type arguments");
        }
        const k = this.typeFromAnnotation(expr.typeArguments[0]!, expr);
        const v = this.typeFromAnnotation(expr.typeArguments[1]!, expr);
        const t = mapOf(k, v);
        if (!t) throw new CodegenError(expr, `no Map monomorph for key=${typeIdent(k)}, value=${typeIdent(v)}`);
        this.recordMapMonomorph(t);
        return t;
      }
      if (name === "Set") {
        if (!expr.typeArguments || expr.typeArguments.length !== 1) {
          throw new CodegenError(expr, "Set<T> requires exactly one type argument");
        }
        const elem = this.typeFromAnnotation(expr.typeArguments[0]!, expr);
        const t = setOf(elem);
        if (!t) throw new CodegenError(expr, `no Set monomorph for element type ${typeIdent(elem)}`);
        this.recordSetMonomorph(t);
        return t;
      }
      if (this.genericClasses.has(name)) {
        return this.instantiateGenericClass(name, expr.typeArguments, expr);
      }
      if (this.classes.has(name)) {
        if (expr.typeArguments && expr.typeArguments.length > 0) {
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

  private checkAssignTarget(target: ts.Expression, anchor: ts.Node): void {
    if (ts.isIdentifier(target)) {
      const b = this.scope.lookup(target.text);
      if (!b) {
        throw new CodegenError(target, `unknown identifier '${target.text}'`);
      }
      if (b.isConst) {
        throw new CodegenError(anchor, `cannot assign to const '${target.text}'`);
      }
      return;
    }
    if (ts.isElementAccessExpression(target)) {
      // `const arr = [...]` rebinds the binding, not the storage — element
      // assignment mutates through the pointer and is always allowed.
      const baseType = this.inferType(target.expression);
      if (!isArrayType(baseType)) {
        throw new CodegenError(target, `index assignment is only supported on Array (got ${typeIdent(baseType)})`);
      }
      return;
    }
    if (ts.isPropertyAccessExpression(target)) {
      // Compound assignment lowers to `(base)->field op= rhs`, which evaluates
      // `base` once in C. We still restrict the base to side-effect-free forms
      // so that a future lowering swap doesn't surprise anyone.
      if (!this.isSafeLvalueBase(target.expression)) {
        throw new CodegenError(target, "property assignment requires a simple base (identifier, `this`, or chained property access)");
      }
      const baseType = this.inferType(target.expression);
      if (isInterfaceType(baseType)) {
        const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
        if (!iface.fields.has(target.name.text)) {
          if (iface.methods.has(target.name.text)) {
            throw new CodegenError(target, `cannot assign to method '${target.name.text}'`);
          }
          throw new CodegenError(target, `interface '${iface.name}' has no field '${target.name.text}'`);
        }
        return;
      }
      if (!isClassType(baseType)) {
        throw new CodegenError(target, `property assignment is only supported on class instances or interface values (got ${typeIdent(baseType)})`);
      }
      const cls = this.classes.get(classNameOf(baseType)!)!;
      if (!cls.fields.has(target.name.text)) {
        if (cls.methods.has(target.name.text)) {
          throw new CodegenError(target, `cannot assign to method '${target.name.text}'`);
        }
        throw new CodegenError(target, `class '${cls.name}' has no field '${target.name.text}'`);
      }
      return;
    }
    throw new CodegenError(anchor, "assignment target must be an identifier, array index, or property access");
  }

  private isSafeLvalueBase(expr: ts.Expression): boolean {
    if (ts.isIdentifier(expr)) return true;
    if (expr.kind === ts.SyntaxKind.ThisKeyword) return true;
    if (ts.isParenthesizedExpression(expr)) return this.isSafeLvalueBase(expr.expression);
    if (ts.isPropertyAccessExpression(expr)) return this.isSafeLvalueBase(expr.expression);
    return false;
  }

  private expectType(expr: ts.Expression, expected: TopazType): void {
    // Phase 1.5-3e: string literal types accept a matching string literal
    // expression directly (inferType returns T_STRING for literals, so the
    // assignability check would otherwise fail). Discriminator-field assigns
    // in constructors and discriminated-union case labels both flow through
    // here.
    if (
      expected.kind === "string_literal" &&
      (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) &&
      expr.text === expected.value
    ) {
      return;
    }
    // Phase 1.5-3.5g-array-fn: arrows without annotations need the expected fn
    // type to type-check (the unannotated `inferType` would throw). Mirror the
    // contextual path in emitWithExpected so `=` / `[i] = ` / `.push(arrow)`
    // see the same validation rules.
    if (ts.isArrowFunction(expr) && expected.kind === "fn") {
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
      return expected.variants.some((v) => this.isAssignableTo(actual, v));
    }
    if (actual.kind === "union") {
      return actual.variants.every((v) => this.isAssignableTo(v, expected));
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
    return false;
  }

  // Type-check `expr` against `expected` and emit C source, inserting class ->
  // interface coercion (fat pointer compound literal) when needed. Use this
  // helper at every value-passing site (variable init, call argument, return
  // statement, assignment RHS) where the expected type is known.
  private emitWithExpected(expr: ts.Expression, expected: TopazType): string {
    // Phase 1.5-3b: the literal `undefined` lowers based on the expected
    // container type (NULL pointer for reference, fat pointer with .data=NULL
    // for interface). Without a `T | undefined` expected this is a type error.
    if (ts.isIdentifier(expr) && expr.text === "undefined") {
      return this.emitUndefinedLiteral(expected, expr);
    }
    // Phase 1.5-3.5e: arrows pick up param/return types contextually from the
    // expected fn type when annotations are missing. Pass expected through so
    // `let f: (n: number) => number = (n) => n + 1` works.
    if (ts.isArrowFunction(expr)) {
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
    if (
      expected.kind === "string_literal" &&
      (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
    ) {
      if (expr.text !== expected.value) {
        throw new CodegenError(
          expr,
          `type mismatch: expected ${typeIdent(expected)}, got string literal "${expr.text}"`,
        );
      }
      return this.emitStringLiteral(expr);
    }
    if (ts.isArrayLiteralExpression(expr)) {
      // Array literal element types aren't interfaces (no Array<Interface> in
      // 1.4b), so no coercion is needed at the array itself.
      return this.emitArrayLiteral(expr, expected);
    }
    if (ts.isNewExpression(expr)) {
      // Bare `new Map()` / `new Set()` carries no type info; thread expected
      // through as context. Interface widening is impossible for Map/Set, so
      // forwarding expected unmodified is safe.
      const isBareMapSet =
        ts.isIdentifier(expr.expression) &&
        (expr.expression.text === "Map" || expr.expression.text === "Set") &&
        (!expr.typeArguments || expr.typeArguments.length === 0);
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
    if (ts.isObjectLiteralExpression(expr)) {
      if (!isClassType(expected) || !this.isAnonClassName(classNameOf(expected)!)) {
        throw new CodegenError(
          expr,
          `object literal expression requires a contextually typed anonymous-class target, got ${typeIdent(expected)}`,
        );
      }
      const className = classNameOf(expected)!;
      const info = this.classes.get(className)!;
      const seen = new Set<string>();
      const valuesByField = new Map<string, ts.Expression>();
      for (const prop of expr.properties) {
        if (!ts.isPropertyAssignment(prop)) {
          throw new CodegenError(
            prop,
            "object literal only supports plain `name: value` properties (no shorthand, method shorthand, getter / setter, spread)",
          );
        }
        if (!ts.isIdentifier(prop.name)) {
          throw new CodegenError(prop, "object literal property name must be a simple identifier");
        }
        const fname = prop.name.text;
        if (seen.has(fname)) {
          throw new CodegenError(prop, `duplicate property '${fname}' in object literal`);
        }
        seen.add(fname);
        if (!info.fields.has(fname)) {
          throw new CodegenError(prop, `property '${fname}' does not exist on type ${typeIdent(expected)}`);
        }
        valuesByField.set(fname, prop.initializer);
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
    args: readonly ts.Expression[],
    params: readonly ParamInfo[],
    label: string,
    anchor: ts.Node,
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

  private emitUndefinedLiteral(expected: TopazType, anchor: ts.Node): string {
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

  private applyCoercion(raw: string, actual: TopazType, expected: TopazType, anchor: ts.Node): string {
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
        throw new Error(`encodeStringLiteralCompound: non-ASCII byte in '${value}'`);
      }
      if (c === 0x22) escaped += '\\"';
      else if (c === 0x5c) escaped += "\\\\";
      else if (c === 0x0a) escaped += "\\n";
      else if (c === 0x0d) escaped += "\\r";
      else if (c === 0x09) escaped += "\\t";
      else if (c === 0x00) escaped += "\\0";
      else if (c < 0x20 || c === 0x7f) {
        escaped += `\\x${c.toString(16).padStart(2, "0")}`;
      } else {
        escaped += String.fromCharCode(c);
      }
      byteLen++;
    }
    escaped += '"';
    return `((topaz_string){ ${escaped}, ${byteLen} })`;
  }
}

export function codegen(sourceFiles: ts.SourceFile | readonly ts.SourceFile[]): string {
  const files = Array.isArray(sourceFiles) ? (sourceFiles as readonly ts.SourceFile[]) : [sourceFiles as ts.SourceFile];
  return new Emitter().emit(files);
}

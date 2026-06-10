#!/usr/bin/env node
import fs from "node:fs";

const runtimePath = process.argv[2] ?? "runtime/runtime.h";

const CATEGORY = {
  HEADER: "header/types/option wrappers",
  ALLOC: "arena/raw memory/string allocation primitives",
  BIGINT: "bigint limb storage/arithmetic/formatting",
  STRING: "string allocation or host-backed primitives",
  HOST: "fs/process/url/child_process host wrappers",
  NUMBER: "number/parse/libm formatting substrate",
  CONSOLE: "console IO helpers",
  CONTAINER: "container macro families / hash / key equality",
  EXCEPTION: "exception setjmp/longjmp substrate",
};

const MIGRATION = {
  RAW_MEMORY: "raw-memory-boundary",
  HOST_ABI: "host-abi-boundary",
  LIBC_LIBM: "libc-libm-boundary",
  EXCEPTION: "exception-boundary",
  CONTAINER_MONOMORPH: "container-monomorph-boundary",
  STRING_BUFFER_INTRINSICS: "needs-string-buffer-intrinsics",
  STRING_BUFFER_INTRINSIC_FAMILY: "string-buffer-intrinsic-family",
  BIGINT_LIMB_INTRINSICS: "needs-bigint-limb-intrinsics",
  BIGINT_LIMB_INTRINSIC_FAMILY: "bigint-limb-intrinsic-family",
  C_ABI_TYPE: "c-abi-type-boundary",
};

const NEXT = {
  RAW_MEMORY:
    "Pinned as the pre-v0.2 compiler-owned raw memory / arena substrate boundary for topaz_arena_alloc, topaz_arena_calloc, and topaz_arena_realloc; moving these allocation, zero-initialization, or grow primitives requires an explicit memory intrinsic or backend storage decision.",
  HOST_ABI:
    "Pinned as the pre-v0.2 capability-aware host ABI substrate boundary for raw stdio writes, filesystem wrappers, process argv/cwd/exit/module URL wrappers, and child process spawn; moving any helper requires an explicit manifest/capability/doctor-aware host syscall or intrinsic decision.",
  LIBC_LIBM:
    "Pinned as the pre-v0.2 number substrate boundary for topaz_fmod (number % number via libm fmod), topaz_parse_float (parseFloat via strtod), and topaz_number_to_string (ECMA-262 formatting via snprintf plus strtod roundtrip); moving any helper requires an explicit replacement decision preserving current parse, roundoff, remainder, and formatting behavior.",
  EXCEPTION:
    "Pinned as the pre-v0.2 exception/control-transfer substrate boundary for topaz_try_push, topaz_try_pop, topaz_throw, and topaz_panic because they depend on setjmp/longjmp, jmp_buf frame lifetime, panic diagnostics, and abort/panic control transfer; moving any helper requires a future explicit exception runtime/backend design rather than helper-by-helper runtime prelude migration.",
  CONTAINER_MONOMORPH: "Needs a compiler-owned replacement for monomorphized container storage, hashing, and equality.",
  STRING_BUFFER_INTRINSICS:
    "Closed after the completed StringBuffer prelude migration; use string-buffer-intrinsic-family for active internal string-buffer substrate or record a new boundary decision.",
  STRING_BUFFER_INTRINSIC_FAMILY: "Compiler-owned internal string-buffer family that will replace the old byte-code boundary as prelude clients migrate.",
  BIGINT_LIMB_INTRINSICS:
    "Closed after the completed BigInt prelude migration; use bigint-limb-intrinsic-family for active internal limb substrate or record a new boundary decision.",
  BIGINT_LIMB_INTRINSIC_FAMILY: "Compiler-owned internal BigIntBuffer limb family required before BigInt helpers migrate into the runtime prelude.",
  C_ABI_TYPE:
    "Pinned as the pre-v0.2 generated-C/runtime ABI type substrate for TOPAZ_RUNTIME_H, topaz_opt_wrap_number, topaz_opt_wrap_boolean, topaz_opt_wrap_string, topaz_opt_absent_number, topaz_opt_absent_boolean, topaz_opt_absent_string, and topaz_opt_passthrough because generated C, runtime container macros, optional narrowing, Map.get, optional chaining, nullish coalescing, and scalar T | undefined coercion share these optional wrapper, absent sentinel, passthrough, ABI, and layout shapes; moving them requires a future explicit generated-C ABI/type-layout/backend decision rather than helper-by-helper runtime prelude migration.",
};

const CLOSED_MIGRATION_LANES = [
  MIGRATION.BIGINT_LIMB_INTRINSICS,
  MIGRATION.STRING_BUFFER_INTRINSICS,
];

const CLOSED_MIGRATION_LANE_GUIDANCE = new Map([
  [MIGRATION.BIGINT_LIMB_INTRINSICS, NEXT.BIGINT_LIMB_INTRINSICS],
  [MIGRATION.STRING_BUFFER_INTRINSICS, NEXT.STRING_BUFFER_INTRINSICS],
]);

const inventory = {
  TOPAZ_RUNTIME_H: {
    category: CATEGORY.HEADER,
    reason: "runtime header include guard for the embedded C substrate.",
    migration: MIGRATION.C_ABI_TYPE,
    next: NEXT.C_ABI_TYPE,
  },
  topaz_opt_wrap_number: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined optional wrapper used by Map.get lowering.",
    migration: MIGRATION.C_ABI_TYPE,
    next: NEXT.C_ABI_TYPE,
  },
  topaz_opt_wrap_boolean: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined optional wrapper used by Map.get lowering.",
    migration: MIGRATION.C_ABI_TYPE,
    next: NEXT.C_ABI_TYPE,
  },
  topaz_opt_wrap_string: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined optional wrapper used by Map.get lowering.",
    migration: MIGRATION.C_ABI_TYPE,
    next: NEXT.C_ABI_TYPE,
  },
  topaz_opt_absent_number: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined absent sentinel used by Map.get lowering.",
    migration: MIGRATION.C_ABI_TYPE,
    next: NEXT.C_ABI_TYPE,
  },
  topaz_opt_absent_boolean: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined absent sentinel used by Map.get lowering.",
    migration: MIGRATION.C_ABI_TYPE,
    next: NEXT.C_ABI_TYPE,
  },
  topaz_opt_absent_string: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined absent sentinel used by Map.get lowering.",
    migration: MIGRATION.C_ABI_TYPE,
    next: NEXT.C_ABI_TYPE,
  },
  topaz_opt_passthrough: {
    category: CATEGORY.HEADER,
    reason: "reference optional identity wrapper for class/interface Map values.",
    migration: MIGRATION.C_ABI_TYPE,
    next: NEXT.C_ABI_TYPE,
  },

  topaz_arena_alloc: {
    category: CATEGORY.ALLOC,
    reason: "process-lifetime arena allocation primitive.",
    migration: MIGRATION.RAW_MEMORY,
    next: NEXT.RAW_MEMORY,
  },
  topaz_arena_calloc: {
    category: CATEGORY.ALLOC,
    reason: "zero-initializing arena allocation primitive for generated storage.",
    migration: MIGRATION.RAW_MEMORY,
    next: NEXT.RAW_MEMORY,
  },
  topaz_arena_realloc: {
    category: CATEGORY.ALLOC,
    reason: "arena grow primitive used by strings and containers.",
    migration: MIGRATION.RAW_MEMORY,
    next: NEXT.RAW_MEMORY,
  },

  topaz_bigint_buffer_new: {
    category: CATEGORY.BIGINT,
    reason: "internal runtime prelude opaque bigint limb buffer allocation primitive.",
    migration: MIGRATION.BIGINT_LIMB_INTRINSIC_FAMILY,
    next: NEXT.BIGINT_LIMB_INTRINSIC_FAMILY,
  },
  topaz_bigint_buffer_to_bigint: {
    category: CATEGORY.BIGINT,
    reason: "internal runtime prelude materialization primitive from BigIntBuffer to immutable bigint.",
    migration: MIGRATION.BIGINT_LIMB_INTRINSIC_FAMILY,
    next: NEXT.BIGINT_LIMB_INTRINSIC_FAMILY,
  },
  topaz_bigint_buffer_len: {
    category: CATEGORY.BIGINT,
    reason: "internal runtime prelude length read primitive for BigIntBuffer limbs.",
    migration: MIGRATION.BIGINT_LIMB_INTRINSIC_FAMILY,
    next: NEXT.BIGINT_LIMB_INTRINSIC_FAMILY,
  },
  topaz_bigint_buffer_get_limb: {
    category: CATEGORY.BIGINT,
    reason: "internal runtime prelude limb read primitive for BigIntBuffer.",
    migration: MIGRATION.BIGINT_LIMB_INTRINSIC_FAMILY,
    next: NEXT.BIGINT_LIMB_INTRINSIC_FAMILY,
  },
  topaz_bigint_buffer_set_limb: {
    category: CATEGORY.BIGINT,
    reason: "internal runtime prelude limb write primitive for BigIntBuffer.",
    migration: MIGRATION.BIGINT_LIMB_INTRINSIC_FAMILY,
    next: NEXT.BIGINT_LIMB_INTRINSIC_FAMILY,
  },
  topaz_bigint_limb_len: {
    category: CATEGORY.BIGINT,
    reason: "internal runtime prelude immutable bigint limb-count inspection primitive.",
    migration: MIGRATION.BIGINT_LIMB_INTRINSIC_FAMILY,
    next: NEXT.BIGINT_LIMB_INTRINSIC_FAMILY,
  },
  topaz_bigint_limb: {
    category: CATEGORY.BIGINT,
    reason: "internal runtime prelude immutable bigint limb inspection primitive.",
    migration: MIGRATION.BIGINT_LIMB_INTRINSIC_FAMILY,
    next: NEXT.BIGINT_LIMB_INTRINSIC_FAMILY,
  },
  topaz_bigint_sign: {
    category: CATEGORY.BIGINT,
    reason: "internal runtime prelude immutable bigint sign inspection primitive.",
    migration: MIGRATION.BIGINT_LIMB_INTRINSIC_FAMILY,
    next: NEXT.BIGINT_LIMB_INTRINSIC_FAMILY,
  },

  topaz_string_eq: {
    category: CATEGORY.CONTAINER,
    reason: "string key equality substrate for Map/Set monomorphs.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  topaz_string_buffer_new: {
    category: CATEGORY.STRING,
    reason: "internal runtime prelude opaque string buffer allocation primitive.",
    migration: MIGRATION.STRING_BUFFER_INTRINSIC_FAMILY,
    next: NEXT.STRING_BUFFER_INTRINSIC_FAMILY,
  },
  topaz_string_buffer_push_byte: {
    category: CATEGORY.STRING,
    reason: "internal runtime prelude byte append primitive for StringBuffer.",
    migration: MIGRATION.STRING_BUFFER_INTRINSIC_FAMILY,
    next: NEXT.STRING_BUFFER_INTRINSIC_FAMILY,
  },
  topaz_string_buffer_append_string: {
    category: CATEGORY.STRING,
    reason: "internal runtime prelude string copy primitive for StringBuffer.",
    migration: MIGRATION.STRING_BUFFER_INTRINSIC_FAMILY,
    next: NEXT.STRING_BUFFER_INTRINSIC_FAMILY,
  },
  topaz_string_buffer_byte_at: {
    category: CATEGORY.STRING,
    reason: "internal runtime prelude byte read primitive for StringBuffer.",
    migration: MIGRATION.STRING_BUFFER_INTRINSIC_FAMILY,
    next: NEXT.STRING_BUFFER_INTRINSIC_FAMILY,
  },
  topaz_string_buffer_to_string: {
    category: CATEGORY.STRING,
    reason: "internal runtime prelude immutable string materialization primitive for StringBuffer.",
    migration: MIGRATION.STRING_BUFFER_INTRINSIC_FAMILY,
    next: NEXT.STRING_BUFFER_INTRINSIC_FAMILY,
  },

  topaz_fmod: {
    category: CATEGORY.NUMBER,
    reason: "libm-backed modulo substrate.",
    migration: MIGRATION.LIBC_LIBM,
    next: NEXT.LIBC_LIBM,
  },
  topaz_parse_float: {
    category: CATEGORY.NUMBER,
    reason: "host strtod substrate for parseFloat.",
    migration: MIGRATION.LIBC_LIBM,
    next: NEXT.LIBC_LIBM,
  },
  topaz_number_to_string: {
    category: CATEGORY.NUMBER,
    reason: "snprintf/strtod round-trip formatting substrate.",
    migration: MIGRATION.LIBC_LIBM,
    next: NEXT.LIBC_LIBM,
  },

  topaz_stdout_write: {
    category: CATEGORY.CONSOLE,
    reason: "process.stdout.write substrate.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },
  topaz_stderr_write: {
    category: CATEGORY.CONSOLE,
    reason: "process.stderr.write substrate.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },

  topaz_fs_read_text_file: {
    category: CATEGORY.HOST,
    reason: "filesystem read host wrapper.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },
  topaz_fs_exists: {
    category: CATEGORY.HOST,
    reason: "filesystem access host wrapper.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },
  topaz_fs_write_text_file: {
    category: CATEGORY.HOST,
    reason: "filesystem write host wrapper.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },
  topaz_fs_mkdir_p: {
    category: CATEGORY.HOST,
    reason: "filesystem mkdir host wrapper.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },
  topaz_process_cwd: {
    category: CATEGORY.HOST,
    reason: "getcwd fallback for path.resolve prelude helper.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },
  topaz_runtime_init_argv: {
    category: CATEGORY.HOST,
    reason: "native argv capture for generated main.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },
  topaz_process_argv: {
    category: CATEGORY.HOST,
    reason: "process.argv host wrapper.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },
  topaz_process_exit: {
    category: CATEGORY.HOST,
    reason: "process.exit host wrapper.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },
  topaz_child_exec_inherit: {
    category: CATEGORY.HOST,
    reason: "fork/exec/waitpid child_process host wrapper.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },
  topaz_runtime_module_url: {
    category: CATEGORY.HOST,
    reason: "runtime module URL host wrapper for the release compiler.",
    migration: MIGRATION.HOST_ABI,
    next: NEXT.HOST_ABI,
  },

  TOPAZ_ARRAY_DEFINE: {
    category: CATEGORY.CONTAINER,
    reason: "monomorphized array macro family.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  TOPAZ_HASH_SLOT_EMPTY: {
    category: CATEGORY.CONTAINER,
    reason: "open-addressing hash state marker.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  TOPAZ_HASH_SLOT_OCCUPIED: {
    category: CATEGORY.CONTAINER,
    reason: "open-addressing hash state marker.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  TOPAZ_HASH_SLOT_TOMBSTONE: {
    category: CATEGORY.CONTAINER,
    reason: "open-addressing hash state marker.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  topaz_hash_number: {
    category: CATEGORY.CONTAINER,
    reason: "number key hashing with SameValueZero normalization.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  topaz_key_eq_number: {
    category: CATEGORY.CONTAINER,
    reason: "number key equality with SameValueZero semantics.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  topaz_hash_boolean: {
    category: CATEGORY.CONTAINER,
    reason: "boolean key hashing.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  topaz_hash_pointer: {
    category: CATEGORY.CONTAINER,
    reason: "reference identity hashing for class/interface keys.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  topaz_key_eq_boolean: {
    category: CATEGORY.CONTAINER,
    reason: "boolean key equality.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  topaz_hash_string: {
    category: CATEGORY.CONTAINER,
    reason: "byte string key hashing.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  TOPAZ_MAP_DEFINE: {
    category: CATEGORY.CONTAINER,
    reason: "monomorphized Map macro family.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },
  TOPAZ_SET_DEFINE: {
    category: CATEGORY.CONTAINER,
    reason: "monomorphized Set macro family.",
    migration: MIGRATION.CONTAINER_MONOMORPH,
    next: NEXT.CONTAINER_MONOMORPH,
  },

  topaz_try_push: {
    category: CATEGORY.EXCEPTION,
    reason: "setjmp frame stack push.",
    migration: MIGRATION.EXCEPTION,
    next: NEXT.EXCEPTION,
  },
  topaz_try_pop: {
    category: CATEGORY.EXCEPTION,
    reason: "setjmp frame stack pop.",
    migration: MIGRATION.EXCEPTION,
    next: NEXT.EXCEPTION,
  },
  topaz_throw: {
    category: CATEGORY.EXCEPTION,
    reason: "longjmp exception dispatch substrate.",
    migration: MIGRATION.EXCEPTION,
    next: NEXT.EXCEPTION,
  },
  topaz_panic: {
    category: CATEGORY.EXCEPTION,
    reason: "internal runtime prelude abort diagnostic substrate.",
    migration: MIGRATION.EXCEPTION,
    next: NEXT.EXCEPTION,
  },
};

function extractSymbols(source) {
  const discovered = new Map();
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("##")) continue;

    const macro = line.match(/^\s*#\s*define\s+((?:TOPAZ_[A-Za-z0-9_]+|topaz_opt_[A-Za-z0-9_]+))\b/);
    if (macro) {
      discovered.set(macro[1], { kind: "macro", line: i + 1 });
      continue;
    }

    const helper = line.match(
      /^\s*static(?:\s+inline)?\s+[A-Za-z_][A-Za-z0-9_\s]*\s+\*?\s*(topaz_[A-Za-z0-9_]+)\s*\(/,
    );
    if (helper) {
      discovered.set(helper[1], { kind: "helper", line: i + 1 });
    }
  }
  return discovered;
}

function validateInventory() {
  const invalid = [];
  for (const [name, entry] of Object.entries(inventory)) {
    if (!entry.category || !entry.reason || !entry.migration || !entry.next) {
      invalid.push(name);
    }
  }
  return invalid;
}

function validateClosedMigrationLanes(discovered) {
  const closed = new Set(CLOSED_MIGRATION_LANES);
  return [...discovered.keys()]
    .filter((name) => closed.has(inventory[name]?.migration))
    .map((name) => {
      const lane = inventory[name].migration;
      return { name, lane, next: CLOSED_MIGRATION_LANE_GUIDANCE.get(lane) ?? inventory[name].next };
    })
    .sort((a, b) => a.lane.localeCompare(b.lane) || a.name.localeCompare(b.name));
}

let source;
try {
  source = fs.readFileSync(runtimePath, "utf8");
} catch (err) {
  console.error(`runtime substrate inventory: could not read ${runtimePath}`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const invalidInventory = validateInventory();
if (invalidInventory.length > 0) {
  console.error("runtime substrate inventory has entries without category/reason/migration/next:");
  for (const name of invalidInventory.sort()) {
    console.error(`  ${name}`);
  }
  process.exit(1);
}

const discovered = extractSymbols(source);
const unclassified = [...discovered.entries()]
  .filter(([name]) => inventory[name] === undefined)
  .sort(([a], [b]) => a.localeCompare(b));
const stale = Object.keys(inventory)
  .filter((name) => !discovered.has(name) && !inventory[name].exempt)
  .sort();
const closedLaneViolations = validateClosedMigrationLanes(discovered);

if (unclassified.length > 0 || stale.length > 0 || closedLaneViolations.length > 0) {
  if (unclassified.length > 0) {
    console.error("runtime substrate inventory: unclassified discovered symbols:");
    for (const [name, meta] of unclassified) {
      console.error(`  ${name} (${meta.kind}, ${runtimePath}:${meta.line})`);
    }
  }
  if (stale.length > 0) {
    console.error("runtime substrate inventory: stale classified symbols:");
    for (const name of stale) {
      console.error(`  ${name}`);
    }
  }
  if (closedLaneViolations.length > 0) {
    console.error("runtime substrate inventory: closed migration lane symbols:");
    for (const { name, lane, next } of closedLaneViolations) {
      console.error(`  ${lane}: ${name} - ${next}`);
    }
  }
  process.exit(1);
}

const categoryCounts = new Map();
const migrationCounts = new Map();
for (const name of discovered.keys()) {
  const { category, migration } = inventory[name];
  categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  migrationCounts.set(migration, (migrationCounts.get(migration) ?? 0) + 1);
}

console.log(`runtime substrate inventory ok: ${discovered.size} symbols classified`);
for (const [category, count] of [...categoryCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${category}: ${count}`);
}
console.log("migration lanes:");
for (const [migration, count] of [...migrationCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${migration}: ${count}`);
}
console.log("closed migration lanes:");
for (const lane of [...CLOSED_MIGRATION_LANES].sort()) {
  console.log(`  ${lane}: closed`);
}

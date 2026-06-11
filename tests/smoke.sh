#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm run build > /dev/null
pnpm run check:runtime-header > /dev/null
echo "PASS [runtime_header_fresh]"
pnpm run check:runtime-prelude > /dev/null
echo "PASS [runtime_prelude_fresh]"
builtin_effect_out=$(pnpm run check:builtin-effects)
if [[ "${builtin_effect_out}" != *"builtin effect inventory ok"* ]]; then
  echo "FAIL [builtin_effect_inventory]: missing ok summary" >&2
  printf '%s\n' "${builtin_effect_out}" | sed 's/^/    /' >&2
  exit 1
fi
for effect in fs.read fs.metadata fs.write process.argv process.exit io.stdout io.stderr process.spawn; do
  if [[ "${builtin_effect_out}" != *"  ${effect}: "* ]]; then
    echo "FAIL [builtin_effect_inventory]: missing effect vocabulary entry ${effect}" >&2
    printf '%s\n' "${builtin_effect_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
for status in public compat synthetic_compat; do
  if [[ "${builtin_effect_out}" != *"  ${status}: "* ]]; then
    echo "FAIL [builtin_effect_inventory]: missing status summary ${status}" >&2
    printf '%s\n' "${builtin_effect_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
mkdir -p build
tmp_builtin_effects="build/builtin_effect_unknown_probe.mjs"
printf '%s\n' \
  'export function builtinDescriptors() {' \
  '  return [' \
  '    {' \
  '      kind: "import",' \
  '      specifier: "std/fs",' \
  '      importedName: "readFileSync",' \
  '      semanticName: "fs.readFileSync",' \
  '      status: "public",' \
  '      effects: ["fs.delete"],' \
  '      explanation: "probe descriptor"' \
  '    }' \
  '  ];' \
  '}' > "${tmp_builtin_effects}"
if builtin_effect_err=$(node scripts/check-builtin-effects.mjs "${tmp_builtin_effects}" 2>&1); then
  echo "FAIL [builtin_effect_inventory]: expected unknown effect failure" >&2
  exit 1
fi
if [[ "${builtin_effect_err}" != *"unknown effect 'fs.delete'"* ]]; then
  echo "FAIL [builtin_effect_inventory]: missing unknown effect diagnostic" >&2
  printf '%s\n' "${builtin_effect_err}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [builtin_effect_inventory]"
effect_provenance_out=$(pnpm run check:effect-provenance)
if [[ "${effect_provenance_out}" != *"effect provenance ok:"* ]]; then
  echo "FAIL [effect_provenance]: missing ok summary" >&2
  printf '%s\n' "${effect_provenance_out}" | sed 's/^/    /' >&2
  exit 1
fi
for effect in fs.read fs.write process.argv io.stdout io.stderr; do
  if [[ "${effect_provenance_out}" != *" | ${effect} | "* ]]; then
    echo "FAIL [effect_provenance]: missing effect ${effect}" >&2
    printf '%s\n' "${effect_provenance_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
if [[ "${effect_provenance_out}" != *"console.warn(...)"* ]]; then
  echo "FAIL [effect_provenance]: missing console.warn detail" >&2
  printf '%s\n' "${effect_provenance_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${effect_provenance_out}" == *"path.join"* ]]; then
  echo "FAIL [effect_provenance]: pure std/path leaked into provenance" >&2
  printf '%s\n' "${effect_provenance_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [effect_provenance]"
effect_report_out=$(pnpm run check:effect-report)
if [[ "${effect_report_out}" != *"effect report ok:"* ]]; then
  echo "FAIL [effect_report]: missing ok summary" >&2
  printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${effect_report_out}" != *"topaz builtin effect report: build/effect_report/main.ts"* ]]; then
  echo "FAIL [effect_report]: missing stable heading" >&2
  printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
for effect in fs.read fs.write process.argv io.stdout io.stderr; do
  if [[ "${effect_report_out}" != *"  ${effect}: "* ]]; then
    echo "FAIL [effect_report]: missing effect summary ${effect}" >&2
    printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
if [[ "${effect_report_out}" != *"console.warn(...)"* ]]; then
  echo "FAIL [effect_report]: missing console.warn detail" >&2
  printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${effect_report_out}" != *$'effects: none\nrequirements: none'* ]]; then
  echo "FAIL [effect_report]: missing no-effect report" >&2
  printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${effect_report_out}" == *"path.join"* || "${effect_report_out}" == *"std/path"* || "${effect_report_out}" == *"join(...)"* ]]; then
  echo "FAIL [effect_report]: pure std/path leaked into report" >&2
  printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [effect_report]"
manifest_requirements_out=$(pnpm run check:manifest-requirements)
if [[ "${manifest_requirements_out}" != *"manifest requirements ok:"* ]]; then
  echo "FAIL [manifest_requirements]: missing ok summary" >&2
  printf '%s\n' "${manifest_requirements_out}" | sed 's/^/    /' >&2
  exit 1
fi
for effect in fs.read fs.write process.argv io.stdout io.stderr; do
  if [[ "${manifest_requirements_out}" != *"  ${effect}: "* ]]; then
    echo "FAIL [manifest_requirements]: missing effect group ${effect}" >&2
    printf '%s\n' "${manifest_requirements_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
if [[ "${manifest_requirements_out}" != *"build/manifest_requirements/main.ts:6:14"* ]]; then
  echo "FAIL [manifest_requirements]: missing file:line:col occurrence" >&2
  printf '%s\n' "${manifest_requirements_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_requirements_out}" != *"empty requirements: none"* ]]; then
  echo "FAIL [manifest_requirements]: missing empty requirement summary" >&2
  printf '%s\n' "${manifest_requirements_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_requirements_out}" == *"path.join"* || "${manifest_requirements_out}" == *"std/path"* || "${manifest_requirements_out}" == *"join(...)"* ]]; then
  echo "FAIL [manifest_requirements]: pure std/path leaked into requirements" >&2
  printf '%s\n' "${manifest_requirements_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [manifest_requirements]"
manifest_policy_out=$(pnpm run check:manifest-policy)
if [[ "${manifest_policy_out}" != *"manifest policy ok:"* ]]; then
  echo "FAIL [manifest_policy]: missing ok summary" >&2
  printf '%s\n' "${manifest_policy_out}" | sed 's/^/    /' >&2
  exit 1
fi
for required in "filename: strict-ts.json" "valid capabilities: fs.read, io.stdout" "empty capabilities: none" "unknown diagnostic: unknown capability 'fs.delete'" "duplicate diagnostic: duplicate capability 'fs.read'"; do
  if [[ "${manifest_policy_out}" != *"${required}"* ]]; then
    echo "FAIL [manifest_policy]: missing ${required}" >&2
    printf '%s\n' "${manifest_policy_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [manifest_policy]"
manifest_policy_parse_out=$(pnpm run check:manifest-policy-parse)
if [[ "${manifest_policy_parse_out}" != *"manifest policy parse ok:"* ]]; then
  echo "FAIL [manifest_policy_parse]: missing ok summary" >&2
  printf '%s\n' "${manifest_policy_parse_out}" | sed 's/^/    /' >&2
  exit 1
fi
for required in "valid capabilities: fs.read, io.stdout" "empty object: none" "extra keys ignored: fs.read" "invalid syntax diagnostic: expected string" "non-array diagnostic: 'capabilities' must be an array" "non-string diagnostic: 'capabilities' entries must be strings" "duplicate key diagnostic: duplicate top-level key 'capabilities'" "invalid number diagnostic: invalid number" "unknown diagnostic: unknown capability 'fs.delete'" "duplicate diagnostic: duplicate capability 'fs.read'"; do
  if [[ "${manifest_policy_parse_out}" != *"${required}"* ]]; then
    echo "FAIL [manifest_policy_parse]: missing ${required}" >&2
    printf '%s\n' "${manifest_policy_parse_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [manifest_policy_parse]"
manifest_policy_load_out=$(pnpm run check:manifest-policy-load)
if [[ "${manifest_policy_load_out}" != *"manifest policy load ok:"* ]]; then
  echo "FAIL [manifest_policy_load]: missing ok summary" >&2
  printf '%s\n' "${manifest_policy_load_out}" | sed 's/^/    /' >&2
  exit 1
fi
for required in "missing file: found=false" "valid capability file: fs.read, io.stdout" "non-object diagnostic: top-level value must be an object" "unknown diagnostic: unknown capability 'fs.delete'" "duplicate key diagnostic: duplicate top-level key 'capabilities'"; do
  if [[ "${manifest_policy_load_out}" != *"${required}"* ]]; then
    echo "FAIL [manifest_policy_load]: missing ${required}" >&2
    printf '%s\n' "${manifest_policy_load_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [manifest_policy_load]"
manifest_check_out=$(pnpm run check:manifest-check)
if [[ "${manifest_check_out}" != *"manifest check ok:"* ]]; then
  echo "FAIL [manifest_check]: missing ok summary" >&2
  printf '%s\n' "${manifest_check_out}" | sed 's/^/    /' >&2
  exit 1
fi
for required in "pure missing policy: ok" "effectful missing policy: failed" "full policy: ok" "partial policy: missing fs.write" "invalid diagnostic: top-level value must be an object" "unknown diagnostic: unknown capability 'fs.delete'"; do
  if [[ "${manifest_check_out}" != *"${required}"* ]]; then
    echo "FAIL [manifest_check]: missing ${required}" >&2
    printf '%s\n' "${manifest_check_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [manifest_check]"
manifest_generate_out=$(pnpm run check:manifest-generate)
if [[ "${manifest_generate_out}" != *"manifest generate ok:"* ]]; then
  echo "FAIL [manifest_generate]: missing ok summary" >&2
  printf '%s\n' "${manifest_generate_out}" | sed 's/^/    /' >&2
  exit 1
fi
for required in "pure capabilities: none" "effectful capabilities: fs.read, fs.write, io.stdout" "duplicate fs.read occurrences: 3" "round-trip capabilities: fs.read, fs.write, io.stdout"; do
  if [[ "${manifest_generate_out}" != *"${required}"* ]]; then
    echo "FAIL [manifest_generate]: missing ${required}" >&2
    printf '%s\n' "${manifest_generate_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [manifest_generate]"
doctor_report_out=$(pnpm run check:doctor-report)
if [[ "${doctor_report_out}" != *"doctor report ok:"* ]]; then
  echo "FAIL [doctor_report]: missing ok summary" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_report_out}" != *"topaz doctor report: build/doctor_report/main.ts"* ]]; then
  echo "FAIL [doctor_report]: missing stable heading" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
for effect in fs.read fs.write process.argv io.stdout io.stderr; do
  if [[ "${doctor_report_out}" != *"  ${effect}: "* ]]; then
    echo "FAIL [doctor_report]: missing capability summary ${effect}" >&2
    printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
if [[ "${doctor_report_out}" != *"build/doctor_report/main.ts:6:14"* ]]; then
  echo "FAIL [doctor_report]: missing file:line:col occurrence" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_report_out}" != *"console.warn(...)"* ]]; then
  echo "FAIL [doctor_report]: missing console.warn detail" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_report_out}" != *$'capabilities: none\nrequirements: none'* ]]; then
  echo "FAIL [doctor_report]: missing no-effect report" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_report_out}" == *"path.join"* || "${doctor_report_out}" == *"std/path"* || "${doctor_report_out}" == *"join(...)"* ]]; then
  echo "FAIL [doctor_report]: pure std/path leaked into report" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [doctor_report]"
doctor_selfhost_out=$(pnpm run check:doctor-selfhost)
if [[ "${doctor_selfhost_out}" != *"doctor selfhost ok:"* ]]; then
  echo "FAIL [doctor_selfhost]: missing ok summary" >&2
  printf '%s\n' "${doctor_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_selfhost_out}" != *"src/doctor_report.ts"* ]]; then
  echo "FAIL [doctor_selfhost]: missing doctor report target" >&2
  printf '%s\n' "${doctor_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_selfhost_out}" != *"literal union source/status template blocker cleared"* ]]; then
  echo "FAIL [doctor_selfhost]: missing former literal-union blocker text" >&2
  printf '%s\n' "${doctor_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [doctor_selfhost]"
mkdir -p build/capability_explain_selfhost
if ! capability_explain_selfhost_err=$(node dist/cli.js src/capability_explain.ts --emit-c-only -o build/capability_explain_selfhost/capability_explain 2>&1); then
  echo "FAIL [capability_explain_selfhost]: expected capability explain C emission" >&2
  printf '%s\n' "${capability_explain_selfhost_err}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ ! -f build/capability_explain_selfhost/capability_explain.c ]]; then
  echo "FAIL [capability_explain_selfhost]: missing emitted C" >&2
  exit 1
fi
cc -O2 -Iruntime -Wall -Wextra -c build/capability_explain_selfhost/capability_explain.c -o build/capability_explain_selfhost/capability_explain.o
echo "PASS [capability_explain_selfhost] literal-union descriptor status template blocker cleared"
manifest_selfhost_out=$(pnpm run check:manifest-selfhost)
if [[ "${manifest_selfhost_out}" != *"manifest selfhost ok:"* ]]; then
  echo "FAIL [manifest_selfhost]: missing ok summary" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"src/manifest_requirements.ts"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest requirements target" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"src/manifest_policy.ts"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest policy target" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"src/manifest_check.ts"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest check target" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"src/manifest_generate.ts"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest generate target" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"Map<string, Array"* ]]; then
  echo "FAIL [manifest_selfhost]: missing former Map<string, Array blocker text" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"capability policy array validator + text parser + file loader"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest policy selfhost text" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"strict-ts policy coverage evaluator"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest check selfhost text" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"strict-ts manifest suggestion renderer"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest generate selfhost text" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [manifest_selfhost]"
effect_selfhost_out=$(pnpm run check:effect-selfhost)
if [[ "${effect_selfhost_out}" != *"effect selfhost ok:"* ]]; then
  echo "FAIL [effect_selfhost]: missing ok summary" >&2
  printf '%s\n' "${effect_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
for target in src/effect_provenance.ts src/effect_report.ts; do
  if [[ "${effect_selfhost_out}" != *"${target}"* ]]; then
    echo "FAIL [effect_selfhost]: missing target ${target}" >&2
    printf '%s\n' "${effect_selfhost_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
for former_blocker in "unknown template escape" "default import from stdlib specifier 'node:path'"; do
  if [[ "${effect_selfhost_out}" != *"${former_blocker}"* ]]; then
    echo "FAIL [effect_selfhost]: missing former blocker ${former_blocker}" >&2
    printf '%s\n' "${effect_selfhost_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [effect_selfhost]"
cli_selfhost_out=$(pnpm run check:cli-selfhost)
if [[ "${cli_selfhost_out}" != *"cli selfhost ok:"* ]]; then
  echo "FAIL [cli_selfhost]: missing ok summary" >&2
  printf '%s\n' "${cli_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${cli_selfhost_out}" != *"src/cli.ts"* ]]; then
  echo "FAIL [cli_selfhost]: missing CLI target" >&2
  printf '%s\n' "${cli_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${cli_selfhost_out}" != *"src/cli.ts -> build/cli_selfhost/topaz"* ]]; then
  echo "FAIL [cli_selfhost]: missing generated CLI summary" >&2
  printf '%s\n' "${cli_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${cli_selfhost_out}" != *"examples/fib.ts -> build/cli_selfhost/fib"* ]]; then
  echo "FAIL [cli_selfhost]: missing generated fib summary" >&2
  printf '%s\n' "${cli_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [cli_selfhost]"
release_workflow=".github/workflows/release-artifact.yml"
if ! grep -Fq 'release_flags=(--draft)' "${release_workflow}"; then
  echo "FAIL [release_workflow_prerelease]: missing draft release flag baseline" >&2
  exit 1
fi
if ! grep -Fq 'if [[ "${tag}" == *"-rc."* ]]; then' "${release_workflow}"; then
  echo "FAIL [release_workflow_prerelease]: missing RC tag prerelease branch" >&2
  exit 1
fi
if ! grep -Fq 'release_flags+=(--prerelease)' "${release_workflow}"; then
  echo "FAIL [release_workflow_prerelease]: missing RC prerelease flag" >&2
  exit 1
fi
if ! grep -Fq '"${release_flags[@]}"' "${release_workflow}"; then
  echo "FAIL [release_workflow_prerelease]: release creation does not use computed flags" >&2
  exit 1
fi
echo "PASS [release_workflow_prerelease]"
release_script="scripts/build-release.sh"
for fragment in \
  'RELEASE [smoke ${artifact} guidance]' \
  'release_guidance_smoke' \
  'topaz doctor <entry.ts>' \
  'topaz check <entry.ts>' \
  'topaz manifest init <entry.ts>' \
  'topaz explain capability <name>' \
  'topaz explain std/<module>' \
  'doctor "${guidance_entry}"' \
  'check "${guidance_entry}"' \
  'manifest init "${guidance_entry}"' \
  'release_guidance_manifest_init' \
  'policy_before=$(cat "${guidance_policy}")' \
  'manifest init changed existing policy fixture' \
  '"capabilities"' \
  '"fs.read"' \
  '"fs.write"' \
  '"io.stdout"' \
  'explain capability fs.read' \
  'explain std/fs' \
  'status: ok'; do
  if ! grep -Fq "${fragment}" "${release_script}"; then
    echo "FAIL [release_guidance_smoke_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
echo "PASS [release_guidance_smoke_contract]"
substrate_out=$(pnpm run check:runtime-substrate)
if [[ "${substrate_out}" != *"migration lanes:"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing migration lane summary" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"closed migration lanes:"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing closed migration lane summary" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"needs-string-buffer-intrinsics: closed"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: string buffer migration lane is not closed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"needs-bigint-limb-intrinsics: closed"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: bigint migration lane is not closed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"raw-memory-boundary: 3"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: raw memory substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"libc-libm-boundary: 3"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: libc/libm number substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"host-abi-boundary: 12"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: host ABI substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"container-monomorph-boundary: 13"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: container monomorph substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"exception-boundary: 4"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: exception substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"c-abi-type-boundary: 8"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: C ABI type substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"bigint-limb-intrinsic-family: 8"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: active bigint intrinsic-family lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"string-buffer-intrinsic-family: 5"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: active string buffer intrinsic-family lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
mkdir -p build
tmp_runtime_substrate="build/runtime_substrate_probe.h"
cp runtime/runtime.h "${tmp_runtime_substrate}"
printf '\nstatic inline topaz_number topaz_unclassified_probe(void) { return 0; }\n' >> "${tmp_runtime_substrate}"
if substrate_err=$(node scripts/check-runtime-substrate.mjs "${tmp_runtime_substrate}" 2>&1); then
  echo "FAIL [runtime_substrate_inventory]: expected unclassified helper failure" >&2
  exit 1
fi
if [[ "${substrate_err}" != *"topaz_unclassified_probe"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing unclassified helper name" >&2
  printf '%s\n' "${substrate_err}" | sed 's/^/    /' >&2
  exit 1
fi
tmp_runtime_substrate_checker="build/runtime_substrate_closed_lane_probe.mjs"
cp scripts/check-runtime-substrate.mjs "${tmp_runtime_substrate_checker}"
perl -0pi -e 's/migration: MIGRATION\.C_ABI_TYPE,/migration: MIGRATION.STRING_BUFFER_INTRINSICS,/' "${tmp_runtime_substrate_checker}"
if closed_lane_err=$(node "${tmp_runtime_substrate_checker}" runtime/runtime.h 2>&1); then
  echo "FAIL [runtime_substrate_inventory]: expected closed migration lane failure" >&2
  exit 1
fi
if [[ "${closed_lane_err}" != *"needs-string-buffer-intrinsics: TOPAZ_RUNTIME_H"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing closed lane diagnostic" >&2
  printf '%s\n' "${closed_lane_err}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${closed_lane_err}" != *"Closed after the completed StringBuffer prelude migration"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing string buffer closed lane guidance" >&2
  printf '%s\n' "${closed_lane_err}" | sed 's/^/    /' >&2
  exit 1
fi
tmp_runtime_substrate_checker="build/runtime_substrate_closed_bigint_lane_probe.mjs"
cp scripts/check-runtime-substrate.mjs "${tmp_runtime_substrate_checker}"
perl -0pi -e 's/migration: MIGRATION\.C_ABI_TYPE,/migration: MIGRATION.BIGINT_LIMB_INTRINSICS,/' "${tmp_runtime_substrate_checker}"
if closed_lane_err=$(node "${tmp_runtime_substrate_checker}" runtime/runtime.h 2>&1); then
  echo "FAIL [runtime_substrate_inventory]: expected closed BigInt migration lane failure" >&2
  exit 1
fi
if [[ "${closed_lane_err}" != *"needs-bigint-limb-intrinsics: TOPAZ_RUNTIME_H"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing closed BigInt lane diagnostic" >&2
  printf '%s\n' "${closed_lane_err}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${closed_lane_err}" != *"Closed after the completed BigInt prelude migration"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing BigInt closed lane guidance" >&2
  printf '%s\n' "${closed_lane_err}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${closed_lane_err}" == *"Needs explicit bigint limb storage and arithmetic intrinsics"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: stale BigInt closed lane guidance leaked" >&2
  printf '%s\n' "${closed_lane_err}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [runtime_substrate_inventory]"

# Phase 1.5-6e: topaz_parser を oracle (tsc + convertFromTsc) と JSON 等価比較。
# 全 example が一致しないと codegen 側のテストを走らせる意味が無いのでここで止める。
node dist/parser_check.js examples/*.ts > build/parser_check.log 2>&1 || {
  echo "FAIL [parser_check]: topaz_parser diverged from oracle" >&2
  cat build/parser_check.log >&2
  exit 1
}
echo "PASS [parser_check]"

run_case() {
  local name="$1"
  local expected="$2"
  node dist/cli.js "examples/$name.ts" -o "build/$name" > /dev/null
  local out
  out=$(./build/$name)
  if [[ "$out" != "$expected" ]]; then
    echo "FAIL [$name]:" >&2
    echo "  expected:" >&2
    printf '%s\n' "$expected" | sed 's/^/    /' >&2
    echo "  got:" >&2
    printf '%s\n' "$out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$name]"
}

# Phase 1.5-2: multi-module ケースは root を指定 (loader が依存を解決)。
# label と root path を分けて受ける。
run_module_case() {
  local label="$1"
  local root="$2"
  local expected="$3"
  node dist/cli.js "$root" -o "build/$label" > /dev/null
  local out
  out=$(./build/$label)
  if [[ "$out" != "$expected" ]]; then
    echo "FAIL [$label]:" >&2
    echo "  expected:" >&2
    printf '%s\n' "$expected" | sed 's/^/    /' >&2
    echo "  got:" >&2
    printf '%s\n' "$out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$label]"
}

# Phase 1.5-2: コンパイル時にエラーで落ちることを期待するケース。
# 標準エラー出力に `expected_substring` が含まれていることをチェック。
run_fail_case() {
  local label="$1"
  local root="$2"
  local expected_substring="$3"
  local err
  if err=$(node dist/cli.js "$root" -o "build/$label" 2>&1); then
    echo "FAIL [$label]: expected compile error, got success" >&2
    echo "  stdout:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$err" != *"$expected_substring"* ]]; then
    echo "FAIL [$label]: error did not contain expected substring" >&2
    echo "  expected substring: $expected_substring" >&2
    echo "  got:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$label]"
}

run_tsc_bridge_fail_case() {
  local label="$1"
  local root="$2"
  local expected_substring="$3"
  local err
  if err=$(node --input-type=module -e '
import { parseFile } from "./dist/parser.js";
import { convertFromTsc } from "./dist/convert_from_tsc.js";

const file = process.argv[1];
try {
  convertFromTsc(parseFile(file));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
' "$root" 2>&1); then
    echo "FAIL [$label]: expected tsc-bridge convert error, got success" >&2
    exit 1
  fi
  if [[ "$err" != *"$expected_substring"* ]]; then
    echo "FAIL [$label]: error did not contain expected substring" >&2
    echo "  expected substring: $expected_substring" >&2
    echo "  got:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$label]"
}

# Phase 1.5-6 prep: assert the emitted C compiles clean under `-Wall -Wextra`.
# The self-hosting pass criterion requires warning-free emission; this gate
# defends specific constructs (e.g. equality conditions, which used to emit
# `if ((a == b))` and trip -Wparentheses-equality) against regressions.
run_cc_warnfree_case() {
  local name="$1"
  node dist/cli.js "examples/$name.ts" --emit-c-only -o "build/$name" > /dev/null
  local warn
  warn=$(cc -O2 -Iruntime -Wall -Wextra -c "build/$name.c" -o "build/$name.o" 2>&1)
  if [[ -n "$warn" ]]; then
    echo "FAIL [$name cc-warnfree]: emitted C is not warning-free under -Wall -Wextra" >&2
    printf '%s\n' "$warn" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$name cc-warnfree]"
}

assert_no_byte_code_string_substrate() {
  local file="$1"
  local label="$2"
  if grep -Eq "static inline topaz_string topaz_string_from_byte_codes\s*\(" "$file"; then
    echo "FAIL [$label]: stale byte-code string helper definition embedded" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" "$file"; then
    echo "FAIL [$label]: stale byte-code string helper call emitted" >&2
    exit 1
  fi
}

run_cli_fail_case() {
  local label="$1"
  local expected_substring="$2"
  shift 2
  local err
  if err=$(node dist/cli.js "$@" 2>&1); then
    echo "FAIL [$label]: expected CLI error, got success" >&2
    echo "  stdout:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$err" != *"$expected_substring"* ]]; then
    echo "FAIL [$label]: error did not contain expected substring" >&2
    echo "  expected substring: $expected_substring" >&2
    echo "  got:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$label]"
}

run_cli_smoke() {
  local help
  help=$(node dist/cli.js --help)
  if [[ "$help" != *"usage: topaz <input.ts>"* ]]; then
    echo "FAIL [cli_help]: missing usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"--emit-c-only"* ]]; then
    echo "FAIL [cli_help]: missing --emit-c-only" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"topaz doctor <entry.ts>"* ]]; then
    echo "FAIL [cli_help]: missing doctor usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"topaz check <entry.ts>"* ]]; then
    echo "FAIL [cli_help]: missing check usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"topaz manifest init <entry.ts>"* ]]; then
    echo "FAIL [cli_help]: missing manifest init usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"topaz explain capability <name>"* ]]; then
    echo "FAIL [cli_help]: missing explain capability usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"topaz explain std/<module>"* ]]; then
    echo "FAIL [cli_help]: missing explain std module usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"--parse-only"*"unsupported/reserved"* ]]; then
    echo "FAIL [cli_help]: --parse-only is not described as unsupported/reserved" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" == *"dump AST as JSON"* ]]; then
    echo "FAIL [cli_help]: --parse-only still promises a JSON AST dump" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_help]"

  local doctor_entry
  doctor_entry="$(pwd)/build/doctor_report/main.ts"
  local doctor_cli_out
  doctor_cli_out=$(node dist/cli.js doctor build/doctor_report/main.ts)
  if [[ "$doctor_cli_out" != *"topaz doctor report: ${doctor_entry}"* ]]; then
    echo "FAIL [cli_doctor_report]: missing public doctor heading" >&2
    printf '%s\n' "$doctor_cli_out" | sed 's/^/    /' >&2
    exit 1
  fi
  for effect in fs.read fs.write process.argv io.stdout io.stderr; do
    if [[ "$doctor_cli_out" != *"  ${effect}: "* ]]; then
      echo "FAIL [cli_doctor_report]: missing capability summary ${effect}" >&2
      printf '%s\n' "$doctor_cli_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  if [[ "$doctor_cli_out" != *"${doctor_entry}:6:14"* ]]; then
    echo "FAIL [cli_doctor_report]: missing file:line:col occurrence" >&2
    printf '%s\n' "$doctor_cli_out" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$doctor_cli_out" != *"console.warn(...)"* ]]; then
    echo "FAIL [cli_doctor_report]: missing console.warn detail" >&2
    printf '%s\n' "$doctor_cli_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_doctor_report]"

  local pure_doctor_entry
  pure_doctor_entry="$(pwd)/build/doctor_report/pure.ts"
  local pure_doctor_cli_out
  pure_doctor_cli_out=$(node dist/cli.js doctor build/doctor_report/pure.ts)
  if [[ "$pure_doctor_cli_out" != $'topaz doctor report: '"${pure_doctor_entry}"$'\ncapabilities: none\nrequirements: none' ]]; then
    echo "FAIL [cli_doctor_pure]: missing empty doctor report contract" >&2
    printf '%s\n' "$pure_doctor_cli_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_doctor_pure]"

  run_cli_fail_case cli_doctor_emit_c_flag "topaz: doctor does not accept compile option --emit-c-only" doctor --emit-c-only build/doctor_report/main.ts
  run_cli_fail_case cli_doctor_output_flag "topaz: doctor does not accept compile option -o" doctor build/doctor_report/main.ts -o build/doctor_report/out

  mkdir -p build/manifest_cli_check/pure_missing
  mkdir -p build/manifest_cli_check/effectful_missing
  mkdir -p build/manifest_cli_check/full_policy
  mkdir -p build/manifest_cli_check/partial_policy
  mkdir -p build/manifest_cli_check/invalid_policy
  printf '%s\n' \
    'import { join } from "std/path";' \
    '' \
    'const out = join("build", "pure.txt");' \
    'out;' \
    > build/manifest_cli_check/pure_missing/pure.ts
  printf '%s\n' \
    'import { readFileSync, writeFileSync } from "std/fs";' \
    '' \
    'const data = readFileSync("input.txt", "utf8");' \
    'writeFileSync("build/manifest_cli_check/out.txt", data);' \
    'console.log(data);' \
    > build/manifest_cli_check/effectful_missing/main.ts
  printf '%s\n' \
    'import { readFileSync, writeFileSync } from "std/fs";' \
    '' \
    'const data = readFileSync("input.txt", "utf8");' \
    'writeFileSync("build/manifest_cli_check/out.txt", data);' \
    'console.log(data);' \
    > build/manifest_cli_check/full_policy/main.ts
  printf '%s\n' '{ "capabilities": ["fs.read", "fs.write", "io.stdout"] }' > build/manifest_cli_check/full_policy/strict-ts.json
  printf '%s\n' \
    'import { readFileSync, writeFileSync } from "std/fs";' \
    '' \
    'const data = readFileSync("input.txt", "utf8");' \
    'writeFileSync("build/manifest_cli_check/out.txt", data);' \
    'console.log(data);' \
    > build/manifest_cli_check/partial_policy/main.ts
  printf '%s\n' '{ "capabilities": ["fs.read", "io.stdout"] }' > build/manifest_cli_check/partial_policy/strict-ts.json
  printf '%s\n' \
    'import { readFileSync } from "std/fs";' \
    '' \
    'const data = readFileSync("input.txt", "utf8");' \
    'console.log(data);' \
    > build/manifest_cli_check/invalid_policy/main.ts
  printf '%s\n' '[]' > build/manifest_cli_check/invalid_policy/strict-ts.json

  local cli_check_pure_entry
  cli_check_pure_entry="$(pwd)/build/manifest_cli_check/pure_missing/pure.ts"
  local cli_check_pure_policy
  cli_check_pure_policy="$(pwd)/build/manifest_cli_check/pure_missing/strict-ts.json"
  local cli_check_pure_out
  cli_check_pure_out=$(node dist/cli.js check build/manifest_cli_check/pure_missing/pure.ts)
  for required in "topaz check report: ${cli_check_pure_entry}" "policy: ${cli_check_pure_policy} (missing)" "missing capabilities: none" "status: ok"; do
    if [[ "$cli_check_pure_out" != *"$required"* ]]; then
      echo "FAIL [cli_check_pure_missing_policy]: missing ${required}" >&2
      printf '%s\n' "$cli_check_pure_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_check_pure_missing_policy]"

  local cli_check_effectful_out
  if cli_check_effectful_out=$(node dist/cli.js check build/manifest_cli_check/effectful_missing/main.ts 2>&1); then
    echo "FAIL [cli_check_effectful_missing_policy]: expected failed status" >&2
    printf '%s\n' "$cli_check_effectful_out" | sed 's/^/    /' >&2
    exit 1
  fi
  for required in "policy: $(pwd)/build/manifest_cli_check/effectful_missing/strict-ts.json (missing)" "  fs.read: " "  fs.write: " "  io.stdout: " "status: failed"; do
    if [[ "$cli_check_effectful_out" != *"$required"* ]]; then
      echo "FAIL [cli_check_effectful_missing_policy]: missing ${required}" >&2
      printf '%s\n' "$cli_check_effectful_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_check_effectful_missing_policy]"

  local cli_check_full_out
  cli_check_full_out=$(node dist/cli.js check build/manifest_cli_check/full_policy/main.ts)
  for required in "policy: $(pwd)/build/manifest_cli_check/full_policy/strict-ts.json (found)" "missing capabilities: none" "status: ok"; do
    if [[ "$cli_check_full_out" != *"$required"* ]]; then
      echo "FAIL [cli_check_full_policy]: missing ${required}" >&2
      printf '%s\n' "$cli_check_full_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_check_full_policy]"

  local cli_check_partial_out
  if cli_check_partial_out=$(node dist/cli.js check build/manifest_cli_check/partial_policy/main.ts 2>&1); then
    echo "FAIL [cli_check_partial_policy]: expected failed status" >&2
    printf '%s\n' "$cli_check_partial_out" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$cli_check_partial_out" != *"  fs.write: "* || "$cli_check_partial_out" != *"status: failed"* ]]; then
    echo "FAIL [cli_check_partial_policy]: missing ungranted fs.write failure" >&2
    printf '%s\n' "$cli_check_partial_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_check_partial_policy]"

  local cli_check_invalid_out
  if cli_check_invalid_out=$(node dist/cli.js check build/manifest_cli_check/invalid_policy/main.ts 2>&1); then
    echo "FAIL [cli_check_invalid_policy]: expected failed status" >&2
    printf '%s\n' "$cli_check_invalid_out" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$cli_check_invalid_out" != *"top-level value must be an object"* || "$cli_check_invalid_out" != *"status: failed"* ]]; then
    echo "FAIL [cli_check_invalid_policy]: missing invalid policy diagnostic" >&2
    printf '%s\n' "$cli_check_invalid_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_check_invalid_policy]"

  run_cli_fail_case cli_check_missing_entry "topaz: check expects <entry.ts>" check
  run_cli_fail_case cli_check_emit_c_flag "topaz: check does not accept compile option --emit-c-only" check build/manifest_cli_check/effectful_missing/main.ts --emit-c-only
  run_cli_fail_case cli_check_output_flag "topaz: check does not accept compile option -o" check build/manifest_cli_check/effectful_missing/main.ts -o build/manifest_cli_check/out
  run_cli_fail_case cli_check_output_long_flag "topaz: check does not accept compile option --output" check build/manifest_cli_check/effectful_missing/main.ts --output build/manifest_cli_check/out
  run_cli_fail_case cli_check_lex_flag "topaz: check does not accept compile option --lex-only" check build/manifest_cli_check/effectful_missing/main.ts --lex-only
  run_cli_fail_case cli_check_parse_flag "topaz: check does not accept compile option --parse-only" check build/manifest_cli_check/effectful_missing/main.ts --parse-only
  run_cli_fail_case cli_check_unknown_option "topaz: check does not accept option --unknown" check build/manifest_cli_check/effectful_missing/main.ts --unknown
  run_cli_fail_case cli_check_extra_positional "topaz: unexpected positional argument other.ts" check build/manifest_cli_check/effectful_missing/main.ts other.ts

  local cli_manifest_effectful_expected
  cli_manifest_effectful_expected=$'{\n  "capabilities": [\n    "fs.read",\n    "fs.write",\n    "io.stdout"\n  ]\n}'
  local cli_manifest_effectful_out
  cli_manifest_effectful_out=$(node dist/cli.js manifest init build/manifest_cli_check/effectful_missing/main.ts)
  if [[ "$cli_manifest_effectful_out" != "$cli_manifest_effectful_expected" ]]; then
    echo "FAIL [cli_manifest_init_effectful]: manifest suggestion mismatch" >&2
    echo "  expected:" >&2
    printf '%s\n' "$cli_manifest_effectful_expected" | sed 's/^/    /' >&2
    echo "  got:" >&2
    printf '%s\n' "$cli_manifest_effectful_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_manifest_init_effectful]"

  local cli_manifest_pure_expected
  cli_manifest_pure_expected=$'{\n  "capabilities": []\n}'
  local cli_manifest_pure_out
  cli_manifest_pure_out=$(node dist/cli.js manifest init build/manifest_cli_check/pure_missing/pure.ts)
  if [[ "$cli_manifest_pure_out" != "$cli_manifest_pure_expected" ]]; then
    echo "FAIL [cli_manifest_init_pure]: manifest suggestion mismatch" >&2
    echo "  expected:" >&2
    printf '%s\n' "$cli_manifest_pure_expected" | sed 's/^/    /' >&2
    echo "  got:" >&2
    printf '%s\n' "$cli_manifest_pure_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_manifest_init_pure]"

  run_cli_fail_case cli_manifest_init_missing_subcommand "topaz: manifest expects init <entry.ts>" manifest
  run_cli_fail_case cli_manifest_init_compile_flag "topaz: manifest init does not accept compile option --emit-c-only" manifest init build/manifest_cli_check/effectful_missing/main.ts --emit-c-only

  local explain_fs_read_out
  explain_fs_read_out=$(node dist/cli.js explain capability fs.read)
  if [[ "$explain_fs_read_out" != *"topaz capability: fs.read"* ]]; then
    echo "FAIL [cli_explain_capability_fs_read]: missing heading" >&2
    printf '%s\n' "$explain_fs_read_out" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$explain_fs_read_out" != *"description: allows reading filesystem contents"* ]]; then
    echo "FAIL [cli_explain_capability_fs_read]: missing description" >&2
    printf '%s\n' "$explain_fs_read_out" | sed 's/^/    /' >&2
    exit 1
  fi
  for required in "std/fs.readFileSync" "node:fs.readFileSync" "semantic: fs.readFileSync" "status: public" "status: compat"; do
    if [[ "$explain_fs_read_out" != *"$required"* ]]; then
      echo "FAIL [cli_explain_capability_fs_read]: missing ${required}" >&2
      printf '%s\n' "$explain_fs_read_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_explain_capability_fs_read]"

  local explain_stderr_out
  explain_stderr_out=$(node dist/cli.js explain capability io.stderr)
  for required in "topaz capability: io.stderr" "std/process.writeStderr" "std/process.writeError" "synthetic console.error" "status: synthetic_compat"; do
    if [[ "$explain_stderr_out" != *"$required"* ]]; then
      echo "FAIL [cli_explain_capability_stderr]: missing ${required}" >&2
      printf '%s\n' "$explain_stderr_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_explain_capability_stderr]"

  run_cli_fail_case cli_explain_unknown "topaz: unknown capability path.resolve; known capabilities: fs.read, fs.metadata, fs.write, process.argv, process.exit, io.stdout, io.stderr, process.spawn" explain capability path.resolve
  run_cli_fail_case cli_explain_missing "topaz: explain capability expects <name>" explain capability
  run_cli_fail_case cli_explain_emit_c_flag "topaz: explain does not accept compile option --emit-c-only" explain capability fs.read --emit-c-only
  run_cli_fail_case cli_explain_output_flag "topaz: explain does not accept compile option -o" explain capability fs.read -o build/explain/out
  run_cli_fail_case cli_explain_lex_flag "topaz: explain does not accept compile option --lex-only" explain capability fs.read --lex-only
  run_cli_fail_case cli_explain_parse_flag "topaz: explain does not accept compile option --parse-only" explain capability fs.read --parse-only

  local explain_std_fs_out
  explain_std_fs_out=$(node dist/cli.js explain std/fs)
  for required in "topaz builtin module: std/fs" "readFileSync" "semantic: fs.readFileSync" "effects: fs.read" "status: public"; do
    if [[ "$explain_std_fs_out" != *"$required"* ]]; then
      echo "FAIL [cli_explain_std_fs]: missing ${required}" >&2
      printf '%s\n' "$explain_std_fs_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_explain_std_fs]"

  local explain_std_path_out
  explain_std_path_out=$(node dist/cli.js explain std/path)
  for required in "topaz builtin module: std/path" "join" "semantic: path.join" "effects: none" "status: public"; do
    if [[ "$explain_std_path_out" != *"$required"* ]]; then
      echo "FAIL [cli_explain_std_path]: missing ${required}" >&2
      printf '%s\n' "$explain_std_path_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_explain_std_path]"

  run_cli_fail_case cli_explain_std_unknown "topaz: unknown builtin module std/unknown; known module specifiers:" explain std/unknown
  run_cli_fail_case cli_explain_std_emit_c_flag "topaz: explain does not accept compile option --emit-c-only" explain std/fs --emit-c-only

  node dist/cli.js examples/fib.ts --emit-c-only -o build/cli_emit_probe > /dev/null
  if [[ ! -f build/cli_emit_probe.c ]]; then
    echo "FAIL [cli_emit_c_only]: expected build/cli_emit_probe.c" >&2
    exit 1
  fi
  echo "PASS [cli_emit_c_only]"

  node dist/cli.js examples/fib.ts --emit-c-only -o build/runtime_prelude_embedded > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_runtime_prelude_init" build/runtime_prelude_embedded.c; then
    echo "FAIL [runtime_prelude_embedded]: missing stable prelude init symbol" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_embedded.c -o build/runtime_prelude_embedded
  local prelude_out
  prelude_out=$(./build/runtime_prelude_embedded)
  if [[ "$prelude_out" != "5702887" ]]; then
    echo "FAIL [runtime_prelude_embedded]:" >&2
    echo "  expected: 5702887" >&2
    echo "  got: $prelude_out" >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_embedded]"

  node dist/cli.js examples/parse_number.ts --emit-c-only -o build/runtime_prelude_parse_int > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_parse_int" build/runtime_prelude_parse_int.c; then
    echo "FAIL [runtime_prelude_parse_int]: missing stable parseInt prelude symbol" >&2
    exit 1
  fi
  if ! grep -q "topaz_parse_float" build/runtime_prelude_parse_int.c; then
    echo "FAIL [runtime_prelude_parse_int]: missing parseFloat C substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_parse_int\s*\(" build/runtime_prelude_parse_int.c; then
    echo "FAIL [runtime_prelude_parse_int]: stale parseInt C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_number topaz_parse_int\s*\(" build/runtime_prelude_parse_int.c; then
    echo "FAIL [runtime_prelude_parse_int]: stale parseInt C helper definition embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_parse_int.c -o build/runtime_prelude_parse_int
  local parse_int_prelude_out
  parse_int_prelude_out=$(./build/runtime_prelude_parse_int)
  if [[ "$parse_int_prelude_out" != $'255\n16\n5\n10\n3.14\n42\n0\n100\n123\n-123\n15\n1295\n511\n10\n123\n8\n16\n15\n2.5\n100\nNaN\nNaN' ]]; then
    echo "FAIL [runtime_prelude_parse_int]:" >&2
    echo "  expected parse_number output" >&2
    printf '%s\n' "$parse_int_prelude_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_parse_int]"

  node dist/cli.js examples/string_from_char_code.ts --emit-c-only -o build/runtime_prelude_string_from_char_code > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_string_from_char_code.c runtime_prelude_string_from_char_code
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_from_char_code" build/runtime_prelude_string_from_char_code.c; then
    echo "FAIL [runtime_prelude_string_from_char_code]: missing stable fromCharCode prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_char_code\s*\(" build/runtime_prelude_string_from_char_code.c; then
    echo "FAIL [runtime_prelude_string_from_char_code]: stale fromCharCode C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_string_from_char_code\s*\(" build/runtime_prelude_string_from_char_code.c; then
    echo "FAIL [runtime_prelude_string_from_char_code]: stale fromCharCode C helper definition embedded" >&2
    exit 1
  fi
  local from_char_code_body
  from_char_code_body=$(awk '
    /^static __attribute__\(\(unused\)\) topaz_string topaz_fn_runtime_prelude___topaz_string_from_char_code\(topaz_number n\) \{/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^}$/ { exit }
  ' build/runtime_prelude_string_from_char_code.c)
  if ! grep -q "topaz_string_buffer_" <<< "$from_char_code_body"; then
    echo "FAIL [runtime_prelude_string_from_char_code]: missing string buffer intrinsic substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" <<< "$from_char_code_body"; then
    echo "FAIL [runtime_prelude_string_from_char_code]: old byte-code materialization helper still used" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_from_char_code.c -o build/runtime_prelude_string_from_char_code
  local from_char_code_out
  from_char_code_out=$(./build/runtime_prelude_string_from_char_code)
  if [[ "$from_char_code_out" != $'A\na\n0\nz\nB\n1\n72\nHello\n5\nA\nz\nmark=!\n1\n1\n127\nA\nA\nD\nZ\nabcde' ]]; then
    echo "FAIL [runtime_prelude_string_from_char_code]:" >&2
    echo "  expected string_from_char_code output" >&2
    printf '%s\n' "$from_char_code_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_from_char_code]"

  node dist/cli.js examples/string_method.ts --emit-c-only -o build/runtime_prelude_string_char_code_at > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_string_char_code_at.c runtime_prelude_string_char_code_at
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_char_code_at" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: missing stable String.charCodeAt prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_byte_at\s*\(" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: stale raw string byte-read substrate call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_number topaz_string_byte_at\s*\(" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: stale raw string byte-read substrate definition embedded" >&2
    exit 1
  fi
  if ! grep -Fq ".data[(size_t)" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: missing direct topaz_string byte read" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_char_code_at\s*\(" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: stale charCodeAt C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_number topaz_string_char_code_at\s*\(" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: stale charCodeAt C helper definition embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_char_code_at.c -o build/runtime_prelude_string_char_code_at
  local string_char_code_at_out
  string_char_code_at_out=$(./build/runtime_prelude_string_char_code_at)
  if [[ "$string_char_code_at_out" != $'5\n104\n101\n101\n111\ntrue\ntrue\nell\n3\nllo\n3\nhello\n5\nlo\nhell\nll\n0\ntrue\nlo\n0\nbcd\n6\nbcdabcdef\nace\n101\n119\nrld\n122\nabcdef' ]]; then
    echo "FAIL [runtime_prelude_string_char_code_at]:" >&2
    echo "  expected string_method output" >&2
    printf '%s\n' "$string_char_code_at_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_char_code_at]"

  node dist/cli.js examples/string_method.ts --emit-c-only -o build/runtime_prelude_string_slice > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_string_slice.c runtime_prelude_string_slice
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_slice" build/runtime_prelude_string_slice.c; then
    echo "FAIL [runtime_prelude_string_slice]: missing stable String.slice prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_slice\s*\(" build/runtime_prelude_string_slice.c; then
    echo "FAIL [runtime_prelude_string_slice]: stale String.slice C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_string_slice\s*\(" build/runtime_prelude_string_slice.c; then
    echo "FAIL [runtime_prelude_string_slice]: stale String.slice C helper definition embedded" >&2
    exit 1
  fi
  local string_slice_body
  string_slice_body=$(awk '
    /topaz_fn_runtime_prelude___topaz_string_slice\(topaz_string s, topaz_number rawStart, topaz_number rawEnd\)/ { in_fn = 1; depth = 0 }
    in_fn {
      print
      for (i = 1; i <= length($0); i++) {
        ch = substr($0, i, 1)
        if (ch == "{") depth++
        else if (ch == "}") depth--
      }
      if (depth == 0 && $0 ~ /}/) in_fn = 0
    }
  ' build/runtime_prelude_string_slice.c)
  if [[ -z "$string_slice_body" ]]; then
    echo "FAIL [runtime_prelude_string_slice]: could not extract generated String.slice body" >&2
    exit 1
  fi
  if ! grep -q "topaz_string_buffer_" <<<"$string_slice_body"; then
    echo "FAIL [runtime_prelude_string_slice]: generated String.slice body does not use StringBuffer" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" <<<"$string_slice_body"; then
    echo "FAIL [runtime_prelude_string_slice]: generated String.slice body still materializes byte codes" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_slice.c -o build/runtime_prelude_string_slice
  local string_slice_out
  string_slice_out=$(./build/runtime_prelude_string_slice)
  if [[ "$string_slice_out" != $'5\n104\n101\n101\n111\ntrue\ntrue\nell\n3\nllo\n3\nhello\n5\nlo\nhell\nll\n0\ntrue\nlo\n0\nbcd\n6\nbcdabcdef\nace\n101\n119\nrld\n122\nabcdef' ]]; then
    echo "FAIL [runtime_prelude_string_slice]:" >&2
    printf '%s\n' "$string_slice_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_slice]"

  node dist/cli.js examples/array_method_slice.ts --emit-c-only -o build/runtime_prelude_array_slice_normalize > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_slice_normalize" build/runtime_prelude_array_slice_normalize.c; then
    echo "FAIL [runtime_prelude_array_slice_normalize]: missing stable Array.slice normalize prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_slice_normalize\s*\(" build/runtime_prelude_array_slice_normalize.c; then
    echo "FAIL [runtime_prelude_array_slice_normalize]: stale Array.slice normalize C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline size_t topaz_slice_normalize\s*\(" build/runtime_prelude_array_slice_normalize.c; then
    echo "FAIL [runtime_prelude_array_slice_normalize]: stale Array.slice normalize C helper definition embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_array_slice_normalize.c -o build/runtime_prelude_array_slice_normalize
  local array_slice_normalize_out
  array_slice_normalize_out=$(./build/runtime_prelude_array_slice_normalize)
  if [[ "$array_slice_normalize_out" != $'3\n20\n40\n3\n30\n50\n5\n10\n50\n2\n40\n50\n4\n10\n40\n2\n30\n40\n0\n0\n2\n40\n50\n0\n2\nbeta\ngamma\n1\n99\n777\n2\n20\n30\n2\n20\n30\n3\n4\n99' ]]; then
    echo "FAIL [runtime_prelude_array_slice_normalize]:" >&2
    echo "  expected array_method_slice output" >&2
    printf '%s\n' "$array_slice_normalize_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_array_slice_normalize]"

  node dist/cli.js examples/template_literal.ts --emit-c-only -o build/runtime_prelude_string_concat > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_string_concat.c runtime_prelude_string_concat
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_concat" build/runtime_prelude_string_concat.c; then
    echo "FAIL [runtime_prelude_string_concat]: missing stable string concat prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_concat\s*\(" build/runtime_prelude_string_concat.c; then
    echo "FAIL [runtime_prelude_string_concat]: stale string concat C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_string_concat\s*\(" build/runtime_prelude_string_concat.c; then
    echo "FAIL [runtime_prelude_string_concat]: stale string concat C helper definition embedded" >&2
    exit 1
  fi
  local string_concat_body
  string_concat_body=$(awk '
    /^static __attribute__\(\(unused\)\) topaz_string topaz_fn_runtime_prelude___topaz_string_concat\(topaz_string a, topaz_string b\) \{/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^}$/ { exit }
  ' build/runtime_prelude_string_concat.c)
  if ! grep -q "topaz_string_buffer_" <<< "$string_concat_body"; then
    echo "FAIL [runtime_prelude_string_concat]: missing string buffer intrinsic substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" <<< "$string_concat_body"; then
    echo "FAIL [runtime_prelude_string_concat]: old byte-code materialization helper still used" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_concat.c -o build/runtime_prelude_string_concat
  local string_concat_out
  string_concat_out=$(./build/runtime_prelude_string_concat)
  if [[ "$string_concat_out" != $'hello, topaz!\ntopaz is 42\nflag=true\ntopaz\ntopaz/42\n42true\npi=3.14\nsum=0.30000000000000004\nbig=1e+21\ntiny=1e-7\ntwice(42)=84\nlen(topaz)=5\nn+1=43\nanswer=7\n?=7\n(3, 4)\nnorm=25\nq="topaz"\ntab\there\n[0][1][2][3][4]' ]]; then
    echo "FAIL [runtime_prelude_string_concat]:" >&2
    echo "  expected template_literal output" >&2
    printf '%s\n' "$string_concat_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_concat]"

  node dist/cli.js examples/string_repeat.ts --emit-c-only -o build/runtime_prelude_string_repeat > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_string_repeat.c runtime_prelude_string_repeat
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_repeat" build/runtime_prelude_string_repeat.c; then
    echo "FAIL [runtime_prelude_string_repeat]: missing stable String.repeat prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_repeat\s*\(" build/runtime_prelude_string_repeat.c; then
    echo "FAIL [runtime_prelude_string_repeat]: stale String.repeat C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_string_repeat\s*\(" build/runtime_prelude_string_repeat.c; then
    echo "FAIL [runtime_prelude_string_repeat]: stale String.repeat C helper definition embedded" >&2
    exit 1
  fi
  if grep -q "TOPAZ_STRING_REPEAT_MAX_BYTES" build/runtime_prelude_string_repeat.c; then
    echo "FAIL [runtime_prelude_string_repeat]: stale String.repeat max macro embedded" >&2
    exit 1
  fi
  local string_repeat_body
  string_repeat_body=$(awk '
    /^static __attribute__\(\(unused\)\) topaz_string topaz_fn_runtime_prelude___topaz_string_repeat\(topaz_string s, topaz_number count\) \{/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^}$/ { exit }
  ' build/runtime_prelude_string_repeat.c)
  if ! grep -q "topaz_string_buffer_" <<< "$string_repeat_body"; then
    echo "FAIL [runtime_prelude_string_repeat]: missing string buffer intrinsic substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" <<< "$string_repeat_body"; then
    echo "FAIL [runtime_prelude_string_repeat]: old byte-code materialization helper still used" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_repeat.c -o build/runtime_prelude_string_repeat
  local string_repeat_out
  string_repeat_out=$(./build/runtime_prelude_string_repeat)
  if [[ "$string_repeat_out" != $'xxx\n3\n0\ntrue\naa\npre-haha\nqq' ]]; then
    echo "FAIL [runtime_prelude_string_repeat]:" >&2
    echo "  expected string_repeat output" >&2
    printf '%s\n' "$string_repeat_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_repeat]"

  node dist/cli.js examples/string_starts_ends_with.ts --emit-c-only -o build/runtime_prelude_starts_with > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_starts_with" build/runtime_prelude_starts_with.c; then
    echo "FAIL [runtime_prelude_starts_with]: missing stable startsWith prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_boolean topaz_string_starts_with\\(" build/runtime_prelude_starts_with.c; then
    echo "FAIL [runtime_prelude_starts_with]: migrated startsWith helper definition still embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_starts_with.c -o build/runtime_prelude_starts_with
  local starts_with_out
  starts_with_out=$(./build/runtime_prelude_starts_with)
  if [[ "$starts_with_out" != $'true\nfalse\ntrue\nfalse\ntrue\ntrue\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\nrelative\nrelative\nbare\nmodule\nmodule\nother' ]]; then
    echo "FAIL [runtime_prelude_starts_with]:" >&2
    echo "  expected string_starts_ends_with output" >&2
    printf '%s\n' "$starts_with_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_starts_with]"

  node dist/cli.js examples/template_literal.ts --emit-c-only -o build/runtime_prelude_boolean_to_string > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_boolean_to_string" build/runtime_prelude_boolean_to_string.c; then
    echo "FAIL [runtime_prelude_boolean_to_string]: missing stable boolean-to-string prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_boolean_to_string\\(" build/runtime_prelude_boolean_to_string.c; then
    echo "FAIL [runtime_prelude_boolean_to_string]: migrated boolean-to-string helper definition still embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_boolean_to_string.c -o build/runtime_prelude_boolean_to_string
  local boolean_to_string_out
  boolean_to_string_out=$(./build/runtime_prelude_boolean_to_string)
  if [[ "$boolean_to_string_out" != $'hello, topaz!\ntopaz is 42\nflag=true\ntopaz\ntopaz/42\n42true\npi=3.14\nsum=0.30000000000000004\nbig=1e+21\ntiny=1e-7\ntwice(42)=84\nlen(topaz)=5\nn+1=43\nanswer=7\n?=7\n(3, 4)\nnorm=25\nq="topaz"\ntab\there\n[0][1][2][3][4]' ]]; then
    echo "FAIL [runtime_prelude_boolean_to_string]:" >&2
    echo "  expected template_literal output" >&2
    printf '%s\n' "$boolean_to_string_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_boolean_to_string]"

  cat > build/runtime_prelude_console_boolean.ts <<'TOPAZ'
function truthy(): boolean {
  return true;
}

console.log(truthy());
console.error(!truthy());
console.warn(truthy() === true);
TOPAZ
  node dist/cli.js build/runtime_prelude_console_boolean.ts --emit-c-only -o build/runtime_prelude_console_boolean > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_boolean_to_string" build/runtime_prelude_console_boolean.c; then
    echo "FAIL [runtime_prelude_console_boolean]: missing stable boolean-to-string prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_console_(log|error|warn)_boolean\b" build/runtime_prelude_console_boolean.c; then
    echo "FAIL [runtime_prelude_console_boolean]: old boolean console helper still emitted" >&2
    exit 1
  fi
  if ! grep -Eq "\btopaz_stdout_write\b" build/runtime_prelude_console_boolean.c || ! grep -Eq "\btopaz_stderr_write\b" build/runtime_prelude_console_boolean.c; then
    echo "FAIL [runtime_prelude_console_boolean]: missing raw stdout/stderr write substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_console_(log|error|warn)_string\b" build/runtime_prelude_console_boolean.c; then
    echo "FAIL [runtime_prelude_console_boolean]: old string console helper still emitted or defined" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_console_boolean.c -o build/runtime_prelude_console_boolean
  ./build/runtime_prelude_console_boolean > build/runtime_prelude_console_boolean.stdout 2> build/runtime_prelude_console_boolean.stderr
  local console_boolean_stdout
  console_boolean_stdout=$(< build/runtime_prelude_console_boolean.stdout)
  local console_boolean_stderr
  console_boolean_stderr=$(< build/runtime_prelude_console_boolean.stderr)
  if [[ "$console_boolean_stdout" != "true" ]]; then
    echo "FAIL [runtime_prelude_console_boolean stdout]:" >&2
    printf '%s\n' "$console_boolean_stdout" | sed 's/^/  got: /' >&2
    exit 1
  fi
  if [[ "$console_boolean_stderr" != $'false\ntrue' ]]; then
    echo "FAIL [runtime_prelude_console_boolean stderr]:" >&2
    printf '%s\n' "$console_boolean_stderr" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_console_boolean]"

  cat > build/runtime_numeric_console_string.ts <<'TOPAZ'
function n(): number {
  return 123;
}

console.log(n());
console.error(1.5);
console.warn(2);
console.log(123n);
console.error(-5n);
console.warn(0n);
TOPAZ
  node dist/cli.js build/runtime_numeric_console_string.ts --emit-c-only -o build/runtime_numeric_console_string > /dev/null
  if ! grep -Eq "\btopaz_number_to_string\b" build/runtime_numeric_console_string.c; then
    echo "FAIL [runtime_numeric_console_string]: missing number stringification helper" >&2
    exit 1
  fi
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_to_string" build/runtime_numeric_console_string.c; then
    echo "FAIL [runtime_numeric_console_string]: missing stable bigint-to-string prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_to_string\s*\(" build/runtime_numeric_console_string.c; then
    echo "FAIL [runtime_numeric_console_string]: stale standalone bigint stringification helper emitted or defined" >&2
    exit 1
  fi
  if ! grep -Eq "\btopaz_stdout_write\b" build/runtime_numeric_console_string.c || ! grep -Eq "\btopaz_stderr_write\b" build/runtime_numeric_console_string.c; then
    echo "FAIL [runtime_numeric_console_string]: missing raw stdout/stderr write substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_console_(log|error|warn)_(string|number|bigint)\b" build/runtime_numeric_console_string.c; then
    echo "FAIL [runtime_numeric_console_string]: old numeric console helper still emitted or defined" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_numeric_console_string.c -o build/runtime_numeric_console_string
  ./build/runtime_numeric_console_string > build/runtime_numeric_console_string.stdout 2> build/runtime_numeric_console_string.stderr
  local numeric_console_stdout
  numeric_console_stdout=$(< build/runtime_numeric_console_string.stdout)
  local numeric_console_stderr
  numeric_console_stderr=$(< build/runtime_numeric_console_string.stderr)
  if [[ "$numeric_console_stdout" != $'123\n123' ]]; then
    echo "FAIL [runtime_numeric_console_string stdout]:" >&2
    printf '%s\n' "$numeric_console_stdout" | sed 's/^/  got: /' >&2
    exit 1
  fi
  if [[ "$numeric_console_stderr" != $'1.5\n2\n-5\n0' ]]; then
    echo "FAIL [runtime_numeric_console_string stderr]:" >&2
    printf '%s\n' "$numeric_console_stderr" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_numeric_console_string]"

  node dist/cli.js examples/bigint_large_limb.ts --emit-c-only -o build/runtime_prelude_bigint_to_string > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_to_string" build/runtime_prelude_bigint_to_string.c; then
    echo "FAIL [runtime_prelude_bigint_to_string]: missing stable bigint-to-string prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_to_string\s*\(" build/runtime_prelude_bigint_to_string.c; then
    echo "FAIL [runtime_prelude_bigint_to_string]: stale standalone bigint stringification helper emitted or defined" >&2
    exit 1
  fi
  local bigint_to_string_body
  bigint_to_string_body=$(awk '
    /^static .* topaz_fn_runtime_prelude___topaz_bigint_to_string\(topaz_bigint \* value\) \{/ { in_fn = 1; depth = 0 }
    in_fn {
      print
      for (i = 1; i <= length($0); i++) {
        ch = substr($0, i, 1)
        if (ch == "{") depth++
        else if (ch == "}") depth--
      }
      if (depth == 0 && $0 ~ /}/) in_fn = 0
    }
  ' build/runtime_prelude_bigint_to_string.c)
  if ! grep -q "topaz_string_buffer_" <<< "$bigint_to_string_body"; then
    echo "FAIL [runtime_prelude_bigint_to_string]: missing string buffer intrinsic substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_number_to_string\s*\(" <<< "$bigint_to_string_body"; then
    echo "FAIL [runtime_prelude_bigint_to_string]: bigint formatting depends on number formatting" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_to_string.c -o build/runtime_prelude_bigint_to_string
  local bigint_to_string_out
  bigint_to_string_out=$(./build/runtime_prelude_bigint_to_string)
  if [[ "$bigint_to_string_out" != $'123456789012345678901234567890\n1111111110111111111011111111100\n864197532086419753208641975320\n1234567890123456789012345678900\ntrue\ntrue\n123456789012345678901234567890:987654321098765432109876543210' ]]; then
    echo "FAIL [runtime_prelude_bigint_to_string]:" >&2
    printf '%s\n' "$bigint_to_string_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_to_string]"

  node dist/cli.js examples/bigint_large_limb.ts --emit-c-only -o build/runtime_prelude_bigint_buffer > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_clone" build/runtime_prelude_bigint_buffer.c; then
    echo "FAIL [runtime_prelude_bigint_buffer]: missing stable bigint clone prelude symbol" >&2
    exit 1
  fi
  for symbol in \
    topaz_bigint_buffer_new \
    topaz_bigint_buffer_to_bigint \
    topaz_bigint_buffer_len \
    topaz_bigint_buffer_get_limb \
    topaz_bigint_buffer_set_limb \
    topaz_bigint_limb_len \
    topaz_bigint_limb \
    topaz_bigint_sign; do
    if ! grep -Eq "\b${symbol}\s*\(" build/runtime_prelude_bigint_buffer.c; then
      echo "FAIL [runtime_prelude_bigint_buffer]: missing ${symbol} call" >&2
      exit 1
    fi
  done
  for symbol in topaz_bigint_alloc topaz_bigint_normalize; do
    if grep -Eq "\b${symbol}\s*\(" build/runtime_prelude_bigint_buffer.c; then
      echo "FAIL [runtime_prelude_bigint_buffer]: stale standalone ${symbol} emitted" >&2
      exit 1
    fi
  done
  cc -O2 -Iruntime -Wall -Wextra -c build/runtime_prelude_bigint_buffer.c -o build/runtime_prelude_bigint_buffer.o
  echo "PASS [runtime_prelude_bigint_buffer]"

  node dist/cli.js examples/bigint_equality.ts --emit-c-only -o build/runtime_prelude_bigint_eq > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_eq" build/runtime_prelude_bigint_eq.c; then
    echo "FAIL [runtime_prelude_bigint_eq]: missing stable bigint equality prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_eq\s*\(" build/runtime_prelude_bigint_eq.c; then
    echo "FAIL [runtime_prelude_bigint_eq]: stale bigint equality C helper call or definition emitted" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_eq.c -o build/runtime_prelude_bigint_eq
  local bigint_eq_out
  bigint_eq_out=$(./build/runtime_prelude_bigint_eq)
  if [[ "$bigint_eq_out" != $'true\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue' ]]; then
    echo "FAIL [runtime_prelude_bigint_eq]:" >&2
    printf '%s\n' "$bigint_eq_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_eq]"

  node dist/cli.js examples/bigint_ordering.ts --emit-c-only -o build/runtime_prelude_bigint_cmp > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_cmp" build/runtime_prelude_bigint_cmp.c; then
    echo "FAIL [runtime_prelude_bigint_cmp]: missing stable bigint comparison prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_cmp\s*\(" build/runtime_prelude_bigint_cmp.c; then
    echo "FAIL [runtime_prelude_bigint_cmp]: stale bigint comparison C helper call or definition emitted" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_cmp_abs\s*\(" build/runtime_prelude_bigint_cmp.c; then
    echo "FAIL [runtime_prelude_bigint_cmp]: stale bigint absolute comparison C helper call or definition emitted" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_cmp.c -o build/runtime_prelude_bigint_cmp
  local bigint_cmp_out
  bigint_cmp_out=$(./build/runtime_prelude_bigint_cmp)
  if [[ "$bigint_cmp_out" != $'true\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue' ]]; then
    echo "FAIL [runtime_prelude_bigint_cmp]:" >&2
    printf '%s\n' "$bigint_cmp_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_cmp]"

  node dist/cli.js examples/bigint_unary_negation.ts --emit-c-only -o build/runtime_prelude_bigint_neg > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_neg" build/runtime_prelude_bigint_neg.c; then
    echo "FAIL [runtime_prelude_bigint_neg]: missing stable bigint negation prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_neg\s*\(" build/runtime_prelude_bigint_neg.c; then
    echo "FAIL [runtime_prelude_bigint_neg]: stale bigint negation C helper call or definition emitted" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_neg.c -o build/runtime_prelude_bigint_neg
  local bigint_neg_out
  bigint_neg_out=$(./build/runtime_prelude_bigint_neg)
  if [[ "$bigint_neg_out" != $'-12\n34\n0\ntrue\n-123456789012345678901234567890\n42' ]]; then
    echo "FAIL [runtime_prelude_bigint_neg]:" >&2
    printf '%s\n' "$bigint_neg_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_neg]"

  node dist/cli.js examples/bigint_add_sub_prelude.ts --emit-c-only -o build/runtime_prelude_bigint_add_sub > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_add" build/runtime_prelude_bigint_add_sub.c; then
    echo "FAIL [runtime_prelude_bigint_add_sub]: missing stable bigint addition prelude symbol" >&2
    exit 1
  fi
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_sub" build/runtime_prelude_bigint_add_sub.c; then
    echo "FAIL [runtime_prelude_bigint_add_sub]: missing stable bigint subtraction prelude symbol" >&2
    exit 1
  fi
  for symbol in \
    topaz_bigint_add \
    topaz_bigint_sub \
    topaz_bigint_add_abs \
    topaz_bigint_sub_abs \
    topaz_bigint_copy_abs; do
    if grep -Eq "\b${symbol}\s*\(" build/runtime_prelude_bigint_add_sub.c; then
      echo "FAIL [runtime_prelude_bigint_add_sub]: stale ${symbol} helper call or definition emitted" >&2
      exit 1
    fi
  done
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_add_sub.c -o build/runtime_prelude_bigint_add_sub
  local bigint_add_sub_out
  bigint_add_sub_out=$(./build/runtime_prelude_bigint_add_sub)
  if [[ "$bigint_add_sub_out" != $'579\n333\n-333\n0\n18446744073709551617\n18446744073709551613\n123456789000000000\n42' ]]; then
    echo "FAIL [runtime_prelude_bigint_add_sub]:" >&2
    printf '%s\n' "$bigint_add_sub_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_add_sub]"

  node dist/cli.js examples/bigint_mul_prelude.ts --emit-c-only -o build/runtime_prelude_bigint_mul > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_mul" build/runtime_prelude_bigint_mul.c; then
    echo "FAIL [runtime_prelude_bigint_mul]: missing stable bigint multiplication prelude symbol" >&2
    exit 1
  fi
  for symbol in \
    topaz_bigint_mul \
    topaz_bigint_zero; do
    if grep -Eq "\b${symbol}\s*\(" build/runtime_prelude_bigint_mul.c; then
      echo "FAIL [runtime_prelude_bigint_mul]: stale ${symbol} helper call or definition emitted" >&2
      exit 1
    fi
  done
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_mul.c -o build/runtime_prelude_bigint_mul
  local bigint_mul_out
  bigint_mul_out=$(./build/runtime_prelude_bigint_mul)
  if [[ "$bigint_mul_out" != $'0\n-408\n408\n56088\n18446744065119617025\n281474976710657' ]]; then
    echo "FAIL [runtime_prelude_bigint_mul]:" >&2
    printf '%s\n' "$bigint_mul_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_mul]"

  node dist/cli.js examples/bigint_decimal_parse_prelude.ts --emit-c-only -o build/runtime_prelude_bigint_decimal > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_from_decimal" build/runtime_prelude_bigint_decimal.c; then
    echo "FAIL [runtime_prelude_bigint_decimal]: missing stable bigint decimal parser prelude symbol" >&2
    exit 1
  fi
  for symbol in \
    topaz_bigint_from_decimal_cstr \
    topaz_bigint_mul_small_in_place \
    topaz_bigint_add_small_in_place; do
    if grep -Eq "\b${symbol}\s*\(" build/runtime_prelude_bigint_decimal.c; then
      echo "FAIL [runtime_prelude_bigint_decimal]: stale ${symbol} helper call or definition emitted" >&2
      exit 1
    fi
  done
  cc -O2 -Iruntime -Wall -Wextra -c build/runtime_prelude_bigint_decimal.c -o build/runtime_prelude_bigint_decimal.o
  echo "PASS [runtime_prelude_bigint_decimal]"

  cat > build/runtime_console_warn_string.ts <<'TOPAZ'
console.warn("careful");
console.warn(true);
console.warn(2.5);
console.warn(0n);
TOPAZ
  node dist/cli.js build/runtime_console_warn_string.ts --emit-c-only -o build/runtime_console_warn_string > /dev/null
  if ! grep -Eq "\btopaz_stderr_write\b" build/runtime_console_warn_string.c; then
    echo "FAIL [runtime_console_warn_string]: missing stderr write substrate for console.warn" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_console_(warn|error)_string\b" build/runtime_console_warn_string.c; then
    echo "FAIL [runtime_console_warn_string]: stale console string wrapper emitted or defined" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_console_warn_string.c -o build/runtime_console_warn_string
  ./build/runtime_console_warn_string > build/runtime_console_warn_string.stdout 2> build/runtime_console_warn_string.stderr
  if [[ -s build/runtime_console_warn_string.stdout ]]; then
    echo "FAIL [runtime_console_warn_string stdout]: expected empty stdout" >&2
    sed 's/^/  got: /' build/runtime_console_warn_string.stdout >&2
    exit 1
  fi
  printf 'careful\ntrue\n2.5\n0\n' > build/runtime_console_warn_string.expected_stderr
  if ! cmp -s build/runtime_console_warn_string.expected_stderr build/runtime_console_warn_string.stderr; then
    echo "FAIL [runtime_console_warn_string stderr]:" >&2
    sed 's/^/  expected: /' build/runtime_console_warn_string.expected_stderr >&2
    sed 's/^/  got: /' build/runtime_console_warn_string.stderr >&2
    exit 1
  fi
  echo "PASS [runtime_console_warn_string]"

  cat > build/runtime_console_line_io_wrappers.ts <<'TOPAZ'
import { writeError } from "std/process";

console.log("out");
console.log(true);
console.error("err");
console.warn(3);
writeError("line");
process.stdout.write("raw");
process.stdout.write("\n");
process.stderr.write("rawerr\n");
TOPAZ
  node dist/cli.js build/runtime_console_line_io_wrappers.ts --emit-c-only -o build/runtime_console_line_io_wrappers > /dev/null
  if ! grep -Eq "\btopaz_stdout_write\b" build/runtime_console_line_io_wrappers.c; then
    echo "FAIL [runtime_console_line_io_wrappers]: missing stdout write substrate" >&2
    exit 1
  fi
  if ! grep -Eq "\btopaz_stderr_write\b" build/runtime_console_line_io_wrappers.c; then
    echo "FAIL [runtime_console_line_io_wrappers]: missing stderr write substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_console_(log|error)_string\b" build/runtime_console_line_io_wrappers.c; then
    echo "FAIL [runtime_console_line_io_wrappers]: stale console line wrapper emitted or defined" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_console_line_io_wrappers.c -o build/runtime_console_line_io_wrappers
  ./build/runtime_console_line_io_wrappers > build/runtime_console_line_io_wrappers.stdout 2> build/runtime_console_line_io_wrappers.stderr
  printf 'out\ntrue\nraw\n' > build/runtime_console_line_io_wrappers.expected_stdout
  printf 'err\n3\nline\nrawerr\n' > build/runtime_console_line_io_wrappers.expected_stderr
  if ! cmp -s build/runtime_console_line_io_wrappers.expected_stdout build/runtime_console_line_io_wrappers.stdout; then
    echo "FAIL [runtime_console_line_io_wrappers stdout]:" >&2
    sed 's/^/  expected: /' build/runtime_console_line_io_wrappers.expected_stdout >&2
    sed 's/^/  got: /' build/runtime_console_line_io_wrappers.stdout >&2
    exit 1
  fi
  if ! cmp -s build/runtime_console_line_io_wrappers.expected_stderr build/runtime_console_line_io_wrappers.stderr; then
    echo "FAIL [runtime_console_line_io_wrappers stderr]:" >&2
    sed 's/^/  expected: /' build/runtime_console_line_io_wrappers.expected_stderr >&2
    sed 's/^/  got: /' build/runtime_console_line_io_wrappers.stderr >&2
    exit 1
  fi
  echo "PASS [runtime_console_line_io_wrappers]"

  node dist/cli.js examples/string_basic.ts --emit-c-only -o build/runtime_prelude_string_eq > /dev/null
  local string_eq_calls
  string_eq_calls=$(grep -c "topaz_fn_runtime_prelude___topaz_string_eq(" build/runtime_prelude_string_eq.c || true)
  if (( string_eq_calls < 4 )); then
    echo "FAIL [runtime_prelude_string_eq]: missing string equality prelude call sites" >&2
    echo "  found calls: $string_eq_calls" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_eq.c -o build/runtime_prelude_string_eq
  local string_eq_out
  string_eq_out=$(./build/runtime_prelude_string_eq)
  if [[ "$string_eq_out" != $'hello, topaz!\n13\nabcdef\ntrue\ntrue\nwoof' ]]; then
    echo "FAIL [runtime_prelude_string_eq]:" >&2
    echo "  expected string_basic output" >&2
    printf '%s\n' "$string_eq_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_eq]"

  node dist/cli.js examples/array_method_includes.ts --emit-c-only -o build/runtime_prelude_string_includes > /dev/null
  local string_includes_calls
  string_includes_calls=$(grep -c "topaz_fn_runtime_prelude___topaz_string_eq(" build/runtime_prelude_string_includes.c || true)
  if (( string_includes_calls < 3 )); then
    echo "FAIL [runtime_prelude_string_includes]: missing string includes prelude call site" >&2
    echo "  found calls: $string_includes_calls" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_includes.c -o build/runtime_prelude_string_includes
  local string_includes_out
  string_includes_out=$(./build/runtime_prelude_string_includes)
  if [[ "$string_includes_out" != $'true\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\ntrue\ntrue\nfalse\ntrue\nfalse\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\nfalse' ]]; then
    echo "FAIL [runtime_prelude_string_includes]:" >&2
    echo "  expected array_method_includes output" >&2
    printf '%s\n' "$string_includes_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_includes]"

  node dist/cli.js examples/map_set_basic.ts --emit-c-only -o build/runtime_substrate_string_map_set > /dev/null
  if ! grep -q "TOPAZ_MAP_DEFINE(string_.*topaz_string_eq" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing substrate string map equality helper" >&2
    exit 1
  fi
  if ! grep -q "TOPAZ_SET_DEFINE(string,.*topaz_string_eq" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing substrate string set equality helper" >&2
    exit 1
  fi
  echo "PASS [runtime_substrate_string_map_set]"

  node dist/cli.js examples/string_starts_ends_with.ts --emit-c-only -o build/runtime_prelude_ends_with > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_ends_with" build/runtime_prelude_ends_with.c; then
    echo "FAIL [runtime_prelude_ends_with]: missing stable endsWith prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_boolean topaz_string_ends_with\\(" build/runtime_prelude_ends_with.c; then
    echo "FAIL [runtime_prelude_ends_with]: migrated endsWith helper definition still embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_ends_with.c -o build/runtime_prelude_ends_with
  local ends_with_out
  ends_with_out=$(./build/runtime_prelude_ends_with)
  if [[ "$ends_with_out" != $'true\nfalse\ntrue\nfalse\ntrue\ntrue\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\nrelative\nrelative\nbare\nmodule\nmodule\nother' ]]; then
    echo "FAIL [runtime_prelude_ends_with]:" >&2
    echo "  expected string_starts_ends_with output" >&2
    printf '%s\n' "$ends_with_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_ends_with]"

  node dist/cli.js examples/string_trim_start.ts --emit-c-only -o build/runtime_prelude_trim_start > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_trim_start" build/runtime_prelude_trim_start.c; then
    echo "FAIL [runtime_prelude_trim_start]: missing stable trimStart prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_string_trim_start\\(" build/runtime_prelude_trim_start.c; then
    echo "FAIL [runtime_prelude_trim_start]: migrated trimStart helper definition still embedded" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_boolean topaz_string_is_trim_start_byte\\(" build/runtime_prelude_trim_start.c; then
    echo "FAIL [runtime_prelude_trim_start]: stale trimStart byte helper definition still embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_trim_start.c -o build/runtime_prelude_trim_start
  local trim_start_out
  trim_start_out=$(./build/runtime_prelude_trim_start)
  if [[ "$trim_start_out" != $'topaz\n5\nok\n2\nready\n5\n0\ntrue\npre-value\nbc\nxxx\nname' ]]; then
    echo "FAIL [runtime_prelude_trim_start]:" >&2
    echo "  expected string_trim_start output" >&2
    printf '%s\n' "$trim_start_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_trim_start]"

  node dist/cli.js examples/node_path_extname.ts --emit-c-only -o build/runtime_prelude_path_extname > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_extname" build/runtime_prelude_path_extname.c; then
    echo "FAIL [runtime_prelude_path_extname]: missing stable path extname prelude symbol" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_path_extname.c -o build/runtime_prelude_path_extname
  local path_extname_out
  path_extname_out=$(./build/runtime_prelude_path_extname)
  if [[ "$path_extname_out" != $'.html\n.md\n.\ntrue\ntrue\n.md\n.ts\ntrue\n.gz\ntrue\ntrue\ntrue\n.tsx' ]]; then
    echo "FAIL [runtime_prelude_path_extname]:" >&2
    echo "  expected node_path_extname output" >&2
    printf '%s\n' "$path_extname_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_path_extname]"

  node dist/cli.js examples/node_path_basic.ts --emit-c-only -o build/runtime_prelude_path_dirname > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_dirname" build/runtime_prelude_path_dirname.c; then
    echo "FAIL [runtime_prelude_path_dirname]: missing stable path dirname prelude symbol" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_path_dirname.c -o build/runtime_prelude_path_dirname
  local path_dirname_out
  path_dirname_out=$(./build/runtime_prelude_path_dirname)
  if [[ "$path_dirname_out" != $'/foo/bar\n/foo\nfoo\n.\n/\n/\n/foo/bar\n/a/c\n/a/b/d\n/foo/bar/baz\n/bar\n/x/w\n/a/b/util.ts\n/pkg/src\ntrue' ]]; then
    echo "FAIL [runtime_prelude_path_dirname]:" >&2
    echo "  expected node_path_basic output" >&2
    printf '%s\n' "$path_dirname_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_path_dirname]"

  node dist/cli.js examples/node_path_basename.ts --emit-c-only -o build/runtime_prelude_path_basename > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_basename" build/runtime_prelude_path_basename.c; then
    echo "FAIL [runtime_prelude_path_basename]: missing stable path basename prelude symbol" >&2
    exit 1
  fi
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_basename_ext" build/runtime_prelude_path_basename.c; then
    echo "FAIL [runtime_prelude_path_basename]: missing stable path basename ext prelude symbol" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_path_basename.c -o build/runtime_prelude_path_basename
  local path_basename_out
  path_basename_out=$(./build/runtime_prelude_path_basename)
  if [[ "$path_basename_out" != $'baz.ts\nbar\nbar\nfoo\nfoo\n\ntrue\nbaz\nfoo\nmain\nbar.ts\ntrue\nindex' ]]; then
    echo "FAIL [runtime_prelude_path_basename]:" >&2
    echo "  expected node_path_basename output" >&2
    printf '%s\n' "$path_basename_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_path_basename]"

  node dist/cli.js examples/node_path_join.ts --emit-c-only -o build/runtime_prelude_path_join > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_join_segments" build/runtime_prelude_path_join.c; then
    echo "FAIL [runtime_prelude_path_join]: missing stable path join prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "topaz_path_join\\([0-9]" build/runtime_prelude_path_join.c; then
    echo "FAIL [runtime_prelude_path_join]: unexpected topaz_path_join call site" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_path_join.c -o build/runtime_prelude_path_join
  local path_join_out
  path_join_out=$(./build/runtime_prelude_path_join)
  if [[ "$path_join_out" != $'.\n.\nfoo/bar\n/foo/bar\n/bar\n../b\na/b/c/\na\n/\n.\n..\n/a/b/c\nfoo/bar\n/pkg/src/index' ]]; then
    echo "FAIL [runtime_prelude_path_join]:" >&2
    echo "  expected node_path_join output" >&2
    printf '%s\n' "$path_join_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_path_join]"

  node dist/cli.js examples/node_path_basic.ts --emit-c-only -o build/runtime_prelude_path_resolve > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_resolve_segments" build/runtime_prelude_path_resolve.c; then
    echo "FAIL [runtime_prelude_path_resolve]: missing stable path resolve prelude symbol" >&2
    exit 1
  fi
  if ! grep -q "topaz_process_cwd(" build/runtime_prelude_path_resolve.c; then
    echo "FAIL [runtime_prelude_path_resolve]: missing cwd substrate helper" >&2
    exit 1
  fi
  if grep -q "topaz_path_resolve(" build/runtime_prelude_path_resolve.c; then
    echo "FAIL [runtime_prelude_path_resolve]: unexpected old path resolve call site" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_path_(resolve|normalize_string)\\(" build/runtime_prelude_path_resolve.c; then
    echo "FAIL [runtime_prelude_path_resolve]: old path resolve helper definition still embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_path_resolve.c -o build/runtime_prelude_path_resolve
  local path_resolve_out
  path_resolve_out=$(./build/runtime_prelude_path_resolve)
  if [[ "$path_resolve_out" != $'/foo/bar\n/foo\nfoo\n.\n/\n/\n/foo/bar\n/a/c\n/a/b/d\n/foo/bar/baz\n/bar\n/x/w\n/a/b/util.ts\n/pkg/src\ntrue' ]]; then
    echo "FAIL [runtime_prelude_path_resolve]:" >&2
    echo "  expected node_path_basic output" >&2
    printf '%s\n' "$path_resolve_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_path_resolve]"
  if grep -Eq "static inline topaz_string topaz_path_(dirname|basename|basename_ext|extname|join|resolve|normalize_string)\\(" build/runtime_prelude_path_resolve.c; then
    echo "FAIL [runtime_header_path_helper_cleanup]: migrated path helper definition still embedded" >&2
    exit 1
  fi
  echo "PASS [runtime_header_path_helper_cleanup]"

  node dist/cli.js examples/node_url_basic.ts --emit-c-only -o build/runtime_prelude_file_url > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_file_url.c runtime_prelude_file_url
  if ! grep -q "topaz_fn_runtime_prelude___topaz_url_file_url_to_path" build/runtime_prelude_file_url.c; then
    echo "FAIL [runtime_prelude_file_url]: missing stable fileURLToPath prelude symbol" >&2
    exit 1
  fi
  local file_url_body
  file_url_body=$(awk '
    /topaz_fn_runtime_prelude___topaz_url_file_url_to_path\(topaz_string url\)/ { in_fn = 1; depth = 0 }
    in_fn {
      print
      for (i = 1; i <= length($0); i++) {
        ch = substr($0, i, 1)
        if (ch == "{") depth++
        else if (ch == "}") depth--
      }
      if (depth == 0 && $0 ~ /}/) in_fn = 0
    }
  ' build/runtime_prelude_file_url.c)
  if [[ -z "$file_url_body" ]]; then
    echo "FAIL [runtime_prelude_file_url]: could not extract generated fileURLToPath body" >&2
    exit 1
  fi
  if ! grep -q "topaz_string_buffer_" <<<"$file_url_body"; then
    echo "FAIL [runtime_prelude_file_url]: generated fileURLToPath body does not use StringBuffer" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" <<<"$file_url_body"; then
    echo "FAIL [runtime_prelude_file_url]: generated fileURLToPath body still materializes byte codes" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_url_file_url_to_path\s*\(" build/runtime_prelude_file_url.c; then
    echo "FAIL [runtime_prelude_file_url]: old fileURLToPath helper still emitted" >&2
    exit 1
  fi
  if ! grep -q "topaz_runtime_module_url" build/runtime_prelude_file_url.c; then
    echo "FAIL [runtime_prelude_file_url]: missing import.meta.url substrate" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_file_url.c -o build/runtime_prelude_file_url
  local file_url_out
  file_url_out=$(./build/runtime_prelude_file_url)
  if [[ "$file_url_out" != $'true\ntrue\ntrue\ntrue\nruntime_prelude_file_url\ntrue\ntrue\n/tmp/a b/c/d\n/etc/hosts\n7\n0\n255' ]]; then
    echo "FAIL [runtime_prelude_file_url]:" >&2
    echo "  expected node_url_basic output" >&2
    printf '%s\n' "$file_url_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_file_url]"

  node dist/cli.js examples/fib.ts --output build/cli_output_probe > /dev/null
  local out
  out=$(./build/cli_output_probe)
  if [[ "$out" != "5702887" ]]; then
    echo "FAIL [cli_output_long_flag]:" >&2
    echo "  expected: 5702887" >&2
    echo "  got: $out" >&2
    exit 1
  fi
  echo "PASS [cli_output_long_flag]"

  run_cli_fail_case cli_unknown_option "unknown option --bogus" --bogus examples/fib.ts
  run_cli_fail_case cli_missing_output_value "-o expects a value" examples/fib.ts -o
}

run_case fib "5702887"
run_cli_smoke
run_case loop_sum "5050"
run_case while_count "10"
run_case for_infinite $'10\n24\n4\n25'
run_cc_warnfree_case for_infinite
run_fail_case for_nonbool_cond_fail examples/for_nonbool_cond_fail.ts "expected topaz_boolean, got topaz_number"

run_case ternary $'10\nno\n42\n-1\nneg\nzero\npos\n8\n77\n100\n1\n2\n9\n33\n-7'
run_cc_warnfree_case ternary
run_fail_case ternary_nonbool_cond_fail examples/ternary_nonbool_cond_fail.ts "expected topaz_boolean"
run_fail_case ternary_incompatible_branches_fail examples/ternary_incompatible_branches_fail.ts "branches have incompatible types"

run_case iife_contextual_return $'30\ntwo\n7\n5\n9\n0\n7'
run_cc_warnfree_case iife_contextual_return
run_fail_case iife_no_context_fail examples/iife_no_context_fail.ts "arrow function requires an explicit return type annotation"

run_case iife_closure_narrowing $'42\n30\n42\n10\n42\n3'
run_cc_warnfree_case iife_closure_narrowing
run_fail_case iife_closure_unnarrowed_fail examples/iife_closure_unnarrowed_fail.ts "narrow it first with"

run_case boolean_print $'true\nfalse\ntrue\ntrue'
run_case mod_check $'1\n1\n-1\n1.5'
run_case switch_check $'1699\n22'
run_case switch_case_block_exit $'10\n30\n99'
run_fail_case switch_case_block_fallthrough_fail examples/switch_case_block_fallthrough_fail.ts "case body must end with"
run_case number_format $'3.14\n0.30000000000000004\n1.5\n-1.5\n1e+21\n1e-7\n0.000001\n100000000000000000'
run_case number_to_string $'123\n0\n-12\n1e+21\n3.14\n0.30000000000000004\n42\nn=42\n4\n3'
run_fail_case number_to_string_arity_fail examples/number_to_string_arity_fail.ts "Number.toString expects no arguments"
run_fail_case number_unsupported_method_fail examples/number_unsupported_method_fail.ts "unsupported method '.toFixed' on topaz_number"
run_case string_basic $'hello, topaz!\n13\nabcdef\ntrue\ntrue\nwoof'
run_case array_basic $'3\n10\n30\n5\n40\n50\n99\n50\n4\n189\ntrue\nfalse\nalpha\ngamma\n3\n1\n7'
run_case array_nested $'1\n7\n2\n9\n2\n7\n1\n42\n2\n100'
run_case map_set_basic $'3\n2\ntrue\nfalse\n10\ntrue\n2\nfalse\n3\ntrue\nfalse\ntrue\n2\nfalse\nyes\nno\n2\ntrue\nfalse\ntrue\n50\n250\n490\n7'
run_case set_constructor_iterable $'3\ntrue\nfalse\n3\nfalse\ntrue\n4\ntrue\n2\ntrue\n1\ntrue'
run_case class_basic $'3\n4\n7\n30\n40\n99\n100\n555\n101\n557\n110\n575\nhello, topaz\nhello, topaz\n2'
run_case interface_basic $'circle\n36\nsquare\n25\n16\nrenamed\n6\n144\n8\n64\n4\n4'
run_case array_class_iface $'3\n1\n12\n12\n4\n99\n99\n3\n500\n2\nsquare\n9\ncircle\n16\n16\ncircle\n100\n0\n7\ncircle\n4'
run_case map_set_class_iface $'3\n2\n11\n11\ntrue\nfalse\n2\nfalse\n2\nsquare\n9\ncircle\n100\ncircle\n16\n2\ntrue\ntrue\nfalse\n1\nfalse\n2\ntrue\ntrue\nfalse\n1\nfalse\n60\n99\n1'
run_case generic_fn $'42\n7\nhi\nyo\ntrue\nfalse\n10\n30\nalpha\ngamma\ntwo\n2\n1\n99\nsolo\n1\n123\nzzz\n1\n777\n555'
run_case generic_class $'42\n42\n99\nhello\ntrue\n1\none\n3\n20\n99\nhello'
run_case try_catch_basic $'boom\n1\nnegative\n42\n10\n7\n100\n9\nrewrapped\n2\n0\n999'
run_case try_return $'10\n-1\n3\n99\n107\n10\nboom'
run_case try_finally $'try-normal\nfinally-normal\nnormal\ntry-throw\nfinally-throw\nboom\ntry-override\nfinally-override\ncleanup'
run_case try_finally_return $'try-value\nfinally-value\n5\ntry-void\nfinally-void\nfinally-ret-throw\nret-boom'
run_case try_catch_finally $'try-normal\nfinally-normal\nnormal\nafter-normal\ntry-caught\ncatch-caught\ntry boom\nfinally-caught\nafter-caught\ntry-catch-throw\noriginal\nfinally-catch-throw\ncatch throw\ntry-callee-throw\nouter\nfinally-callee-throw\ncallee throw\ntry-finally-override\nhandled\nfinally-override\nfinally throw'
run_case try_finally_break_continue $'1\n101\n201\n102\n3\n103\n203\n104\n4\n401\n302\n402\n502\n403\n422\n44\n21'
run_fail_case try_break_fail examples/try_break_fail.ts "\`break\` inside a \`try\` body is unsupported"
run_fail_case try_finally_return_in_finally_fail examples/try_finally_return_in_finally_fail.ts "\`return\` inside a \`finally\` block is unsupported"
run_fail_case try_finally_nested_return_fail examples/try_finally_nested_return_fail.ts "nested return through multiple finally cleanup contexts is unsupported"
run_fail_case try_catch_finally_return_fail examples/try_catch_finally_return_fail.ts "\`return\` inside a \`try/catch/finally\` try body is unsupported"
run_fail_case try_catch_finally_catch_return_fail examples/try_catch_finally_catch_return_fail.ts "\`return\` inside a \`try/catch/finally\` catch body is unsupported"
run_fail_case try_catch_finally_break_fail examples/try_catch_finally_break_fail.ts "\`break\` inside a \`try/catch/finally\` try body is unsupported"
run_fail_case try_finally_switch_continue_fail examples/try_finally_switch_continue_fail.ts "\`continue\` inside \`switch\` is unsupported"

run_case optional_basic $'false\ntrue\ntrue\ntrue\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue'
run_case optional_narrow $'10\n0\n10\n-1\n10\n0\n16\n7\n20\n99'
run_case optional_map_get $'10\n-1\n7\n0\nalpha\nabsent\n21\n-777'

run_case dunion_basic $'12\n9\ncircle\nsquare\ncircle\nsquare\n5\n7'
run_case dunion_common_field $'num a@0 num(42)\nop b@3 op(+)\neof c@5 eof\nb=3'
run_case compound_narrow $'false\ntrue\nfalse\ntrue\ntrue\nfalse\nfalse\ntrue\nfalse\ntrue\nfalse\nfalse'
run_case compound_carry_narrow $'(\n<mismatch>\n<mismatch>\nparen-(\n<other>\n<other>'
run_case dunion_init_narrow $'foo@3\n42@7\nident foo\nnum 42'
run_case dunion_widen $'12\n9\n12\n9'
run_case dunion_optional_object_literal $'ident x\npair a,b\nnone'
run_case string_literal_union $'stop\nskip\nstop'

run_case catch_unknown $'kaboom\n42\nfizz\nrethrow\ntrue\n99\nfalse'

run_case arena_stress $'1000\n0\n999\n1000\n42\n1200\n500\ntrue\n500'

run_case template_literal $'hello, topaz!\ntopaz is 42\nflag=true\ntopaz\ntopaz/42\n42true\npi=3.14\nsum=0.30000000000000004\nbig=1e+21\ntiny=1e-7\ntwice(42)=84\nlen(topaz)=5\nn+1=43\nanswer=7\n?=7\n(3, 4)\nnorm=25\nq="topaz"\ntab\there\n[0][1][2][3][4]'

run_case bigint_value_skeleton ""
run_case bigint_arithmetic $'579\n333\n-333\n56088\n-123\n123:-456\ntrue\ntrue\ntrue\ntrue'
run_case bigint_equality $'true\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue'
run_case bigint_ordering $'true\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue'
run_case bigint_unary_negation $'-12\n34\n0\ntrue\n-123456789012345678901234567890\n42'
run_case bigint_add_sub_prelude $'579\n333\n-333\n0\n18446744073709551617\n18446744073709551613\n123456789000000000\n42'
run_case bigint_mul_prelude $'0\n-408\n408\n56088\n18446744065119617025\n281474976710657'
run_case bigint_decimal_parse_prelude $'0\n12345\n340282366920938463463374607431768211455\n340282366920938463463374607431768211456\n121932631112635269'
run_case bigint_large_limb $'123456789012345678901234567890\n1111111110111111111011111111100\n864197532086419753208641975320\n1234567890123456789012345678900\ntrue\ntrue\n123456789012345678901234567890:987654321098765432109876543210'
run_case bigint_sign_zero $'0\n0\n0\ntrue\ntrue\ntrue\ntrue\n0\n30\n-30'
run_fail_case bigint_mixed_arithmetic_fail examples/bigint_mixed_arithmetic_fail.ts "mixed number/bigint operators are unsupported"
run_fail_case bigint_mixed_left_arithmetic_fail examples/bigint_mixed_left_arithmetic_fail.ts "mixed number/bigint operators are unsupported"
run_fail_case bigint_division_fail examples/bigint_division_fail.ts "bigint operator '/' is unsupported"
run_fail_case bigint_modulo_fail examples/bigint_modulo_fail.ts "bigint operator '%' is unsupported"
run_fail_case bigint_bitwise_fail examples/bigint_bitwise_fail.ts "expected expression"
run_fail_case bigint_shift_fail examples/bigint_shift_fail.ts "expected expression"
run_fail_case bigint_string_concat_fail examples/bigint_string_concat_fail.ts "string concatenation involving bigint is unsupported"
run_fail_case bigint_condition_fail examples/bigint_condition_fail.ts "expected topaz_boolean, got topaz_bigint"
run_fail_case bigint_non_decimal_fail examples/bigint_non_decimal_fail.ts "only decimal bigint literals are supported"
run_fail_case bigint_array_deferred_fail examples/bigint_array_deferred_fail.ts "no Array monomorph for element type topaz_bigint"
run_fail_case bigint_map_deferred_fail examples/bigint_map_deferred_fail.ts "no Map monomorph for key=topaz_string, value=topaz_bigint"
run_fail_case bigint_set_deferred_fail examples/bigint_set_deferred_fail.ts "no Set monomorph for element type topaz_bigint"
run_fail_case runtime_prelude_bigint_buffer_hidden_fail examples/runtime_prelude_bigint_buffer_hidden_fail.ts "unknown identifier '__topaz_bigint_buffer_new'"
run_fail_case regexp_literal_deferred_fail examples/regexp_literal_deferred_fail.ts "expected expression"
run_fail_case regexp_constructor_deferred_fail examples/regexp_constructor_deferred_fail.ts "\`new RegExp\` is unsupported"
run_fail_case regexp_string_test_deferred_fail examples/regexp_string_test_deferred_fail.ts "unsupported method '.test' on topaz_string"
run_tsc_bridge_fail_case async_function_deferred_fail examples/async_function_deferred_fail.ts "async functions are unsupported"
run_tsc_bridge_fail_case await_expression_deferred_fail examples/await_expression_deferred_fail.ts "unsupported expression AwaitExpression"
run_fail_case promise_resolve_deferred_fail examples/promise_resolve_deferred_fail.ts "unknown identifier 'Promise'"
run_fail_case for_await_deferred_fail examples/for_await_deferred_fail.ts "expected '('"

run_case for_of_array $'15\n-7\n0\n2\n9\n3\nalpha\nbeta\ngamma\n102\n101\n103\nsquare\ncircle\n25\ntrue\n4'

run_case for_of_set $'15\n15\n15\n0\n100\n14\n7\n60\n2\n387\n115'

run_case for_of_map_values $'60\n6\n60\n0\n6\n50\n13\n400\n60\n20\n129'

run_case for_of_entries $'140\n606\n116\n220\n20\n40\n0\n402\n141\n63\n30\n30\n12\n366'

run_case iterator_basic $'60\n3\n6\n6\n300\nfalse\n17\n3\n60\n6'

run_case non_null_and_coalesce $'10\n25\ntrue\n7\nalpha\n10\n-1\n20\n110\n7\n99\nalpha\ndefault\nhello\n?\n20\n-1\n20'

run_case optional_chain $'10\n-1\nalpha\n(none)\nalpha\n(none)\n30\n0\n5\n-1\ngreeting\n(none)\n7\n0\n100\n300\n-1\n2\n-1\n-1\n20\nalpha'

run_case arrow_basic $'42\n42\ntrue\nfalse\n7\nhello, topaz\n100\n6\n7\n11\n12\n50\n75\n36\n100\n17\n123\ntopaz:ok'
run_case arrow_this_capture $'15\n25\n21\n31'
run_fail_case this_outside_class_fail examples/this_outside_class_fail.ts "\`this\` is only valid inside class methods or constructors"

run_case array_method_map $'2\n4\n6\n3\n9\n2\n4\nn=1\nn=3\ntrue\nfalse\n10\n30\n100\n300\n300\n0\n20\n40\n101\n301\n10\n21\n32\n1\n3\n5'

run_case array_method_filter $'3\n1\n5\n2\n2\n4\n2\n1\n2\n3\nalpha\ndelta\n3\ntrue\ntrue\n2\n4\n2\n50\n100\n0\n0\n3\n2\n4\n3\n10\n50'

run_case array_method_includes $'true\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\ntrue\ntrue\nfalse\ntrue\nfalse\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\nfalse'

run_case array_method_slice $'3\n20\n40\n3\n30\n50\n5\n10\n50\n2\n40\n50\n4\n10\n40\n2\n30\n40\n0\n0\n2\n40\n50\n0\n2\nbeta\ngamma\n1\n99\n777\n2\n20\n30\n2\n20\n30\n3\n4\n99'

run_case array_method_join $'1,2,3\n5\n1, 2, 3\n7\n123\n3\n1 -> 2 -> 3\nalpha-beta-gamma\nalpha,beta,gamma\ntrue,false,true\ntrue | false | true\n\n0\n0\n42\n2\n3.14,0,-1.5\n2,4,6\n2-3\n2,3\n[1,2,3]\n1:2:3\n10:20'

run_module_case module_basic examples/module_basic_main.ts $'7\n11\n12\n12\n25\n25'
run_module_case module_function_collision examples/module_function_collision_main.ts $'15\n10\n17'
run_fail_case runtime_prelude_hidden_fail examples/runtime_prelude_hidden_fail.ts "unknown identifier '__topaz_runtime_prelude_init'"
run_fail_case runtime_prelude_boolean_to_string_hidden_fail examples/runtime_prelude_boolean_to_string_hidden_fail.ts "unknown identifier '__topaz_boolean_to_string'"
run_fail_case runtime_prelude_starts_with_hidden_fail examples/runtime_prelude_starts_with_hidden_fail.ts "unknown identifier '__topaz_string_starts_with'"
run_fail_case runtime_prelude_ends_with_hidden_fail examples/runtime_prelude_ends_with_hidden_fail.ts "unknown identifier '__topaz_string_ends_with'"
run_fail_case runtime_prelude_trim_start_hidden_fail examples/runtime_prelude_trim_start_hidden_fail.ts "unknown identifier '__topaz_string_trim_start'"
run_fail_case runtime_prelude_path_extname_hidden_fail examples/runtime_prelude_path_extname_hidden_fail.ts "unknown identifier '__topaz_path_extname'"
run_fail_case runtime_prelude_path_dirname_hidden_fail examples/runtime_prelude_path_dirname_hidden_fail.ts "unknown identifier '__topaz_path_dirname'"
run_fail_case runtime_prelude_path_basename_hidden_fail examples/runtime_prelude_path_basename_hidden_fail.ts "unknown identifier '__topaz_path_basename'"
run_fail_case runtime_prelude_path_basename_ext_hidden_fail examples/runtime_prelude_path_basename_ext_hidden_fail.ts "unknown identifier '__topaz_path_basename_ext'"
run_fail_case runtime_prelude_string_eq_hidden_fail examples/runtime_prelude_string_eq_hidden_fail.ts "unknown identifier '__topaz_string_eq'"
run_fail_case runtime_prelude_path_join_hidden_fail examples/runtime_prelude_path_join_hidden_fail.ts "unknown identifier '__topaz_path_join_segments'"
run_fail_case runtime_prelude_path_resolve_hidden_fail examples/runtime_prelude_path_resolve_hidden_fail.ts "unknown identifier '__topaz_path_resolve_segments'"
run_fail_case runtime_prelude_panic_hidden_fail examples/runtime_prelude_panic_hidden_fail.ts "unknown identifier '__topaz_panic'"
run_fail_case runtime_prelude_parse_int_hidden_fail examples/runtime_prelude_parse_int_hidden_fail.ts "unknown identifier '__topaz_parse_int'"
run_fail_case runtime_prelude_string_from_char_code_hidden_fail examples/runtime_prelude_string_from_char_code_hidden_fail.ts "unknown identifier '__topaz_string_from_char_code'"
run_fail_case runtime_prelude_string_slice_hidden_fail examples/runtime_prelude_string_slice_hidden_fail.ts "unknown identifier '__topaz_string_slice'"
run_fail_case runtime_prelude_string_concat_hidden_fail examples/runtime_prelude_string_concat_hidden_fail.ts "unknown identifier '__topaz_string_concat'"
run_fail_case runtime_prelude_string_repeat_hidden_fail examples/runtime_prelude_string_repeat_hidden_fail.ts "unknown identifier '__topaz_string_repeat'"
run_fail_case runtime_prelude_array_slice_normalize_hidden_fail examples/runtime_prelude_array_slice_normalize_hidden_fail.ts "unknown identifier '__topaz_slice_normalize'"
run_fail_case runtime_prelude_string_char_code_at_hidden_fail examples/runtime_prelude_string_char_code_at_hidden_fail.ts "unknown identifier '__topaz_string_char_code_at'"
run_fail_case runtime_prelude_string_byte_at_hidden_fail examples/runtime_prelude_string_byte_at_hidden_fail.ts "unknown identifier '__topaz_string_byte_at'"
run_fail_case runtime_prelude_string_buffer_hidden_fail examples/runtime_prelude_string_buffer_hidden_fail.ts "unknown identifier '__topaz_string_buffer_new'"
run_fail_case runtime_prelude_bigint_eq_hidden_fail examples/runtime_prelude_bigint_eq_hidden_fail.ts "unknown identifier '__topaz_bigint_eq'"
run_fail_case runtime_prelude_bigint_cmp_hidden_fail examples/runtime_prelude_bigint_cmp_hidden_fail.ts "unknown identifier '__topaz_bigint_cmp'"
run_fail_case runtime_prelude_bigint_neg_hidden_fail examples/runtime_prelude_bigint_neg_hidden_fail.ts "unknown identifier '__topaz_bigint_neg'"
run_fail_case runtime_prelude_bigint_add_hidden_fail examples/runtime_prelude_bigint_add_hidden_fail.ts "unknown identifier '__topaz_bigint_add'"
run_fail_case runtime_prelude_bigint_sub_hidden_fail examples/runtime_prelude_bigint_sub_hidden_fail.ts "unknown identifier '__topaz_bigint_sub'"
run_fail_case runtime_prelude_bigint_mul_hidden_fail examples/runtime_prelude_bigint_mul_hidden_fail.ts "unknown identifier '__topaz_bigint_mul'"
run_fail_case runtime_prelude_bigint_from_decimal_hidden_fail examples/runtime_prelude_bigint_from_decimal_hidden_fail.ts "unknown identifier '__topaz_bigint_from_decimal'"
run_fail_case runtime_prelude_bigint_to_string_hidden_fail examples/runtime_prelude_bigint_to_string_hidden_fail.ts "unknown identifier '__topaz_bigint_to_string'"
run_fail_case module_function_duplicate_fail examples/module_function_duplicate_fail.ts "redeclaration of function 'sameName'"
run_module_case module_side_effect examples/module_side_effect_main.ts "123"
run_module_case module_global_state examples/module_global_state_main.ts $'3\n5\nhi!'
run_fail_case module_cycle examples/module_cycle_a.ts "circular import detected"
run_module_case package_lookup_basic examples/fixtures/package_lookup/basic.ts $'14\n27\n31'
run_module_case package_lookup_ancestor examples/fixtures/package_lookup/app/src/main.ts "114"
run_fail_case package_lookup_missing examples/fixtures/package_lookup/missing_package_fail.ts "cannot resolve package 'missing-pkg'"
run_fail_case package_lookup_subpath examples/fixtures/package_lookup/subpath_fail.ts "package subpath import 'topaz-pkg/subpath' is unsupported"
run_fail_case package_lookup_topaz_escape examples/fixtures/package_lookup/topaz_escape_fail.ts "entry '../escape.ts' must start with './'"
run_fail_case package_lookup_topaz_cjs examples/fixtures/package_lookup/topaz_cjs_fail.ts "entry './dist/index.cjs' must end in .ts or .js"
run_fail_case package_lookup_main_exports_only examples/fixtures/package_lookup/main_exports_only_fail.ts "main/exports are unsupported"
run_fail_case import_type_clause_fail examples/import_type_clause_fail.ts "\`import type\` is unsupported"
run_fail_case import_type_specifier_fail examples/import_type_specifier_fail.ts "\`import type\` is unsupported"
run_fail_case strict_field_init_fail examples/strict_field_init_fail.ts "is not definitely assigned in the constructor"
run_fail_case optional_field_access_fail examples/optional_field_access_fail.ts "cannot access '.v' on union type"
run_fail_case dunion_field_access_fail examples/dunion_field_access_fail.ts "cannot access '.radius' on discriminated union"
run_fail_case dunion_common_field_write_fail examples/dunion_common_field_write_fail.ts "cannot assign to '.pos' on discriminated union"
run_fail_case dunion_init_narrow_let_fail examples/dunion_init_narrow_let_fail.ts "cannot access '.text' on discriminated union"
run_fail_case dunion_widen_fail examples/dunion_widen_fail.ts "is not a variant of"
run_fail_case dunion_optional_object_literal_fail examples/dunion_optional_object_literal_fail.ts 'has kind="bogus"'
run_fail_case string_literal_union_mismatch_fail examples/string_literal_union_mismatch_fail.ts 'expected topaz_union_string_literal_break_or_string_literal_continue, got string literal "return"'
run_fail_case compound_narrow_no_left_fail examples/compound_narrow_no_left_fail.ts "has no member 'op'"
run_fail_case compound_carry_indeterminate_fail examples/compound_carry_indeterminate_fail.ts "cannot access '.op' on discriminated union"
run_fail_case catch_unknown_unnarrowed_fail examples/catch_unknown_unnarrowed_fail.ts "cannot access '.msg' on \`unknown\`"
run_fail_case template_literal_unsupported_fail examples/template_literal_unsupported_fail.ts "template literal substitution must be number / boolean / string"
run_fail_case for_of_map_fail examples/for_of_map_fail.ts "for-of requires an Array<T>"
run_fail_case for_of_destructuring_fail examples/for_of_destructuring_fail.ts "destructuring binding in for-of is only supported for .entries() on Map / Set"
run_fail_case for_of_map_entries_fail examples/for_of_map_entries_fail.ts "for-of over .entries() requires destructuring binding"
run_fail_case map_entries_outside_for_of_fail examples/map_entries_outside_for_of_fail.ts "Map.entries() is only allowed as the right-hand side"
run_fail_case set_constructor_mismatch_fail examples/set_constructor_mismatch_fail.ts "Set() constructor element type mismatch"
run_fail_case set_constructor_non_iterable_fail examples/set_constructor_non_iterable_fail.ts "Set() constructor source must be an Array<T>, Set<T>, or Iterator<T>"
run_fail_case set_constructor_too_many_fail examples/set_constructor_too_many_fail.ts "Set() constructor expects at most one argument"
run_fail_case map_constructor_iterable_fail examples/map_constructor_iterable_fail.ts "Map() constructor arguments are unsupported"
run_fail_case iterator_in_container_fail examples/iterator_in_container_fail.ts "no Array monomorph for element type topaz_iter_number"
run_fail_case non_null_non_optional_fail examples/non_null_non_optional_fail.ts "non-null assertion (\`!\`) requires a \`T | undefined\` operand"
run_fail_case coalesce_non_optional_fail examples/coalesce_non_optional_fail.ts "\`??\` requires the left operand to be \`T | undefined\`"
run_fail_case optional_chain_non_optional_fail examples/optional_chain_non_optional_fail.ts "optional chain \`?.\` requires a \`T | undefined\` receiver"
run_fail_case optional_call_fail examples/optional_call_fail.ts "optional call \`f?.()\` is unsupported"
run_fail_case arrow_unannotated_fail examples/arrow_unannotated_fail.ts "arrow function parameter requires a type annotation"
run_case arrow_infer_return $'42\nxtopaz\nvoid-body\n7\n9'
run_fail_case arrow_block_infer_return_fail examples/arrow_block_infer_return_fail.ts "arrow function requires an explicit return type annotation"
run_case arrow_nested_fn_type $'30\n12\n7'
run_case array_of_fn $'6\n50\n2\n-95\n13\n16\n60\n3\n101\n102\n103\n19\n49\n0\nn=7\nn*2=14'
run_fail_case map_of_fn_fail examples/map_of_fn_fail.ts "no Map monomorph for key=topaz_string, value=topaz_fn_"
run_fail_case set_of_fn_fail examples/set_of_fn_fail.ts "no Set monomorph for element type topaz_fn_"
run_fail_case array_map_callback_arity_fail examples/array_map_callback_arity_fail.ts "Array.map callback arity"
run_fail_case array_map_callback_param_mismatch_fail examples/array_map_callback_param_mismatch_fail.ts "callback parameter type"
run_fail_case array_map_index_param_mismatch_fail examples/array_map_index_param_mismatch_fail.ts "callback parameter type"
run_fail_case array_map_block_no_annotation_fail examples/array_map_block_no_annotation_fail.ts "block-bodied arrow callback requires an explicit return type annotation"
run_fail_case array_filter_callback_non_boolean_fail examples/array_filter_callback_non_boolean_fail.ts "Array.filter callback must return boolean"
run_fail_case array_includes_type_mismatch_fail examples/array_includes_type_mismatch_fail.ts "type mismatch: expected topaz_number, got topaz_string"
run_fail_case array_includes_from_index_fail examples/array_includes_from_index_fail.ts "Array.includes \`fromIndex\` argument is unsupported"
run_fail_case array_slice_arg_type_fail examples/array_slice_arg_type_fail.ts "Array.slice argument must be number"
run_fail_case array_slice_too_many_args_fail examples/array_slice_too_many_args_fail.ts "Array.slice expects at most two arguments"
run_fail_case array_join_class_elem_fail examples/array_join_class_elem_fail.ts "Array.join is unsupported for element type"
run_fail_case array_join_sep_type_fail examples/array_join_sep_type_fail.ts "Array.join separator must be string"
run_fail_case array_join_too_many_args_fail examples/array_join_too_many_args_fail.ts "Array.join expects at most one argument"

run_case spread_basic $'3\n6\n3\n4\n4\n100\n6\n115\n2\n15\n0\n10\n3\n14\n6\n5\n159\n4\n10\n3\n9\n7'
run_case array_push_spread $'4\n10\n8\n36\n4\n38\n4\n10'
run_fail_case spread_call_args_fail examples/spread_call_args_fail.ts "spread in call arguments is unsupported"
run_fail_case spread_new_args_fail examples/spread_new_args_fail.ts "spread in \`new\` arguments is unsupported"
run_fail_case spread_set_fail examples/spread_set_fail.ts "spread source in array literal must be an Array<T>"
run_fail_case spread_elem_mismatch_fail examples/spread_elem_mismatch_fail.ts "spread element type topaz_string does not match destination element type topaz_number"
run_fail_case spread_non_array_fail examples/spread_non_array_fail.ts "spread source in array literal must be an Array<T>"
run_fail_case array_push_spread_mismatch_fail examples/array_push_spread_mismatch_fail.ts "spread argument element type topaz_string does not match Array.push element type topaz_number"
run_fail_case array_push_spread_non_array_fail examples/array_push_spread_non_array_fail.ts "spread argument to Array.push must be an Array<T>, got topaz_number"

run_case access_modifier $'13\n16\n3\n100\n103\n7\n8\n15\nalpha\n101\n102\ntoy\n42'
run_fail_case access_modifier_static_fail examples/access_modifier_static_fail.ts "class member modifier 'StaticKeyword' is unsupported"

run_case void_return $'hello\nhello\non\n7\n0\n0\n[log] via iface'
run_case void_fn_type $'3\n10\ndone'
run_case never_return_annotation alive
run_fail_case void_return_bare_in_nonvoid_fail examples/void_return_bare_in_nonvoid_fail.ts "\`return;\` is only allowed in a void-returning function"
run_fail_case void_return_value_in_void_fail examples/void_return_value_in_void_fail.ts "\`return <expr>;\` is not allowed in a void-returning function"
run_fail_case void_value_assign_fail examples/void_value_assign_fail.ts "\`void\` is only allowed as a function / method return type"
run_fail_case void_param_fail examples/void_param_fail.ts "\`void\` is only allowed as a function / method return type"
run_fail_case void_array_fail examples/void_array_fail.ts "\`void\` is only allowed as a function / method return type"
run_fail_case void_fn_type_fail examples/void_fn_type_fail.ts "used in fn-type parameter"
run_fail_case void_fn_expr_body_fail examples/void_fn_expr_body_fail.ts "void-returning arrows require block bodies"
run_fail_case void_fn_call_value_fail examples/void_fn_call_value_fail.ts "cannot use a \`void\` value"
run_case never_call_carry_narrow $'7\n11\n13'
run_fail_case never_call_carry_narrow_void_fail examples/never_call_carry_narrow_void_fail.ts "cannot access '.value' on union type"
run_fail_case never_call_value_fail examples/never_call_value_fail.ts "cannot use a \`void\` value"
run_fail_case array_map_void_callback_fail examples/array_map_void_callback_fail.ts "Array.map callback cannot return \`void\`"

run_case field_initializer $'0\ntrue\ndefault\n2\n2\n2\n0\n0\n0\n(unset)\n1\n10\nhi!\n100\nalpha\n100\n0\n5\n7\n16\n2\n11\n22\n101\nDEFAULT:ok'
run_fail_case field_initializer_type_mismatch_fail examples/field_initializer_type_mismatch_fail.ts "type mismatch: expected topaz_number, got topaz_string"
run_fail_case field_initializer_partial_fail examples/field_initializer_partial_fail.ts "has fields but no constructor"

run_case type_alias $'8\nok\ntrue\n100\n3\n2\n2\n3\n20\n0\n0\n25\n2\n42\n10\n7\n12\n42\n-1\n1024\n99\n6'
run_fail_case type_alias_generic_fail examples/type_alias_generic_fail.ts "generic type alias 'Pair' is unsupported"
run_fail_case type_alias_circular_fail examples/type_alias_circular_fail.ts "circular type alias 'A'"
run_fail_case type_alias_name_conflict_fail examples/type_alias_name_conflict_fail.ts "type alias 'Foo' collides with a class of the same name"
run_fail_case type_alias_as_value_fail examples/type_alias_as_value_fail.ts "unknown identifier 'Count'"
run_case type_alias_recursive $'6\n1\n2\n3\n42\n-42\n42\nnumber\nMap\n2\nnumber\nstring\n30\n70\n1\n16'
run_fail_case type_alias_self_ref_fail examples/type_alias_self_ref_fail.ts "circular type alias 'A'"
run_fail_case type_alias_array_self_ref_fail examples/type_alias_array_self_ref_fail.ts "circular type alias 'Foo'"

run_case object_literal $'3\n4\n7\n30\n40\n3\n4\n100\n2\nalice\n30\ntrue\n5\nok\nfirst\n7\n8\n5\n3\n15\n2\n10\n-1\n42\ndeep\n0\n0\n5\n0\n30\nb\n3\n2\nhello\nworld\n5\n99'
run_fail_case object_literal_no_context_fail examples/object_literal_no_context_fail.ts "requires a contextually typed anonymous-class target"
run_fail_case object_literal_missing_field_fail examples/object_literal_missing_field_fail.ts "missing required property: b"
run_fail_case object_literal_extra_field_fail examples/object_literal_extra_field_fail.ts "property 'c' does not exist"
run_case object_literal_shorthand $'1\n2\n1\n2\n10\n2\nalice\n30\n42\nhot\n7\n99'
run_fail_case object_literal_method_shorthand_fail examples/object_literal_method_shorthand_fail.ts "no method shorthand, getter / setter, spread"
run_fail_case object_literal_spread_fail examples/object_literal_spread_fail.ts "no method shorthand, getter / setter, spread"
run_fail_case object_literal_type_empty_fail examples/object_literal_type_empty_fail.ts "empty object literal type"
run_fail_case object_literal_type_method_fail examples/object_literal_type_method_fail.ts "only supports plain property signatures"
run_fail_case object_literal_type_dup_field_fail examples/object_literal_type_dup_field_fail.ts "duplicate property 'a' in object literal type"
run_fail_case object_literal_type_mismatch_fail examples/object_literal_type_mismatch_fail.ts "expected topaz_number, got topaz_string"

run_case optional_param $'topaz\ntopaz!\n0007\n07\n****7\n12\n1\nanon\n2\nnamed\na:80\nb:9000\n0\n5\n15\n10\n35\nhi\nhi[x]\n1\n2\nnone\ny\ndefault\nonly\nfb\np'
run_fail_case optional_param_non_trailing_fail examples/optional_param_non_trailing_fail.ts "a required parameter cannot follow an optional parameter"
run_fail_case optional_param_too_few_fail examples/optional_param_too_few_fail.ts "expects 2..3 argument(s), got 1"
run_fail_case optional_param_too_many_fail examples/optional_param_too_many_fail.ts "expects 1..2 argument(s), got 3"
run_fail_case optional_param_unnarrowed_fail examples/optional_param_unnarrowed_fail.ts "expected topaz_number, got topaz_union_number_or_undefined"
run_fail_case optional_field_unnarrowed_fail examples/optional_field_unnarrowed_fail.ts "expected topaz_number, got topaz_union_number_or_undefined"
run_fail_case optional_param_type_mismatch_fail examples/optional_param_type_mismatch_fail.ts "expected topaz_union_number_or_undefined, got topaz_string"

run_case object_destructuring $'3\n4\n7\n7\ntrue\nhi\n5\n9\n100\n200\n1\n3\nfirst\n10\n99\n6\n3\n4\n30\nb\n42\n5\n99\n8\n7\n42\n12\n14\n50\n60'
run_fail_case object_destructuring_rename_fail examples/object_destructuring_rename_fail.ts "property rename / nested pattern"
run_fail_case object_destructuring_default_fail examples/object_destructuring_default_fail.ts "default value"
run_fail_case object_destructuring_rest_fail examples/object_destructuring_rest_fail.ts "rest element"
run_fail_case object_destructuring_nested_fail examples/object_destructuring_nested_fail.ts "property rename / nested pattern"
run_fail_case object_destructuring_annotation_fail examples/object_destructuring_annotation_fail.ts "type annotation on object destructuring pattern is unsupported"
run_fail_case object_destructuring_unknown_field_fail examples/object_destructuring_unknown_field_fail.ts "has no field 'missing'"
run_fail_case object_destructuring_method_fail examples/object_destructuring_method_fail.ts "is a method of 'Counter', not a field"
run_fail_case object_destructuring_non_class_fail examples/object_destructuring_non_class_fail.ts "object destructuring requires a class or interface receiver"
run_fail_case object_destructuring_empty_fail examples/object_destructuring_empty_fail.ts "empty object destructuring pattern"

run_case array_of_dunion $'3\n31\n21\n3\n3\n4\n6\nsquare\n6\n99\n2\ntrue\nfalse\n1\n1\ntrue\nfalse\n3\n187'

run_case module_const_hoist $'true\nfalse\ntrue\nfalse\ntrue\ntrue\n51\n-1\n42\n70\n3\n5\n100\n11\n4\n2\n1500'
run_fail_case module_const_hoist_let_fail examples/module_const_hoist_let_fail.ts "unknown identifier 'counter'"
run_fail_case module_const_hoist_nonscalar_fail examples/module_const_hoist_nonscalar_fail.ts "unknown identifier 'GREETING'"

run_case string_method $'5\n104\n101\n101\n111\ntrue\ntrue\nell\n3\nllo\n3\nhello\n5\nlo\nhell\nll\n0\ntrue\nlo\n0\nbcd\n6\nbcdabcdef\nace\n101\n119\nrld\n122\nabcdef'
run_fail_case string_char_code_at_arity_fail examples/string_char_code_at_arity_fail.ts "String.charCodeAt expects exactly one argument"
run_fail_case string_char_code_at_arg_type_fail examples/string_char_code_at_arg_type_fail.ts "String.charCodeAt argument must be number"
run_fail_case string_slice_arg_type_fail examples/string_slice_arg_type_fail.ts "String.slice argument must be number"
run_fail_case string_slice_too_many_args_fail examples/string_slice_too_many_args_fail.ts "String.slice expects at most two arguments"
run_case string_starts_ends_with $'true\nfalse\ntrue\nfalse\ntrue\ntrue\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\nrelative\nrelative\nbare\nmodule\nmodule\nother'
run_fail_case string_starts_with_arity_fail examples/string_starts_with_arity_fail.ts "String.startsWith expects exactly one argument"
run_fail_case string_starts_with_arg_type_fail examples/string_starts_with_arg_type_fail.ts "String.startsWith argument must be string, got topaz_number"
run_fail_case string_ends_with_arity_fail examples/string_ends_with_arity_fail.ts "String.endsWith expects exactly one argument"
run_fail_case string_ends_with_arg_type_fail examples/string_ends_with_arg_type_fail.ts "String.endsWith argument must be string, got topaz_number"
run_case string_repeat $'xxx\n3\n0\ntrue\naa\npre-haha\nqq'
run_fail_case string_repeat_arity_fail examples/string_repeat_arity_fail.ts "String.repeat expects exactly one argument"
run_fail_case string_repeat_arg_type_fail examples/string_repeat_arg_type_fail.ts "String.repeat argument must be number, got topaz_string"
run_case string_trim_start $'topaz\n5\nok\n2\nready\n5\n0\ntrue\npre-value\nbc\nxxx\nname'
run_fail_case string_trim_start_arity_fail examples/string_trim_start_arity_fail.ts "String.trimStart expects no arguments"
run_fail_case string_unsupported_method_fail examples/string_unsupported_method_fail.ts "unsupported method '.indexOf' on topaz_string"

run_case string_from_char_code $'A\na\n0\nz\nB\n1\n72\nHello\n5\nA\nz\nmark=!\n1\n1\n127\nA\nA\nD\nZ\nabcde'
run_fail_case string_from_char_code_arity_fail examples/string_from_char_code_arity_fail.ts "String.fromCharCode expects exactly one argument"
run_fail_case string_from_char_code_too_many_args_fail examples/string_from_char_code_too_many_args_fail.ts "String.fromCharCode expects exactly one argument"
run_fail_case string_from_char_code_arg_type_fail examples/string_from_char_code_arg_type_fail.ts "String.fromCharCode argument must be number"
run_fail_case string_static_unknown_fail examples/string_static_unknown_fail.ts "unsupported static method 'String.fromCodePoint'"
run_fail_case string_as_value_fail examples/string_as_value_fail.ts "unknown identifier 'String'"

run_case dunion_object_literal $'3\nident:foo\nnumber:42\neof\nident:bar\nnumber:7\nident:baz\nnumber:99\neof\neof\nident:hello\n4\nident:a\nnumber:1\nident:b\neof\nident:lone\neof\nident:next\nnumber:555\n3\ntrue\nfalse'
run_fail_case dunion_object_literal_missing_kind_fail examples/dunion_object_literal_missing_kind_fail.ts "must include discriminator property 'kind"
run_fail_case dunion_object_literal_kind_not_literal_fail examples/dunion_object_literal_kind_not_literal_fail.ts "must be a plain string literal to select"
run_fail_case dunion_object_literal_unknown_variant_fail examples/dunion_object_literal_unknown_variant_fail.ts "no variant of"
run_fail_case dunion_object_literal_concrete_variant_fail examples/dunion_object_literal_concrete_variant_fail.ts "concrete class variant requires"

run_case node_fs_read_file $'hello topaz\n\n12\n104\nhello\n12\n[hello]\nfirst5=hello\ntrue'
run_fail_case node_fs_read_file_arity_fail examples/node_fs_read_file_arity_fail.ts "readFileSync expects exactly two arguments"
run_fail_case node_fs_read_file_missing_encoding_fail examples/node_fs_read_file_missing_encoding_fail.ts "readFileSync expects exactly two arguments"
run_fail_case node_fs_read_file_too_many_args_fail examples/node_fs_read_file_too_many_args_fail.ts "readFileSync expects exactly two arguments"
run_fail_case node_fs_read_file_path_type_fail examples/node_fs_read_file_path_type_fail.ts "readFileSync path argument must be string"
run_fail_case node_fs_read_file_encoding_not_literal_fail examples/node_fs_read_file_encoding_not_literal_fail.ts "encoding argument must be the string literal"
run_fail_case node_fs_read_file_unknown_encoding_fail examples/node_fs_read_file_unknown_encoding_fail.ts "encoding argument must be \"utf8\""
run_fail_case node_fs_read_file_as_value_fail examples/node_fs_read_file_as_value_fail.ts "unknown identifier 'readFileSync'"
run_fail_case node_fs_unknown_named_import_fail examples/node_fs_unknown_named_import_fail.ts "unsupported named import 'unlinkSync'"
run_fail_case node_fs_namespace_import_fail examples/node_fs_namespace_import_fail.ts "namespace import of stdlib specifier 'node:fs'"
run_fail_case node_fs_rename_import_fail examples/node_fs_rename_import_fail.ts "import rename"

run_case node_fs_exists $'true\nfalse\ntrue\nfound\ntrue\nfalse\ntrue\ntrue'
run_fail_case node_fs_exists_arity_fail examples/node_fs_exists_arity_fail.ts "existsSync expects exactly one argument"
run_fail_case node_fs_exists_path_type_fail examples/node_fs_exists_path_type_fail.ts "existsSync path argument must be string"
run_fail_case node_fs_exists_as_value_fail examples/node_fs_exists_as_value_fail.ts "unknown identifier 'existsSync'"

run_case node_fs_write_file $'true\nhello topaz write\n\nshorter\n0\nvia fn\n\nhello topaz!'
run_fail_case node_fs_write_file_arity_fail examples/node_fs_write_file_arity_fail.ts "writeFileSync expects exactly two arguments"
run_fail_case node_fs_write_file_path_type_fail examples/node_fs_write_file_path_type_fail.ts "writeFileSync path argument must be string"
run_fail_case node_fs_write_file_content_type_fail examples/node_fs_write_file_content_type_fail.ts "writeFileSync content argument must be string"
run_fail_case node_fs_write_file_as_value_fail examples/node_fs_write_file_as_value_fail.ts "writeFileSync returns void and cannot be used as a value"

# cleanup any tree from a previous run so the "create from scratch" assertion is
# valid; an EBUSY / "Directory not empty" from a flaky filesystem must not abort
# the suite, the test itself is idempotent.
rm -rf /tmp/topaz_mkdir_test 2>/dev/null || true
run_case node_fs_mkdir $'true\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue'
run_fail_case node_fs_mkdir_arity_fail examples/node_fs_mkdir_arity_fail.ts "mkdirSync expects exactly two arguments"
run_fail_case node_fs_mkdir_path_type_fail examples/node_fs_mkdir_path_type_fail.ts "mkdirSync path argument must be string"
run_fail_case node_fs_mkdir_opts_not_object_fail examples/node_fs_mkdir_opts_not_object_fail.ts "options argument must be the literal"
run_fail_case node_fs_mkdir_opts_wrong_key_fail examples/node_fs_mkdir_opts_wrong_key_fail.ts "options property must be \`recursive: true\`"
run_fail_case node_fs_mkdir_opts_recursive_false_fail examples/node_fs_mkdir_opts_recursive_false_fail.ts "\`recursive\` must be the literal \`true\`"
run_fail_case node_fs_mkdir_opts_extra_prop_fail examples/node_fs_mkdir_opts_extra_prop_fail.ts "options literal must contain exactly one property"
run_fail_case node_fs_mkdir_as_value_fail examples/node_fs_mkdir_as_value_fail.ts "mkdirSync returns void and cannot be used as a value"

rm -rf /tmp/topaz_std_fs_test 2>/dev/null || true
run_case std_fs_basic $'true\nfalse\ntrue\nhello std fs\n\nagain\n5'
run_fail_case std_fs_unknown_named_import_fail examples/std_fs_unknown_named_import_fail.ts "unsupported named import 'unlinkSync' from stdlib specifier 'std/fs'"

run_case node_path_basic $'/foo/bar\n/foo\nfoo\n.\n/\n/\n/foo/bar\n/a/c\n/a/b/d\n/foo/bar/baz\n/bar\n/x/w\n/a/b/util.ts\n/pkg/src\ntrue'
run_fail_case node_path_dirname_arity_fail examples/node_path_dirname_arity_fail.ts "dirname expects exactly one argument"
run_fail_case node_path_dirname_type_fail examples/node_path_dirname_type_fail.ts "dirname path argument must be string"
run_fail_case node_path_resolve_arity_fail examples/node_path_resolve_arity_fail.ts "resolve expects at least one argument"
run_fail_case node_path_resolve_type_fail examples/node_path_resolve_type_fail.ts "resolve segment argument must be string"
run_fail_case node_path_as_value_fail examples/node_path_as_value_fail.ts "unknown identifier 'resolve'"
run_fail_case node_path_unknown_named_import_fail examples/node_path_unknown_named_import_fail.ts "unsupported named import 'relative'"

run_case node_path_basename $'baz.ts\nbar\nbar\nfoo\nfoo\n\ntrue\nbaz\nfoo\nmain\nbar.ts\ntrue\nindex'
run_fail_case node_path_basename_arity_fail examples/node_path_basename_arity_fail.ts "basename expects one or two arguments"
run_fail_case node_path_basename_path_type_fail examples/node_path_basename_path_type_fail.ts "basename path argument must be string"
run_fail_case node_path_basename_ext_type_fail examples/node_path_basename_ext_type_fail.ts "basename ext argument must be string"
run_fail_case node_path_basename_as_value_fail examples/node_path_basename_as_value_fail.ts "unknown identifier 'basename'"

run_case node_path_extname $'.html\n.md\n.\ntrue\ntrue\n.md\n.ts\ntrue\n.gz\ntrue\ntrue\ntrue\n.tsx'
run_fail_case node_path_extname_arity_fail examples/node_path_extname_arity_fail.ts "extname expects exactly one argument"
run_fail_case node_path_extname_type_fail examples/node_path_extname_type_fail.ts "extname path argument must be string"
run_fail_case node_path_extname_as_value_fail examples/node_path_extname_as_value_fail.ts "unknown identifier 'extname'"

run_case node_path_join $'.\n.\nfoo/bar\n/foo/bar\n/bar\n../b\na/b/c/\na\n/\n.\n..\n/a/b/c\nfoo/bar\n/pkg/src/index'
run_fail_case node_path_join_type_fail examples/node_path_join_type_fail.ts "join segment argument must be string"
run_fail_case node_path_join_as_value_fail examples/node_path_join_as_value_fail.ts "unknown identifier 'join'"

run_case std_path_basic $'/pkg/src\n/pkg/dist/main.ts\nindex\n.ts\n/pkg/src/parser.ts\n/pkg/src/cli'
run_fail_case std_path_unknown_named_import_fail examples/std_path_unknown_named_import_fail.ts "unsupported named import 'relative' from stdlib specifier 'std/path'"

run_case node_child_process_exec $'hello from child\nparent line\none two\n\nx=2'
run_fail_case node_child_process_exec_arity_fail examples/node_child_process_exec_arity_fail.ts "execFileSync expects exactly three arguments"
run_fail_case node_child_process_exec_cmd_type_fail examples/node_child_process_exec_cmd_type_fail.ts "execFileSync cmd argument must be string"
run_fail_case node_child_process_exec_args_type_fail examples/node_child_process_exec_args_type_fail.ts "execFileSync args argument must be Array<string>"
run_fail_case node_child_process_exec_opts_not_object_fail examples/node_child_process_exec_opts_not_object_fail.ts "options argument must be the literal"
run_fail_case node_child_process_exec_opts_wrong_key_fail examples/node_child_process_exec_opts_wrong_key_fail.ts "options property must be \`stdio: \"inherit\"\`"
run_fail_case node_child_process_exec_opts_wrong_value_fail examples/node_child_process_exec_opts_wrong_value_fail.ts "\`stdio\` must be the string literal \"inherit\""
run_fail_case node_child_process_exec_as_value_fail examples/node_child_process_exec_as_value_fail.ts "execFileSync returns void and cannot be used as a value"
run_fail_case node_child_process_unknown_named_import_fail examples/node_child_process_unknown_named_import_fail.ts "unsupported named import 'spawnSync'"

run_case node_url_basic $'true\ntrue\ntrue\ntrue\nnode_url_basic\ntrue\ntrue\n/tmp/a b/c/d\n/etc/hosts\n7\n0\n255'
run_fail_case node_url_arity_fail examples/node_url_arity_fail.ts "fileURLToPath expects exactly one argument"
run_fail_case node_url_type_fail examples/node_url_type_fail.ts "fileURLToPath argument must be string"
run_fail_case node_url_as_value_fail examples/node_url_as_value_fail.ts "unknown identifier 'fileURLToPath'"
run_fail_case node_url_unknown_named_import_fail examples/node_url_unknown_named_import_fail.ts "unsupported named import 'pathToFileURL'"
run_fail_case import_meta_bare_fail examples/import_meta_bare_fail.ts "bare \`import.meta\` is unsupported"
run_fail_case import_meta_wrong_prop_fail examples/import_meta_wrong_prop_fail.ts "unsupported \`import.meta.resolve\`"

# Phase 1.5-6 prep #26: process.argv / process.exit / process.{stdout,stderr}
# .write + console.error. stderr writes are not captured by run_case.
run_case process_io $'1\nprocess_io\nab\n1\nbefore exit'
run_fail_case process_exit_type_fail examples/process_exit_type_fail.ts "process.exit code must be number"
run_fail_case process_exit_arity_fail examples/process_exit_arity_fail.ts "process.exit expects at most one argument"
run_fail_case process_stdout_write_type_fail examples/process_stdout_write_type_fail.ts "process.stdout.write argument must be string"
run_fail_case process_stdout_write_as_value_fail examples/process_stdout_write_as_value_fail.ts "process.stdout.write returns void and cannot be used as a value"
run_fail_case process_member_value_fail examples/process_member_value_fail.ts "unsupported \`process.pid\` as a value"
run_fail_case console_error_arity_fail examples/console_error_arity_fail.ts "console.error expects exactly one argument"

run_case std_process_basic $'1\nstd_process_basic\nab\n1\nlocal\nbefore exit'
run_fail_case std_process_unknown_named_import_fail examples/std_process_unknown_named_import_fail.ts "unsupported named import 'env' from stdlib specifier 'std/process'"
run_fail_case std_process_exit_type_fail examples/std_process_exit_type_fail.ts "process.exit code must be number"
run_fail_case std_process_write_stdout_type_fail examples/std_process_write_stdout_type_fail.ts "process.stdout.write argument must be string"
run_fail_case std_process_write_error_type_fail examples/std_process_write_error_type_fail.ts "writeError argument must be string"
run_fail_case std_process_write_error_as_value_fail examples/std_process_write_error_as_value_fail.ts "console.error returns void and cannot be used as a value"

run_case number_literal_bases $'34\n16\n10\n3\n63\n160\ntrue\ntrue'
run_case parse_number $'255\n16\n5\n10\n3.14\n42\n0\n100\n123\n-123\n15\n1295\n511\n10\n123\n8\n16\n15\n2.5\n100\nNaN\nNaN'
run_fail_case parse_int_arity_fail examples/parse_int_arity_fail.ts "parseInt expects exactly two arguments"
run_fail_case parse_int_arg_type_fail examples/parse_int_arg_type_fail.ts "parseInt first argument must be string"
run_fail_case parse_int_radix_type_fail examples/parse_int_radix_type_fail.ts "parseInt radix argument must be number"
run_fail_case parse_float_arity_fail examples/parse_float_arity_fail.ts "parseFloat expects exactly one argument"
run_fail_case parse_int_as_value_fail examples/parse_int_as_value_fail.ts "unknown identifier 'parseInt'"

run_case dunion_optional $'ident=foo\nabsent\nnum=42\ni:hello\nn:7\neof\nnone\ni:a\nn:99\neof\nnone\ngot:alpha-text\nmiss\nbang:123\nnc:eof\nchain:alpha-text\nid-match'
run_fail_case dunion_optional_unnarrowed_fail examples/dunion_optional_unnarrowed_fail.ts "cannot access '.kind' on union type"
run_fail_case dunion_optional_non_optional_bang_fail examples/dunion_optional_non_optional_bang_fail.ts "non-null assertion"
run_fail_case dunion_optional_non_optional_coalesce_fail examples/dunion_optional_non_optional_coalesce_fail.ts "left operand to be"

run_case cond_equality $'if-eq\nif-ne\nand\nor\nmixed\ndiffer\n3\n6\n2'
run_cc_warnfree_case cond_equality
run_cc_warnfree_case dunion_optional
run_cc_warnfree_case dunion_common_field
run_cc_warnfree_case compound_narrow
run_cc_warnfree_case compound_carry_narrow
run_cc_warnfree_case dunion_init_narrow
run_cc_warnfree_case dunion_widen
run_cc_warnfree_case dunion_optional_object_literal

echo "all tests passed"

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *)
    echo "unsupported release OS: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
  *)
    echo "unsupported release architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

artifact="topaz-${os}-${arch}"
release_dir="dist-release"
release_path="${release_dir}/${artifact}"
tmp_dir=""
cleanup_tmp() {
  if [[ -n "${tmp_dir}" ]]; then
    rm -rf "${tmp_dir}"
  fi
}
trap cleanup_tmp EXIT

echo "RELEASE [self-host fixed point]"
pnpm run check:runtime-header
pnpm run check:runtime-prelude
pnpm run check:runtime-substrate
pnpm run test:selfhost

rm -rf "${release_dir}"
mkdir -p "${release_dir}"

echo "RELEASE [copy ${artifact}]"
cp build/topaz "${release_path}"
chmod 0755 "${release_path}"

echo "RELEASE [smoke ${artifact}]"
"./${release_path}" --help > /dev/null
"./${release_path}" examples/fib.ts -o build/release_fib > /dev/null
fib_out=$(./build/release_fib)
if [[ "${fib_out}" != "5702887" ]]; then
  echo "FAIL [release_fib]:" >&2
  echo "  expected: 5702887" >&2
  echo "  got: ${fib_out}" >&2
  exit 1
fi

echo "RELEASE [smoke ${artifact} guidance]"
guidance_dir="build/release_guidance_smoke"
guidance_entry="${guidance_dir}/effectful.ts"
guidance_policy="${guidance_dir}/strict-ts.json"
rm -rf "${guidance_dir}"
mkdir -p "${guidance_dir}"
cat > "${guidance_entry}" <<'EOF'
import { readFileSync } from "std/fs";

const text: string = readFileSync("examples/fixtures/node_fs_sample.txt", "utf8");
const size: number = text.length;
EOF
cat > "${guidance_policy}" <<'EOF'
{ "capabilities": ["fs.read"] }
EOF

assert_release_output_contains() {
  local label="$1"
  local output="$2"
  local expected="$3"
  if [[ "${output}" != *"${expected}"* ]]; then
    echo "FAIL [${label}]: missing expected output fragment" >&2
    echo "  expected fragment: ${expected}" >&2
    echo "  got:" >&2
    printf '%s\n' "${output}" | sed 's/^/    /' >&2
    exit 1
  fi
}

help_out=$("./${release_path}" --help)
assert_release_output_contains "release_guidance_help" "${help_out}" "topaz doctor <entry.ts>"
assert_release_output_contains "release_guidance_help" "${help_out}" "topaz check <entry.ts>"
assert_release_output_contains "release_guidance_help" "${help_out}" "topaz manifest init <entry.ts>"
assert_release_output_contains "release_guidance_help" "${help_out}" "topaz explain capability <name>"
assert_release_output_contains "release_guidance_help" "${help_out}" "topaz explain std/<module>"

doctor_out=$("./${release_path}" doctor "${guidance_entry}")
assert_release_output_contains "release_guidance_doctor" "${doctor_out}" "topaz doctor report:"
assert_release_output_contains "release_guidance_doctor" "${doctor_out}" "  fs.read: "

check_out=$("./${release_path}" check "${guidance_entry}")
assert_release_output_contains "release_guidance_check" "${check_out}" "topaz check report:"
assert_release_output_contains "release_guidance_check" "${check_out}" "missing capabilities: none"
assert_release_output_contains "release_guidance_check" "${check_out}" "status: ok"

assert_release_output_not_contains() {
  local label="$1"
  local output="$2"
  local unexpected="$3"
  if [[ "${output}" == *"${unexpected}"* ]]; then
    echo "FAIL [${label}]: unexpected output fragment" >&2
    echo "  unexpected fragment: ${unexpected}" >&2
    echo "  got:" >&2
    printf '%s\n' "${output}" | sed 's/^/    /' >&2
    exit 1
  fi
}

policy_before=$(cat "${guidance_policy}")
manifest_out=$("./${release_path}" manifest init "${guidance_entry}")
assert_release_output_contains "release_guidance_manifest_init" "${manifest_out}" '"capabilities"'
assert_release_output_contains "release_guidance_manifest_init" "${manifest_out}" '"fs.read"'
assert_release_output_not_contains "release_guidance_manifest_init" "${manifest_out}" '"fs.write"'
assert_release_output_not_contains "release_guidance_manifest_init" "${manifest_out}" '"io.stdout"'
policy_after=$(cat "${guidance_policy}")
if [[ "${policy_after}" != "${policy_before}" ]]; then
  echo "FAIL [release_guidance_manifest_init]: manifest init changed existing policy fixture" >&2
  exit 1
fi

capability_out=$("./${release_path}" explain capability fs.read)
assert_release_output_contains "release_guidance_explain_capability" "${capability_out}" "topaz capability: fs.read"

module_out=$("./${release_path}" explain std/fs)
assert_release_output_contains "release_guidance_explain_module" "${module_out}" "topaz builtin module: std/fs"

echo "RELEASE [smoke ${artifact} binary-only]"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/topaz-release.XXXXXX")
cp "${release_path}" "${tmp_dir}/${artifact}"
chmod 0755 "${tmp_dir}/${artifact}"
"${tmp_dir}/${artifact}" examples/fib.ts -o "${tmp_dir}/release_fib" > /dev/null
fib_out=$("${tmp_dir}/release_fib")
if [[ "${fib_out}" != "5702887" ]]; then
  echo "FAIL [release_fib binary-only]:" >&2
  echo "  expected: 5702887" >&2
  echo "  got: ${fib_out}" >&2
  exit 1
fi

echo "RELEASE [sha256]"
(
  cd "${release_dir}"
  shasum -a 256 "${artifact}" > SHA256SUMS
)

echo "RELEASE [done]"
echo "  ${release_path}"
echo "  ${release_dir}/SHA256SUMS"

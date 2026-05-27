#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm run build > /dev/null

mkdir -p build

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

run_case fib "5702887"
run_case loop_sum "5050"
run_case while_count "10"
run_case boolean_print $'true\nfalse\ntrue\ntrue'
run_case mod_check $'1\n1\n-1\n1.5'
run_case switch_check $'1699\n22'
run_case number_format $'3.14\n0.30000000000000004\n1.5\n-1.5\n1e+21\n1e-7\n0.000001\n100000000000000000'
run_case string_basic $'hello, topaz!\n13\nabcdef\ntrue\ntrue\nwoof'
run_case array_basic $'3\n10\n30\n5\n40\n50\n99\n50\n4\n189\ntrue\nfalse\nalpha\ngamma\n3\n1\n7'
run_case map_set_basic $'3\n2\ntrue\nfalse\n10\ntrue\n2\nfalse\n3\ntrue\nfalse\ntrue\n2\nfalse\nyes\nno\n2\ntrue\nfalse\ntrue\n50\n250\n490\n7'
run_case class_basic $'3\n4\n7\n30\n40\n99\n100\n555\n101\n557\n110\n575\nhello, topaz\nhello, topaz\n2'
run_case interface_basic $'circle\n36\nsquare\n25\n16\nrenamed\n6\n144\n8\n64\n4\n4'
run_case array_class_iface $'3\n1\n12\n12\n4\n99\n99\n3\n500\n2\nsquare\n9\ncircle\n16\n16\ncircle\n100\n0\n7\ncircle\n4'
run_case map_set_class_iface $'3\n2\n11\n11\ntrue\nfalse\n2\nfalse\n2\nsquare\n9\ncircle\n100\ncircle\n16\n2\ntrue\ntrue\nfalse\n1\nfalse\n2\ntrue\ntrue\nfalse\n1\nfalse\n60\n99\n1'
run_case generic_fn $'42\n7\nhi\nyo\ntrue\nfalse\n10\n30\nalpha\ngamma\ntwo\n2\n1\n99\nsolo\n1\n123\nzzz\n1\n777\n555'
run_case generic_class $'42\n42\n99\nhello\ntrue\n1\none\n3\n20\n99\nhello'
run_case try_catch_basic $'boom\n1\nnegative\n42\n10\n7\n100\n9\nrewrapped\n2\n0\n999'

run_case optional_basic $'false\ntrue\ntrue\ntrue\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue'
run_case optional_narrow $'10\n0\n10\n-1\n10\n0\n16\n7\n20\n99'
run_case optional_map_get $'10\n-1\n7\n0\nalpha\nabsent\n21\n-777'

run_case dunion_basic $'12\n9\ncircle\nsquare\ncircle\nsquare\n5\n7'

run_case catch_unknown $'kaboom\n42\nfizz\nrethrow\ntrue\n99\nfalse'

run_case arena_stress $'1000\n0\n999\n1000\n42\n1200\n500\ntrue\n500'

run_case template_literal $'hello, topaz!\ntopaz is 42\nflag=true\ntopaz\ntopaz/42\n42true\npi=3.14\nsum=0.30000000000000004\nbig=1e+21\ntiny=1e-7\ntwice(42)=84\nlen(topaz)=5\nn+1=43\nanswer=7\n?=7\n(3, 4)\nnorm=25\nq="topaz"\ntab\there\n[0][1][2][3][4]'

run_case for_of_array $'15\n-7\n0\n2\n9\n3\nalpha\nbeta\ngamma\n102\n101\n103\nsquare\ncircle\n25\ntrue\n4'

run_case for_of_set $'15\n15\n15\n0\n100\n14\n7\n60\n2\n387\n115'

run_case for_of_map_values $'60\n6\n60\n0\n6\n50\n13\n400\n60\n20\n129'

run_case for_of_entries $'140\n606\n116\n220\n20\n40\n0\n402\n141\n63\n30\n30\n12\n366'

run_case iterator_basic $'60\n3\n6\n6\n300\nfalse\n17\n3\n60\n6'

run_case non_null_and_coalesce $'10\n25\ntrue\n7\nalpha\n10\n-1\n20\n110\n7\n99\nalpha\ndefault\nhello\n?\n20\n-1\n20'

run_case optional_chain $'10\n-1\nalpha\n(none)\nalpha\n(none)\n30\n0\n5\n-1\ngreeting\n(none)\n7\n0\n100\n300\n-1\n2\n-1\n-1\n20\nalpha'

run_case arrow_basic $'42\n42\ntrue\nfalse\n7\nhello, topaz\n100\n6\n7\n11\n12\n50\n75\n36\n100\n17\n123\ntopaz:ok'

run_case array_method_map $'2\n4\n6\n3\n9\n2\n4\nn=1\nn=3\ntrue\nfalse\n10\n30\n100\n300\n300\n0\n20\n40\n101\n301'

run_case array_method_filter $'3\n1\n5\n2\n2\n4\n2\n1\n2\n3\nalpha\ndelta\n3\ntrue\ntrue\n2\n4\n2\n50\n100\n0\n0\n3\n2\n4\n3\n10\n50'

run_case array_method_includes $'true\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\ntrue\ntrue\nfalse\ntrue\nfalse\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\nfalse'

run_case array_method_slice $'3\n20\n40\n3\n30\n50\n5\n10\n50\n2\n40\n50\n4\n10\n40\n2\n30\n40\n0\n0\n2\n40\n50\n0\n2\nbeta\ngamma\n1\n99\n777\n2\n20\n30\n2\n20\n30\n3\n4\n99'

run_case array_method_join $'1,2,3\n5\n1, 2, 3\n7\n123\n3\n1 -> 2 -> 3\nalpha-beta-gamma\nalpha,beta,gamma\ntrue,false,true\ntrue | false | true\n\n0\n0\n42\n2\n3.14,0,-1.5\n2,4,6\n2-3\n2,3\n[1,2,3]\n1:2:3\n10:20'

run_module_case module_basic examples/module_basic_main.ts $'7\n11\n12\n12\n25\n25'
run_fail_case module_cycle examples/module_cycle_a.ts "circular import detected"
run_fail_case strict_field_init_fail examples/strict_field_init_fail.ts "is not definitely assigned in the constructor"
run_fail_case optional_field_access_fail examples/optional_field_access_fail.ts "cannot access '.v' on union type"
run_fail_case dunion_field_access_fail examples/dunion_field_access_fail.ts "cannot access '.radius' on discriminated union"
run_fail_case catch_unknown_unnarrowed_fail examples/catch_unknown_unnarrowed_fail.ts "cannot access '.msg' on \`unknown\`"
run_fail_case template_literal_unsupported_fail examples/template_literal_unsupported_fail.ts "template literal substitution must be number / boolean / string"
run_fail_case for_of_map_fail examples/for_of_map_fail.ts "for-of requires an Array<T>"
run_fail_case for_of_destructuring_fail examples/for_of_destructuring_fail.ts "destructuring binding in for-of is only supported for .entries() on Map / Set"
run_fail_case for_of_map_entries_fail examples/for_of_map_entries_fail.ts "for-of over .entries() requires destructuring binding"
run_fail_case map_entries_outside_for_of_fail examples/map_entries_outside_for_of_fail.ts "Map.entries() is only allowed as the right-hand side"
run_fail_case iterator_in_container_fail examples/iterator_in_container_fail.ts "no Array monomorph for element type topaz_iter_number"
run_fail_case non_null_non_optional_fail examples/non_null_non_optional_fail.ts "non-null assertion (\`!\`) requires a \`T | undefined\` operand"
run_fail_case coalesce_non_optional_fail examples/coalesce_non_optional_fail.ts "\`??\` requires the left operand to be \`T | undefined\`"
run_fail_case optional_chain_non_optional_fail examples/optional_chain_non_optional_fail.ts "optional chain \`?.\` requires a \`T | undefined\` receiver"
run_fail_case optional_call_fail examples/optional_call_fail.ts "optional call \`f?.()\` is unsupported"
run_fail_case arrow_unannotated_fail examples/arrow_unannotated_fail.ts "arrow function parameter requires a type annotation"
run_case array_of_fn $'6\n50\n2\n-95\n13\n16\n60\n3\n101\n102\n103\n19\n49\n0\nn=7\nn*2=14'
run_fail_case map_of_fn_fail examples/map_of_fn_fail.ts "no Map monomorph for key=topaz_string, value=topaz_fn_"
run_fail_case set_of_fn_fail examples/set_of_fn_fail.ts "no Set monomorph for element type topaz_fn_"
run_fail_case arrow_nested_fn_type_fail examples/arrow_nested_fn_type_fail.ts "nested fn types in fn parameters are unsupported"
run_fail_case array_map_callback_arity_fail examples/array_map_callback_arity_fail.ts "Array.map callback arity"
run_fail_case array_map_callback_param_mismatch_fail examples/array_map_callback_param_mismatch_fail.ts "callback parameter type"
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
run_fail_case spread_call_args_fail examples/spread_call_args_fail.ts "spread in call arguments is unsupported"
run_fail_case spread_new_args_fail examples/spread_new_args_fail.ts "spread in \`new\` arguments is unsupported"
run_fail_case spread_set_fail examples/spread_set_fail.ts "spread source in array literal must be an Array<T>"
run_fail_case spread_elem_mismatch_fail examples/spread_elem_mismatch_fail.ts "spread element type topaz_string does not match destination element type topaz_number"
run_fail_case spread_non_array_fail examples/spread_non_array_fail.ts "spread source in array literal must be an Array<T>"

run_case access_modifier $'13\n16\n3\n100\n103\n7\n8\n15\nalpha\n101\n102\ntoy\n42'
run_fail_case access_modifier_static_fail examples/access_modifier_static_fail.ts "class member modifier 'StaticKeyword' is unsupported"

run_case void_return $'hello\nhello\non\n7\n0\n0\n[log] via iface'
run_fail_case void_return_bare_in_nonvoid_fail examples/void_return_bare_in_nonvoid_fail.ts "\`return;\` is only allowed in a void-returning function"
run_fail_case void_return_value_in_void_fail examples/void_return_value_in_void_fail.ts "\`return <expr>;\` is not allowed in a void-returning function"
run_fail_case void_value_assign_fail examples/void_value_assign_fail.ts "\`void\` is only allowed as a function / method return type"
run_fail_case void_param_fail examples/void_param_fail.ts "\`void\` is only allowed as a function / method return type"
run_fail_case void_array_fail examples/void_array_fail.ts "\`void\` is only allowed as a function / method return type"
run_fail_case void_fn_type_fail examples/void_fn_type_fail.ts "fn types cannot return \`void\`"

run_case field_initializer $'0\ntrue\ndefault\n2\n2\n2\n0\n0\n0\n(unset)\n1\n10\nhi!\n100\nalpha\n100\n0\n5\n7\n16\n2\n11\n22\n101\nDEFAULT:ok'
run_fail_case field_initializer_type_mismatch_fail examples/field_initializer_type_mismatch_fail.ts "type mismatch: expected topaz_number, got topaz_string"
run_fail_case field_initializer_partial_fail examples/field_initializer_partial_fail.ts "has fields but no constructor"

run_case type_alias $'8\nok\ntrue\n100\n3\n2\n2\n3\n20\n0\n0\n25\n2\n42\n10\n7\n12\n42\n-1\n1024\n99\n6'
run_fail_case type_alias_generic_fail examples/type_alias_generic_fail.ts "generic type alias 'Pair' is unsupported"
run_fail_case type_alias_circular_fail examples/type_alias_circular_fail.ts "circular type alias 'A'"
run_fail_case type_alias_name_conflict_fail examples/type_alias_name_conflict_fail.ts "type alias 'Foo' collides with a class of the same name"
run_fail_case type_alias_as_value_fail examples/type_alias_as_value_fail.ts "unknown identifier 'Count'"

run_case object_literal $'3\n4\n7\n30\n40\n3\n4\n100\n2\nalice\n30\ntrue\n5\nok\nfirst\n7\n8\n5\n3\n15\n2\n10\n-1\n42\ndeep\n0\n0\n5\n0\n30\nb\n3\n2\nhello\nworld\n5\n99'
run_fail_case object_literal_no_context_fail examples/object_literal_no_context_fail.ts "requires a contextually typed anonymous-class target"
run_fail_case object_literal_missing_field_fail examples/object_literal_missing_field_fail.ts "missing required property: b"
run_fail_case object_literal_extra_field_fail examples/object_literal_extra_field_fail.ts "property 'c' does not exist"
run_fail_case object_literal_shorthand_fail examples/object_literal_shorthand_fail.ts "no shorthand, method shorthand"
run_fail_case object_literal_spread_fail examples/object_literal_spread_fail.ts "no shorthand, method shorthand"
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

run_case array_of_dunion $'3\n31\n21\n3\n3\n4\n6\nsquare\n6\n99\n2\ntrue\nfalse\n1\n1\ntrue\nfalse'

run_case module_const_hoist $'true\nfalse\ntrue\nfalse\ntrue\ntrue\n51\n-1\n42\n70\n3\n5\n100\n11\n4\n2\n1500'
run_fail_case module_const_hoist_let_fail examples/module_const_hoist_let_fail.ts "unknown identifier 'counter'"
run_fail_case module_const_hoist_nonscalar_fail examples/module_const_hoist_nonscalar_fail.ts "unknown identifier 'GREETING'"

run_case string_method $'5\n104\n101\n111\ntrue\ntrue\nell\n3\nllo\n3\nhello\n5\nlo\nhell\nll\n0\ntrue\nlo\n0\nbcd\n6\nbcdabcdef\nace\n101\n119\nrld\n122\nabcdef'
run_fail_case string_char_code_at_arity_fail examples/string_char_code_at_arity_fail.ts "String.charCodeAt expects exactly one argument"
run_fail_case string_char_code_at_arg_type_fail examples/string_char_code_at_arg_type_fail.ts "String.charCodeAt argument must be number"
run_fail_case string_slice_arg_type_fail examples/string_slice_arg_type_fail.ts "String.slice argument must be number"
run_fail_case string_slice_too_many_args_fail examples/string_slice_too_many_args_fail.ts "String.slice expects at most two arguments"
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
run_fail_case node_fs_unknown_named_import_fail examples/node_fs_unknown_named_import_fail.ts "unsupported named import 'existsSync'"
run_fail_case node_fs_namespace_import_fail examples/node_fs_namespace_import_fail.ts "namespace import of stdlib specifier 'node:fs'"
run_fail_case node_fs_rename_import_fail examples/node_fs_rename_import_fail.ts "import rename"

echo "all tests passed"

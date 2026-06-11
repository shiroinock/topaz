import { existsSync, readFileSync } from "node:fs";

import { builtinEffectVocabulary } from "./builtin_descriptors.js";

export type ManifestPolicy = {
  capabilities: Array<string>;
};

export type ManifestPolicyDiagnostic = {
  kind: string;
  capability: string;
  message: string;
};

export type ManifestPolicyValidationResult = {
  ok: boolean;
  policy: ManifestPolicy;
  diagnostics: Array<ManifestPolicyDiagnostic>;
};

export type ManifestPolicyFileLoadResult = {
  found: boolean;
  path: string;
  result: ManifestPolicyValidationResult;
};

type ManifestPolicyTextParseState = {
  text: string;
  pos: number;
  ok: boolean;
  message: string;
  stringValue: string;
  sawCapabilities: boolean;
  capabilities: Array<string>;
};

export function manifestPolicyFilename(): string {
  return "strict-ts.json";
}

export function emptyManifestPolicy(): ManifestPolicy {
  return { capabilities: [] };
}

export function loadManifestPolicyFile(path: string): ManifestPolicyFileLoadResult {
  if (!existsSync(path)) {
    return {
      found: false,
      path,
      result: {
        ok: true,
        policy: emptyManifestPolicy(),
        diagnostics: [],
      },
    };
  }

  return {
    found: true,
    path,
    result: parseManifestPolicyText(readFileSync(path, "utf8")),
  };
}

export function validateManifestPolicyCapabilities(
  capabilities: Array<string>,
): ManifestPolicyValidationResult {
  const diagnostics: Array<ManifestPolicyDiagnostic> = [];
  const acceptedCapabilities: Array<string> = [];
  const knownCapabilities = builtinEffectVocabulary();

  for (const capability of capabilities) {
    if (!hasString(knownCapabilities, capability)) {
      diagnostics.push({
        kind: "unknown-capability",
        capability,
        message: "unknown capability '" + capability + "'",
      });
    }

    if (hasString(acceptedCapabilities, capability)) {
      diagnostics.push({
        kind: "duplicate-capability",
        capability,
        message: "duplicate capability '" + capability + "'",
      });
    } else {
      acceptedCapabilities.push(capability);
    }
  }

  return {
    ok: diagnostics.length === 0,
    policy: { capabilities: acceptedCapabilities },
    diagnostics,
  };
}

export function parseManifestPolicyText(text: string): ManifestPolicyValidationResult {
  const state: ManifestPolicyTextParseState = {
    text,
    pos: 0,
    ok: true,
    message: "",
    stringValue: "",
    sawCapabilities: false,
    capabilities: [],
  };

  skipManifestPolicyWhitespace(state);
  if (state.pos >= text.length) return manifestPolicyTextFailure("expected top-level object");
  if (text.charCodeAt(state.pos) !== 123) return manifestPolicyTextFailure("top-level value must be an object");
  parseManifestPolicyObject(state);
  if (!state.ok) return manifestPolicyTextFailure(state.message);

  skipManifestPolicyWhitespace(state);
  if (state.pos !== text.length) {
    return manifestPolicyTextFailure("unexpected trailing input");
  }

  return validateManifestPolicyCapabilities(state.capabilities);
}

function hasString(values: Array<string>, value: string): boolean {
  for (const current of values) {
    if (current === value) return true;
  }
  return false;
}

function manifestPolicyTextFailure(message: string): ManifestPolicyValidationResult {
  return {
    ok: false,
    policy: emptyManifestPolicy(),
    diagnostics: [
      {
        kind: "parse-error",
        capability: "",
        message,
      },
    ],
  };
}

function parseManifestPolicyObject(state: ManifestPolicyTextParseState): void {
  state.pos = state.pos + 1;
  skipManifestPolicyWhitespace(state);
  if (consumeManifestPolicyCode(state, 125)) return;

  while (state.ok) {
    if (!parseManifestPolicyString(state)) return;
    const key: string = state.stringValue;

    skipManifestPolicyWhitespace(state);
    if (!consumeManifestPolicyCode(state, 58)) {
      setManifestPolicyParseError(state, "expected ':' after object key");
      return;
    }

    skipManifestPolicyWhitespace(state);
    if (key === "capabilities") {
      if (state.sawCapabilities) {
        setManifestPolicyParseError(state, "duplicate top-level key 'capabilities'");
        return;
      }
      state.sawCapabilities = true;
      parseManifestPolicyCapabilitiesArray(state);
    } else {
      skipManifestPolicyJsonValue(state);
    }
    if (!state.ok) return;

    skipManifestPolicyWhitespace(state);
    if (consumeManifestPolicyCode(state, 125)) return;
    if (!consumeManifestPolicyCode(state, 44)) {
      setManifestPolicyParseError(state, "expected ',' or '}' in object");
      return;
    }
    skipManifestPolicyWhitespace(state);
  }
}

function parseManifestPolicyCapabilitiesArray(state: ManifestPolicyTextParseState): void {
  if (!consumeManifestPolicyCode(state, 91)) {
    setManifestPolicyParseError(state, "'capabilities' must be an array");
    return;
  }

  skipManifestPolicyWhitespace(state);
  if (consumeManifestPolicyCode(state, 93)) return;

  while (state.ok) {
    skipManifestPolicyWhitespace(state);
    if (state.pos >= state.text.length || state.text.charCodeAt(state.pos) !== 34) {
      setManifestPolicyParseError(state, "'capabilities' entries must be strings");
      return;
    }
    if (!parseManifestPolicyString(state)) return;
    state.capabilities.push(state.stringValue);

    skipManifestPolicyWhitespace(state);
    if (consumeManifestPolicyCode(state, 93)) return;
    if (!consumeManifestPolicyCode(state, 44)) {
      setManifestPolicyParseError(state, "expected ',' or ']' in capabilities");
      return;
    }
  }
}

function skipManifestPolicyJsonValue(state: ManifestPolicyTextParseState): void {
  skipManifestPolicyWhitespace(state);
  if (state.pos >= state.text.length) {
    setManifestPolicyParseError(state, "expected JSON value");
    return;
  }

  const code: number = state.text.charCodeAt(state.pos);
  if (code === 34) {
    parseManifestPolicyString(state);
    return;
  }
  if (code === 123) {
    skipManifestPolicyJsonObject(state);
    return;
  }
  if (code === 91) {
    skipManifestPolicyJsonArray(state);
    return;
  }
  if (code === 116) {
    consumeManifestPolicyLiteral(state, "true");
    return;
  }
  if (code === 102) {
    consumeManifestPolicyLiteral(state, "false");
    return;
  }
  if (code === 110) {
    consumeManifestPolicyLiteral(state, "null");
    return;
  }
  if (code === 45 || isManifestPolicyDigit(code)) {
    skipManifestPolicyJsonNumber(state);
    return;
  }

  setManifestPolicyParseError(state, "expected JSON value");
}

function skipManifestPolicyJsonObject(state: ManifestPolicyTextParseState): void {
  state.pos = state.pos + 1;
  skipManifestPolicyWhitespace(state);
  if (consumeManifestPolicyCode(state, 125)) return;

  while (state.ok) {
    if (!parseManifestPolicyString(state)) return;
    skipManifestPolicyWhitespace(state);
    if (!consumeManifestPolicyCode(state, 58)) {
      setManifestPolicyParseError(state, "expected ':' after object key");
      return;
    }
    skipManifestPolicyJsonValue(state);
    if (!state.ok) return;

    skipManifestPolicyWhitespace(state);
    if (consumeManifestPolicyCode(state, 125)) return;
    if (!consumeManifestPolicyCode(state, 44)) {
      setManifestPolicyParseError(state, "expected ',' or '}' in object");
      return;
    }
    skipManifestPolicyWhitespace(state);
  }
}

function skipManifestPolicyJsonArray(state: ManifestPolicyTextParseState): void {
  state.pos = state.pos + 1;
  skipManifestPolicyWhitespace(state);
  if (consumeManifestPolicyCode(state, 93)) return;

  while (state.ok) {
    skipManifestPolicyJsonValue(state);
    if (!state.ok) return;

    skipManifestPolicyWhitespace(state);
    if (consumeManifestPolicyCode(state, 93)) return;
    if (!consumeManifestPolicyCode(state, 44)) {
      setManifestPolicyParseError(state, "expected ',' or ']' in array");
      return;
    }
    skipManifestPolicyWhitespace(state);
  }
}

function parseManifestPolicyString(state: ManifestPolicyTextParseState): boolean {
  if (!consumeManifestPolicyCode(state, 34)) {
    setManifestPolicyParseError(state, "expected string");
    return false;
  }

  let out: string = "";
  while (state.pos < state.text.length) {
    const code: number = state.text.charCodeAt(state.pos);
    if (code === 34) {
      state.pos = state.pos + 1;
      state.stringValue = out;
      return true;
    }
    if (code === 92) {
      state.pos = state.pos + 1;
      if (state.pos >= state.text.length) {
        setManifestPolicyParseError(state, "unterminated string escape");
        return false;
      }
      const escaped: number = state.text.charCodeAt(state.pos);
      if (escaped === 34) out = out + "\"";
      else if (escaped === 92) out = out + "\\";
      else if (escaped === 47) out = out + "/";
      else if (escaped === 110) out = out + "\n";
      else if (escaped === 114) out = out + "\r";
      else if (escaped === 116) out = out + "\t";
      else if (escaped === 117) {
        setManifestPolicyParseError(state, "unicode escapes are unsupported in strict-ts.json");
        return false;
      } else {
        setManifestPolicyParseError(state, "unsupported string escape");
        return false;
      }
      state.pos = state.pos + 1;
      continue;
    }
    if (code < 32) {
      setManifestPolicyParseError(state, "control character in string");
      return false;
    }
    if (code > 127) {
      setManifestPolicyParseError(state, "non-ASCII string character");
      return false;
    }
    out = out + state.text.slice(state.pos, state.pos + 1);
    state.pos = state.pos + 1;
  }

  setManifestPolicyParseError(state, "unterminated string");
  return false;
}

function skipManifestPolicyJsonNumber(state: ManifestPolicyTextParseState): void {
  if (consumeManifestPolicyCode(state, 45) && state.pos >= state.text.length) {
    setManifestPolicyParseError(state, "invalid number");
    return;
  }

  if (state.pos >= state.text.length) {
    setManifestPolicyParseError(state, "invalid number");
    return;
  }

  const first: number = state.text.charCodeAt(state.pos);
  if (first === 48) {
    state.pos = state.pos + 1;
    if (state.pos < state.text.length && isManifestPolicyDigit(state.text.charCodeAt(state.pos))) {
      setManifestPolicyParseError(state, "invalid number");
      return;
    }
  } else if (isManifestPolicyNonZeroDigit(first)) {
    state.pos = state.pos + 1;
    consumeManifestPolicyDigits(state);
  } else {
    setManifestPolicyParseError(state, "invalid number");
    return;
  }

  if (consumeManifestPolicyCode(state, 46) && !consumeManifestPolicyDigits(state)) {
    setManifestPolicyParseError(state, "invalid number");
    return;
  }

  if (state.pos < state.text.length) {
    const code: number = state.text.charCodeAt(state.pos);
    if (code === 69 || code === 101) {
      state.pos = state.pos + 1;
      if (state.pos < state.text.length) {
        const sign: number = state.text.charCodeAt(state.pos);
        if (sign === 43 || sign === 45) state.pos = state.pos + 1;
      }
      if (!consumeManifestPolicyDigits(state)) {
        setManifestPolicyParseError(state, "invalid number");
      }
    }
  }
}

function consumeManifestPolicyDigits(state: ManifestPolicyTextParseState): boolean {
  const start: number = state.pos;
  while (state.pos < state.text.length && isManifestPolicyDigit(state.text.charCodeAt(state.pos))) {
    state.pos = state.pos + 1;
  }
  return state.pos > start;
}

function consumeManifestPolicyLiteral(state: ManifestPolicyTextParseState, literal: string): void {
  let i: number = 0;
  while (i < literal.length) {
    if (state.pos + i >= state.text.length || state.text.charCodeAt(state.pos + i) !== literal.charCodeAt(i)) {
      setManifestPolicyParseError(state, "expected '" + literal + "'");
      return;
    }
    i = i + 1;
  }
  state.pos = state.pos + literal.length;
}

function consumeManifestPolicyCode(state: ManifestPolicyTextParseState, code: number): boolean {
  if (state.pos < state.text.length && state.text.charCodeAt(state.pos) === code) {
    state.pos = state.pos + 1;
    return true;
  }
  return false;
}

function skipManifestPolicyWhitespace(state: ManifestPolicyTextParseState): void {
  while (state.pos < state.text.length) {
    const code: number = state.text.charCodeAt(state.pos);
    if (code !== 32 && code !== 9 && code !== 10 && code !== 13) return;
    state.pos = state.pos + 1;
  }
}

function isManifestPolicyDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isManifestPolicyNonZeroDigit(code: number): boolean {
  return code >= 49 && code <= 57;
}

function setManifestPolicyParseError(state: ManifestPolicyTextParseState, message: string): void {
  state.ok = false;
  state.message = message;
}

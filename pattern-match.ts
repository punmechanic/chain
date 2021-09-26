export type Patternish = string;
export type Pattern = readonly Segment[];

type Segment = "passthrough" | { type: string; name: string };
type FailReason = "unterminated-segment";

export class PatternParseError extends Error {
  static failedToParseSegment(
    failReason: FailReason,
    patternish: Patternish,
    idx: number
  ): PatternParseError {
    switch (failReason) {
      case "unterminated-segment":
        return PatternParseError.unterminatedSegment(patternish, idx);
    }
  }

  static repeatSegmentName(name: string): PatternParseError {
    return new PatternParseError(`${name} was declared multiple times`);
  }

  static parameterMismatch(pattern: Pattern, found: number): PatternParseError {
    return new PatternParseError(
      `URL had ${found} parts, but pattern only has ${pattern.length}`
    );
  }

  static unterminatedSegment(
    patternish: Patternish,
    idx: number
  ): PatternParseError {
    if (patternish[0] !== "/") {
      // If there's no leading slash, we need to increment the segment "number" for the error msg to make sense.
      idx++;
    }

    return new PatternParseError(
      `segment ${idx} was unterminated in pattern ${patternish}`
    );
  }
}

export function extractVars(pattern: Pattern, url: URL): Map<string, string> {
  const vars = new Map();
  const parts = url.pathname.split("/");
  if (parts.length !== pattern.length) {
    throw PatternParseError.parameterMismatch(pattern, parts.length);
  }

  for (let i = 0; i < pattern.length; i++) {
    const seg = pattern[i];
    if (seg === "passthrough") {
      continue;
    }

    vars.set(seg.name, parts[i]);
  }

  return vars;
}

function parseSegment(segment: string): Segment | FailReason {
  const firstChar = segment[0];
  const lastChar = segment[segment.length - 1];
  if (firstChar !== "{") {
    return "passthrough";
  }

  if (firstChar === "{" && lastChar !== "}") {
    return "unterminated-segment";
  }

  return { type: "string", name: segment.slice(1, segment.length - 1) };
}

export function parse(patternish: Patternish): Pattern | never {
  const names = new Set();
  const segments: Segment[] = [];
  const parts = patternish.split("/");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const result = parseSegment(part);
    if (typeof result !== "string") {
      if (names.has(result.name)) {
        throw PatternParseError.repeatSegmentName(result.name);
      }

      names.add(result.name);
      segments.push(result);
    }

    switch (result) {
      case "passthrough":
        segments.push(result);
        break;
      case "unterminated-segment":
        throw PatternParseError.unterminatedSegment(patternish, i);
    }
  }

  return segments;
}

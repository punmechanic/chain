import {
  parse,
  extractVars,
  PatternParseError,
  fastMatch,
} from "./pattern-match.ts";
import {
  assertThrows,
  assertEquals,
  assert,
} from "https://deno.land/std@0.108.0/testing/asserts.ts";

const TEST_BASE_URL = new URL("http://example.com");

function assertNot(expr: boolean, msg?: string) {
  assert(!expr, msg);
}

Deno.test({
  name: "does not allow a user to re-use the same segment name",
  fn() {
    assertThrows(
      () => parse("/{foo}/{foo}"),
      PatternParseError,
      "foo was declared multiple times"
    );
  },
});

Deno.test({
  name: "throws errors on unterminated segments",
  fn() {
    assertThrows(
      () => parse("/{foo}/{bar/baz"),
      PatternParseError,
      "segment 2 was unterminated in pattern /{foo}/{bar/baz"
    );
  },
});

Deno.test({
  name: "can extract vars",
  fn() {
    const pattern = parse("/{foo}/{bar}/{baz}");
    const url = new URL("/a/b/c", TEST_BASE_URL);
    const vars = extractVars(pattern, url);
    assertEquals(vars.get("foo"), "a");
    assertEquals(vars.get("bar"), "b");
    assertEquals(vars.get("baz"), "c");
  },
});

Deno.test({
  name: "can fast match",
  fn() {
    const pattern = parse("/{foo}/{bar}/{baz}");

    assert(fastMatch(pattern, new URL("/a/b/c", TEST_BASE_URL)));
    assertNot(fastMatch(pattern, new URL("/a/b", TEST_BASE_URL)));
    assertNot(fastMatch(pattern, new URL("/a/b/c/d", TEST_BASE_URL)));
  },
});

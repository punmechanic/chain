import { Route } from "./router.ts";
import { assertEquals } from "https://deno.land/std@0.108.0/testing/asserts.ts";
import { parse as parsePattern } from "./pattern-match.ts";

const TEST_BASE_URL = new URL("http://example.com");

Deno.test({
  name: "Routes match against requests",
  fn() {
    const route = new Route("GET", parsePattern("/{foo}"), []);
    let uri = new URL("/1234", TEST_BASE_URL);
    let req = new Request(uri.href, {
      method: "get",
    });
    assertEquals(route.matches(req), true, "failed pattern test");

    req = new Request(uri.href, {
      method: "post",
    });
    assertEquals(route.matches(req), false, "failed method tes");

    uri = new URL("/1234/5567", TEST_BASE_URL);
    req = new Request(uri.href, {
      method: "get",
    });
    assertEquals(route.matches(req), false, "failed nested pattern test");
  },
});

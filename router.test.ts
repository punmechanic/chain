import {
  Pattern,
  Route,
  Router,
  Middleware,
  PatternParseError,
} from "./router.ts";
import type { ConnInfo } from "https://deno.land/std@0.108.0/http/mod.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.108.0/testing/asserts.ts";

const TEST_BASE_URL = new URL("http://example.com");

const setValueMiddleware: Middleware = (next) => (req, connInfo, ctx) => {
  return next(req, connInfo, ctx.withValue("foo", "bar"));
};

const readValueToBodyMiddleware: Middleware = (_next) => {
  return (_req, _connInfo, ctx) => {
    const body = {
      foo: ctx.value("foo"),
    };

    return new Response(JSON.stringify(body), {
      headers: [["content-type", "application/json; encoding=utf8"]],
    });
  };
};

const dumpInfoMiddleware: Middleware = (_next) => {
  return (req) => {
    const body = `${req.method} ${req.url}`;
    return new Response(body, {
      headers: [["content-type", "text/plain; encoding=utf8"]],
    });
  };
};

async function testHandleRequest(
  router: Router,
  request: Request
): Promise<Response> {
  const handle = router.handler();
  return await handle(request, {} as unknown as ConnInfo);
}

Deno.test({
  name: "does not allow a user to re-use the same segment name",
  fn() {
    assertThrows(
      () => {
        Pattern.tryParse("/{foo}/{foo}");
      },
      PatternParseError,
      "foo was declared multiple times"
    );
  },
});

Deno.test({
  name: "throws errors on unterminated segments",
  fn() {
    assertThrows(
      () => {
        Pattern.tryParse("/{foo}/{bar/baz");
      },
      PatternParseError,
      "segment 2 was unterminated in pattern /{foo}/{bar/baz"
    );
  },
});

Deno.test({
  name: "Pattern can extract vars",
  fn() {
    const pattern = Pattern.tryParse("/{foo}/{bar}/{baz}");
    const url = new URL("/a/b/c", TEST_BASE_URL);
    const vars = pattern.extractVars(url);
    assertEquals(vars.get("foo"), "a");
    assertEquals(vars.get("bar"), "b");
    assertEquals(vars.get("baz"), "c");
  },
});

Deno.test({
  name: "Routes match against requests",
  fn() {
    const pattern = Pattern.tryParse("/{foo}");
    const route = new Route("GET", pattern, []);
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

Deno.test({
  name: "can handle simple GET requests",
  async fn() {
    const router = new Router();
    router.get("/", dumpInfoMiddleware);
    router.post("/", dumpInfoMiddleware);
    const uri = new URL("/", TEST_BASE_URL);
    const request = new Request(uri.href, { method: "get" });
    const response = await testHandleRequest(router, request);
    assertEquals(await response.text(), `GET ${uri.href}`);
  },
});

Deno.test({
  name: "can handle simple GET requests with vars",
  async fn() {
    const router = new Router();
    router.get("/{foo}", dumpInfoMiddleware);
    const uri = new URL("/1234", TEST_BASE_URL);
    const request = new Request(uri.href, { method: "get" });
    const response = await testHandleRequest(router, request);
    const txt = await response.text();
    const [, vars] = txt.split("\n");
    assertEquals(vars, new URLSearchParams({ foo: "1234" }).toString());
  },
});

Deno.test({
  name: "middleware chain works as expected",
  async fn() {
    const router = new Router();
    router.use(setValueMiddleware, readValueToBodyMiddleware);
    const uri = new URL("/foo", TEST_BASE_URL);
    const request = new Request(uri.href);
    const response = await testHandleRequest(router, request);
    assertEquals(await response.json(), { foo: "bar" });
  },
});

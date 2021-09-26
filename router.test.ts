import { Router, Middleware } from "./router.ts";
import type { ConnInfo } from "https://deno.land/std@0.108.0/http/mod.ts";
import { assertEquals } from "https://deno.land/std@0.108.0/testing/asserts.ts";

const setValueMiddleware: Middleware = (next) => (req, connInfo, ctx) => {
  return next(req, connInfo, ctx.withValue("foo", "bar"));
};

const readValueToBodyMiddleware: Middleware = (_next) => {
  return (_req, _connInfo, ctx) => {
    const body = {
      foo: ctx.value("foo"),
    };

    const str = JSON.stringify(body);
    return new Response(str);
  };
};

Deno.test({
  name: "middleware chain works as expected",
  async fn() {
    const router = new Router();
    router.use(setValueMiddleware, readValueToBodyMiddleware);
    const handle = router.handler();
    const uri = new URL("/foo", "http://www.example.com");
    const request = new Request(uri.href);
    const response = await handle(request, {} as unknown as ConnInfo);
    assertEquals(await response.json(), { foo: "bar" });
  },
});

# Chain

Really bad routing/middleware layer for Deno.

## Disclaimer

Use at your own risk. No production support provided. This is a project used to learn Deno; it's not the next express.

## Usage

Refer to tests.

```ts
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
```

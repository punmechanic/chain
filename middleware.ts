import type { ConnInfo } from "https://deno.land/std@0.108.0/http/mod.ts";
import type { Context } from "./context.ts";

export type RouteHandler = (
  request: Request,
  connInfo: ConnInfo,
  context: Context
) => Response | Promise<Response>;

export type Middleware = (next: RouteHandler) => RouteHandler;

export function composeMiddlewares(middlewares: Middleware[]): Middleware {
  // Clone to prevent modification
  middlewares = [...middlewares];
  return (next) => {
    // We need to construct a function that calls all of the middlewares in reverse order.
    // This is because in order to call middleware A, we need to know what the 'next' middleware is (all the way to the end of the chain).
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i];
      next = middleware(next);
    }

    return next;
  };
}

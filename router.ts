import type {
  Handler,
  ConnInfo,
} from "https://deno.land/std@0.108.0/http/mod.ts";
import {
  Patternish,
  Pattern,
  parse as parsePattern,
  extractVars,
} from "./pattern-match.ts";

type ContextKey = string | symbol;
export class Context {
  #values: Map<ContextKey, unknown> = new Map();

  clone(): Context {
    const next = new Context();
    next.#values = new Map(this.#values);
    return next;
  }

  withValue(key: ContextKey, value: unknown): Context {
    const next = this.clone();
    next.#values.set(key, value);
    return next;
  }

  value(key: ContextKey): unknown {
    return this.#values.get(key);
  }
}

const EMPTY_VARS = new Map();
const CTX_KEY_ROUTE_VARS = Symbol("route vars");

export type RouteVars = Map<string, string>;

function applyRouteVars(ctx: Context, vars: RouteVars): Context {
  return ctx.withValue(CTX_KEY_ROUTE_VARS, vars);
}

export function routeVars(ctx: Context): RouteVars {
  const maybeVars = ctx.value(CTX_KEY_ROUTE_VARS) as
    | Map<string, string>
    | undefined;

  return maybeVars ?? EMPTY_VARS;
}

export type RouteHandler = (
  request: Request,
  connInfo: ConnInfo,
  context: Context
) => Response | Promise<Response>;

export type Middleware = (next: RouteHandler) => RouteHandler;

function composeMiddlewares(middlewares: Middleware[]): Middleware {
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

export type Verb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class Route {
  #verb: Verb;
  #pattern: Pattern;
  #middlewares: Middleware[];

  constructor(verb: Verb, pattern: Pattern, middlewares: Middleware[]) {
    this.#verb = verb;
    this.#pattern = pattern;
    this.#middlewares = middlewares;
  }

  matches(req: Request): boolean {
    return req.method === this.#verb;
  }

  middleware(): Middleware {
    // This is messy which probably indicates we should change our design.
    const happyPath = composeMiddlewares(this.#middlewares);
    return (noMatchPath) => (req, info, ctx) => {
      if (this.matches(req)) {
        // TODO: is there ever a situation where req.url might not be convertible to URL?
        const vars = extractVars(this.#pattern, new URL(req.url));
        ctx = applyRouteVars(ctx, vars);
        return happyPath(noMatchPath)(req, info, ctx);
      }

      return noMatchPath(req, info, ctx);
    };
  }
}

/**
 * A router similar to express' Router.
 *
 * The following have different semantics - *order matters*.
 *
 * ```ts
 * router.use(middlewareA);
 * router.get('/', handler);
 * router.use(middlewareB);
 * ```
 *
 * ```ts
 * const router = new Router();
 * router.use(middlewareA);
 * router.use(middlewareB);
 * router.get('/', handler);
 * ```
 */
export class Router {
  #middlewares: Middleware[] = [];
  #unhandledRequestStrategy: RouteHandler = (_req, _connInfo) => {
    // TODO: If we ever reach the last chain it means nothing in the chain handled our request.
    // Probably a good idea to 404, but default behaviour is to 200.
    return new Response();
  };

  constructor(unhandledRequestStrategy?: RouteHandler) {
    if (unhandledRequestStrategy) {
      this.#unhandledRequestStrategy = unhandledRequestStrategy;
    }
  }

  #route(verb: Verb, path: Patternish, ...middlewares: Middleware[]) {
    const pattern = parsePattern(path);
    const route = new Route(verb, pattern, middlewares);
    const middleware = route.middleware();
    this.#middlewares.push(middleware);
  }

  /**
   * Applies middleware to the router.
   * @param middlewares The middlewares to apply
   */
  use(...middlewares: Middleware[]) {
    this.#middlewares.push(...middlewares);
  }

  get(path: Patternish, ...middlewares: Middleware[]) {
    this.#route("GET", path, ...middlewares);
  }

  post(path: Patternish, ...middlewares: Middleware[]) {
    this.#route("POST", path, ...middlewares);
  }

  handler(): Handler {
    const middleware = composeMiddlewares(this.#middlewares);
    return (req, connInfo) => {
      const handler = middleware(this.#unhandledRequestStrategy);
      const ctx = new Context();
      return handler(req, connInfo, ctx);
    };
  }
}

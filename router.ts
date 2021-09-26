import type {
  Handler,
  ConnInfo,
} from "https://deno.land/std@0.108.0/http/mod.ts";

export type RouteHandler = (
  request: Request,
  connInfo: ConnInfo,
  context: Context
) => Response | Promise<Response>;

export class Context {
  #values: Map<string, unknown> = new Map();

  clone(): Context {
    const next = new Context();
    next.#values = new Map(this.#values);
    return next;
  }

  withValue(key: string, value: unknown): Context {
    const next = this.clone();
    next.#values.set(key, value);
    return next;
  }

  value(key: string): unknown {
    return this.#values.get(key);
  }
}

export type Middleware = (next: RouteHandler) => RouteHandler;

export type Patternish = string;

export class Pattern {
  static tryParse(_patternish: Patternish): Pattern | never {
    return new Pattern();
  }
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

  middleware(): Middleware {
    return (next) => (req, info, ctx) => next(req, info, ctx);
  }
}

/**
 * A router similar to express' Router.
 *
 * The order in which middleware
/**
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

  #route(verb: Verb, path: Patternish, ...middlewares: Middleware[]) {
    const pattern = Pattern.tryParse(path);
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

  handler(): Handler {
    const middleware = this.middleware();
    return (req, connInfo) => {
      // TODO: If we ever reach the last chain it means nothing in the chain handled our request.
      // Probably a good idea to 404, but default behaviour is to 200.
      const handler = middleware((_req, _connInfo) => {
        return new Response();
      });

      const ctx = new Context();
      return handler(req, connInfo, ctx);
    };
  }

  middleware(): Middleware {
    // Create a copy so a user cannot modify the middleware chain after this has been returned
    const middlewares = [...this.#middlewares];
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
}

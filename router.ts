import type { Handler } from "https://deno.land/std@0.108.0/http/mod.ts";
import {
  Patternish,
  Pattern,
  fastMatch as fastMatchPattern,
  parse as parsePattern,
  extractVars,
} from "./pattern-match.ts";
import { Middleware, composeMiddlewares, RouteHandler } from "./middleware.ts";
import type { Verb } from "./shared.ts";
import { applyRouteVars } from "./vars.ts";
import { Context } from "./context.ts";

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
    if (req.method !== this.#verb) {
      return false;
    }

    return fastMatchPattern(this.#pattern, new URL(req.url));
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

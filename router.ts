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

type PatternSegment = "passthrough" | { type: string; name: string };
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

  static parameterMismatch(
    pattern: Pattern,
    expected: number,
    found: number
  ): PatternParseError {
    return new PatternParseError(
      `URL had ${found} parts, but ${pattern.toString()} only has ${expected}`
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

export class Pattern {
  #segments: PatternSegment[];

  static tryParse(patternish: Patternish): Pattern | never {
    const names = new Set();
    const segments: PatternSegment[] = [];
    const parts = patternish.split("/");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const result = this.#tryParseSegment(part);
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

    return new Pattern(segments);
  }

  static #tryParseSegment(segment: string): PatternSegment | FailReason {
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

  private constructor(segments: PatternSegment[]) {
    this.#segments = segments;
  }

  extractVars(url: URL): Map<string, string> {
    const vars = new Map();
    const parts = url.pathname.split("/");
    if (parts.length !== this.#segments.length) {
      throw PatternParseError.parameterMismatch(
        this,
        this.#segments.length,
        parts.length
      );
    }

    for (let i = 0; i < this.#segments.length; i++) {
      const seg = this.#segments[i];
      if (seg === "passthrough") {
        continue;
      }

      vars.set(seg.name, parts[i]);
    }

    return vars;
  }
}

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
        return happyPath(noMatchPath)(req, info, ctx);
      }

      return noMatchPath(req, info, ctx);
    };
  }
}

/**
 * A router similar to express' Router.
 *
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

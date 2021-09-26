import type { Context } from "./context.ts";

const EMPTY_VARS = new Map();
const CTX_KEY_ROUTE_VARS = Symbol("route vars");

export type RouteVars = Map<string, string>;

export function applyRouteVars(ctx: Context, vars: RouteVars): Context {
  return ctx.withValue(CTX_KEY_ROUTE_VARS, vars);
}

export function routeVars(ctx: Context): RouteVars {
  const maybeVars = ctx.value(CTX_KEY_ROUTE_VARS) as
    | Map<string, string>
    | undefined;

  return maybeVars ?? EMPTY_VARS;
}

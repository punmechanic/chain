export type ContextKey = string | symbol;

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

/**
 * `ng-js-cli/testing` — los globales que `ngjs test` deja en cada spec: los de Vitest (`describe`, `it`, `expect`,
 * `vi`, …) y la API de Jasmine que usan los specs de Angular (`spyOn`, `jasmine.createSpyObj`, `.and.*`, `.calls.*`,
 * `toBeTrue`, …). Se suma en el `tsconfig` de los specs, como `"types": ["jasmine"]` en Angular:
 *
 *   { "compilerOptions": { "types": ["ng-js-cli/testing"] } }
 */
/// <reference types="vitest/globals" />
import type { Mock } from "vitest";

type Fn = (...args: any[]) => any;

declare global {
  namespace jasmine {
    interface SpyAnd<F extends Fn> {
      returnValue(value: ReturnType<F>): Spy<F>;
      returnValues(...values: ReturnType<F>[]): Spy<F>;
      callFake(fn: F): Spy<F>;
      callThrough(): Spy<F>;
      throwError(error: Error | string): Spy<F>;
      resolveTo(value?: Awaited<ReturnType<F>>): Spy<F>;
      rejectWith(error?: unknown): Spy<F>;
      stub(): Spy<F>;
    }

    interface CallInfo<F extends Fn> {
      object: unknown;
      args: Parameters<F>;
      returnValue: ReturnType<F>;
    }

    interface Calls<F extends Fn> {
      any(): boolean;
      count(): number;
      argsFor(index: number): Parameters<F>;
      allArgs(): Parameters<F>[];
      all(): CallInfo<F>[];
      first(): CallInfo<F> | undefined;
      mostRecent(): CallInfo<F> | undefined;
      reset(): void;
    }

    /** Un `vi.fn()` con la API de Jasmine encima: sirven los dos. */
    type Spy<F extends Fn = Fn> = Mock<F> & { and: SpyAnd<F>; calls: Calls<F> };

    type SpyObj<T> = T & { [K in keyof T]: T[K] extends Fn ? T[K] & Spy<T[K]> : T[K] };

    function createSpy<F extends Fn = Fn>(name?: string, originalFn?: F): Spy<F>;
    function createSpyObj<T>(
      baseName: string,
      methodNames: (keyof T & string)[] | Partial<Record<keyof T & string, unknown>>,
      propertyNames?: (keyof T & string)[] | Partial<Record<keyof T & string, unknown>>,
    ): SpyObj<T>;
    function createSpyObj<T>(
      methodNames: (keyof T & string)[] | Partial<Record<keyof T & string, unknown>>,
      propertyNames?: (keyof T & string)[] | Partial<Record<keyof T & string, unknown>>,
    ): SpyObj<T>;

    /**
     * Los matchers propios del proyecto, como en Jasmine: se declaran aumentando esta interfaz
     * (`declare namespace jasmine { interface Matchers<T> { toHaveCssClass(expected: any): boolean } }`) y se
     * registran con `jasmine.addMatchers`. El `expect()` de Vitest los hereda (ver `Assertion` abajo).
     */
    interface Matchers<T> {}

    interface CustomMatcherResult {
      pass: boolean;
      message?: string;
    }

    interface CustomMatcher {
      compare(actual: any, ...expected: any[]): CustomMatcherResult;
      negativeCompare?(actual: any, ...expected: any[]): CustomMatcherResult;
    }

    type CustomMatcherFactory = (util: { equals(a: unknown, b: unknown): boolean }) => CustomMatcher;

    function addMatchers(matchers: Record<string, CustomMatcherFactory>): void;

    const any: typeof expect.any;
    const anything: typeof expect.anything;
    const objectContaining: typeof expect.objectContaining;
    const arrayContaining: typeof expect.arrayContaining;
    const stringMatching: typeof expect.stringMatching;
    const stringContaining: typeof expect.stringContaining;
  }

  function spyOn<T, K extends keyof T>(
    object: T,
    method: K,
  ): T[K] extends Fn ? jasmine.Spy<T[K]> : never;
  function spyOnProperty<T, K extends keyof T>(object: T, property: K, accessType?: "get" | "set"): jasmine.Spy;
  function fail(error?: unknown): never;
  const xit: typeof it.skip;
  const xdescribe: typeof describe.skip;
  const fit: typeof it.only;
  const fdescribe: typeof describe.only;
}

declare module "vitest" {
  interface Assertion<T = any> extends jasmine.Matchers<T> {
    toBeTrue(): T;
    toBeFalse(): T;
    toHaveBeenCalledOnceWith(...args: unknown[]): T;
    toHaveSize(size: number): T;
    toHaveClass(className: string): T;
  }
}

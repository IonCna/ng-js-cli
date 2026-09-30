import { describe, expect, it, vi } from "vitest";
import { JasmineShim } from "@/test/jasmine-shim.ts";

/** Corre el shim contra globals de mentira (un `it` que guarda lo que recibe) y devuelve esos globals. */
function install(): { it: ((name: string, fn: (...args: unknown[]) => unknown) => void) & { only: unknown }; registered: ((...args: unknown[]) => unknown)[] } {
  const registered: ((...args: unknown[]) => unknown)[] = [];
  const runner = Object.assign((_name: string, fn: (...args: unknown[]) => unknown) => void registered.push(fn), {
    only: (_name: string, fn: (...args: unknown[]) => unknown) => void registered.push(fn),
    skip: () => {},
  });
  const sandbox: Record<string, unknown> = { vi, expect: Object.assign(() => {}, { extend: () => {}, any: () => {} }), it: runner, describe: runner };
  new Function("globalThis", JasmineShim.source())(sandbox);
  return { it: sandbox.it as never, registered };
}

describe("JasmineShim — done de Jasmine", () => {
  it("una función con (done) pasa a devolver una promesa que espera a done(); done.fail() y done(error) la rechazan", async () => {
    const { it: shimmed, registered } = install();
    shimmed("ok", (done: unknown) => setTimeout(done as () => void, 0));
    shimmed("fail", (done: unknown) => (done as { fail(message: string): void }).fail("roto"));
    shimmed("error", function (done: unknown) {
      (done as (error: Error) => void)(new Error("con error"));
    });

    await expect(registered[0]!()).resolves.toBeUndefined();
    await expect(registered[1]!()).rejects.toThrow("roto");
    await expect(registered[2]!()).rejects.toThrow("con error");
  });

  it("el contexto de Vitest desestructurado y las funciones sin parámetros quedan tal cual; también en it.only", () => {
    const { it: shimmed, registered } = install();
    const withContext = ({ expect: e }: { expect: unknown }) => e;
    const plain = () => 1;
    shimmed("ctx", withContext as never);
    shimmed("plain", plain);
    (shimmed.only as (name: string, fn: unknown) => void)("only", (done: () => void) => done());

    expect(registered[0]).toBe(withContext);
    expect(registered[1]).toBe(plain);
    expect(registered[2]!()).toBeInstanceOf(Promise);
  });
});

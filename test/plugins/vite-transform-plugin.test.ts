import { describe, expect, it } from "vitest";
import type { NgjsTransform } from "@/plugins/ngjs-transform.ts";
import { viteTransformPlugin } from "@/plugins/vite-transform-plugin.ts";

describe("viteTransformPlugin", () => {
  it("tiene enforce: 'pre' (crítico: debe correr antes del transform interno de Vite)", () => {
    const plugin = viteTransformPlugin([]);
    expect(plugin.enforce).toBe("pre");
  });

  it("ignora archivos que no terminan en .ts", async () => {
    const calls: string[] = [];
    const track: NgjsTransform = {
      async transform(code) {
        calls.push(code);
        return undefined;
      },
    };

    const plugin = viteTransformPlugin([track]);
    // @ts-expect-error — `transform` en el tipo `Plugin` de Vite puede ser objeto/función; acá siempre es función.
    const result = await plugin.transform("const x = 1;", "foo.js");

    expect(result).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("corre los transforms en orden, encadenando el resultado, y solo transforma si algo cambió", async () => {
    const calls: string[] = [];
    const replaceValue: NgjsTransform = {
      async transform(code) {
        calls.push("replaceValue");
        return code.replace("1", "42");
      },
    };
    const noop: NgjsTransform = {
      async transform() {
        calls.push("noop");
        return undefined;
      },
    };

    const plugin = viteTransformPlugin([replaceValue, noop]);
    // @ts-expect-error — ver nota arriba.
    const result = await plugin.transform("const x = 1;", "foo.ts");

    expect(calls).toEqual(["replaceValue", "noop"]);
    expect(result).toEqual({ code: "const x = 42;", map: null });
  });

  it("devuelve undefined si ningún transform cambió el código", async () => {
    const noop: NgjsTransform = { async transform() { return undefined; } };

    const plugin = viteTransformPlugin([noop]);
    // @ts-expect-error — ver nota arriba.
    const result = await plugin.transform("const x = 1;", "foo.ts");

    expect(result).toBeUndefined();
  });
});

import type { NgjsTransform } from "@/plugins/ngjs-transform.ts";
import type { Plugin } from "vite";

/**
 * Equivalente de `pluginLoader` (esbuild) para Vite — corre la misma cadena
 * de `NgjsTransform` en un solo `transform` hook. `enforce: "pre"` es
 * crítico: el transform interno de Vite (`vite:esbuild`) borra las
 * anotaciones de tipo antes de los plugins de prioridad normal — sin esto,
 * SWC (parte de la cadena) no puede armar `design:paramtypes`.
 */
export function viteTransformPlugin(transforms: NgjsTransform[]): Plugin {
  return {
    name: "ngjs-compiler",
    enforce: "pre",
    async transform(code, id) {
      if (!id.endsWith(".ts")) return;

      let result = code;
      for (const transform of transforms) {
        const next = await transform.transform(result, id);
        if (next !== undefined) result = next;
      }

      return result === code ? undefined : { code: result, map: null };
    },
  };
}

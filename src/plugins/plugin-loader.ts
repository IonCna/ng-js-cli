import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";
import type { NgjsTransform } from "@/plugins/ngjs-transform.ts";

/**
 * Único `onLoad` real de esbuild — esbuild solo deja que UNO se quede con
 * cada archivo, así que en vez de un `Plugin` por transform, hay un solo
 * `Plugin` acá que los corre en secuencia, en el orden que le pasen.
 *
 * `fileReplacements`: clave = ruta absoluta de `replace`, valor = ruta
 * absoluta de `with` (environments) — se resuelve ANTES de leer, así el
 * archivo reemplazado también pasa por la cadena de transforms (template
 * scoping, metadata de SWC) como cualquier otro.
 */
export function pluginLoader(transforms: NgjsTransform[], fileReplacements: Record<string, string> = {}): Plugin {
  return {
    name: "ngjs-plugin-loader",
    setup(build) {
      build.onLoad({ filter: /\.ts$/ }, async (args) => {
        const path = fileReplacements[args.path] ?? args.path;
        let code = await readFile(path, "utf8");

        for (const transform of transforms) {
          const result = await transform.transform(code, path);
          if (result !== undefined) code = result;
        }

        return { contents: code, loader: "js" };
      });
    },
  };
}

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PostcssConfiguration } from "@/build/postcss-configuration.ts";
import type * as esbuild from "esbuild";

/** Lo que se usa de la API de `sass` (el paquete lo instala el proyecto: el CLI no lo trae). */
interface SassCompiler {
  compile(path: string, options: SassOptions): { css: string; loadedUrls: URL[] };
}

export interface SassOptions {
  loadPaths: string[];
  style: "expanded";
  quietDeps: boolean;
  silenceDeprecations: "import"[];
}

/**
 * Estilos globales en Sass, como Angular real: una entrada `.scss`/`.sass` de `styles` (o un `@import` a una desde un
 * `.css`) se compila a CSS antes de que esbuild resuelva sus `@import`/`url()`. Así un proyecto arma su propio
 * Bootstrap con solo las partes que usa:
 *
 *     @import "bootstrap/scss/functions";
 *     @import "bootstrap/scss/variables";
 *     @import "bootstrap/scss/buttons";
 *
 * - `sass` se resuelve desde el proyecto (lo instala el usuario, como los plugins de PostCSS) — el mismo que usa Vite
 *   en `serve`.
 * - Los imports sin `./` se buscan también en `node_modules` del proyecto.
 * - Con `postcss.config.json`, el CSS compilado pasa por sus plugins, igual que un `.css`.
 * - Sass no reubica los `url()` de un parcial: se resuelven relativos al archivo de entrada.
 */
export class SassStyles {
  static readonly FILTER = /\.s[ac]ss$/;

  /** Mismas opciones en `build` (acá) y en `serve` (`css.preprocessorOptions` de Vite). */
  static options(root = process.cwd()): SassOptions {
    return {
      loadPaths: [join(root, "node_modules")],
      style: "expanded",
      // Avisos de deprecación de las dependencias (Bootstrap) y del `@import` con que Bootstrap 5 se arma: ruido que
      // el proyecto no puede arreglar.
      quietDeps: true,
      silenceDeprecations: ["import"],
    };
  }

  static esbuildPlugin(root: string, postcss?: PostcssConfiguration): esbuild.Plugin {
    let compiler: Promise<SassCompiler> | undefined;

    return {
      name: "ngjs-sass",
      setup(build) {
        build.onLoad({ filter: SassStyles.FILTER }, async (args) => {
          compiler ??= SassStyles.load(root);
          const result = (await compiler).compile(args.path, SassStyles.options(root));
          const loaded = result.loadedUrls.filter((url) => url.protocol === "file:").map((url) => fileURLToPath(url));
          const processed = await postcss?.process(result.css, args.path);

          return {
            contents: processed?.css ?? result.css,
            loader: "css",
            resolveDir: dirname(args.path),
            watchFiles: [...loaded, ...(processed?.watchFiles ?? [])],
          };
        });
      },
    };
  }

  /** `sass` del proyecto; si no lo tiene, el que el propio CLI alcance a resolver. */
  private static async load(root: string): Promise<SassCompiler> {
    let specifier = "sass";
    try {
      // Windows: `import()` de un path absoluto (`C:\...`) falla — el loader ESM solo acepta URLs `file://`.
      specifier = pathToFileURL(createRequire(join(root, "package.json")).resolve("sass")).href;
    } catch {
      // No está en el proyecto: se intenta desde el CLI.
    }

    try {
      const module = await import(specifier);
      return (module.default ?? module) as SassCompiler;
    } catch {
      throw new Error('Los estilos usan Sass (.scss/.sass) pero el proyecto no tiene instalado "sass" — agregalo a sus devDependencies.');
    }
  }
}

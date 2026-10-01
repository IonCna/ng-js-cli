import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type * as esbuild from "esbuild";
import type { AcceptedPlugin } from "postcss";

/** Un plugin de la configuración: nombre del paquete + sus opciones. */
type PluginEntry = [name: string, options: unknown];

/**
 * Como Angular real (`loadPostcssConfiguration`): si la raíz del proyecto tiene `postcss.config.json` (o
 * `.postcssrc.json`), los estilos globales pasan por esos plugins — así se integra Tailwind 4:
 *
 *     { "plugins": { "@tailwindcss/postcss": {} } }
 *
 * `plugins` es un objeto (`{ nombre: opciones }`, `false` lo desactiva) o un array (`"nombre"` / `["nombre", opciones]`).
 * Cada plugin se resuelve desde el proyecto (lo instala el usuario, no el CLI). Solo JSON, como Angular: un
 * `postcss.config.js` se ignora.
 */
export class PostcssConfiguration {
  private static readonly FILE_NAMES = ["postcss.config.json", ".postcssrc.json"];

  private constructor(
    /** Absoluto. */
    readonly path: string,
    readonly plugins: AcceptedPlugin[],
  ) {}

  /** `undefined` si el proyecto no tiene configuración de PostCSS. */
  static async load(root = process.cwd()): Promise<PostcssConfiguration | undefined> {
    const path = PostcssConfiguration.FILE_NAMES.map((name) => join(root, name)).find((candidate) => existsSync(candidate));
    if (!path) return undefined;

    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      throw new Error(`${path}: JSON inválido — ${error instanceof Error ? error.message : String(error)}`);
    }
    const projectRequire = createRequire(join(root, "package.json"));
    const plugins = await Promise.all(
      PostcssConfiguration.entries(raw, path).map(async ([name, options]) => {
        let resolved: string;
        try {
          resolved = projectRequire.resolve(name);
        } catch {
          throw new Error(`${path}: no se encontró el plugin de PostCSS "${name}" — ¿está instalado en el proyecto?`);
        }
        // Windows: `import()` de un path absoluto (`C:\...`) falla — el loader ESM solo acepta URLs `file://`.
        const module = await import(pathToFileURL(resolved).href);
        const factory = module.default ?? module;
        return (typeof factory === "function" ? factory(options) : factory) as AcceptedPlugin;
      }),
    );
    return new PostcssConfiguration(path, plugins);
  }

  /** Normaliza `plugins` a `[nombre, opciones]`, como Angular: los desactivados (`false`) no van. */
  private static entries(raw: unknown, path: string): PluginEntry[] {
    const plugins = (raw as { plugins?: unknown } | null)?.plugins;
    if (Array.isArray(plugins)) {
      return plugins.map((entry): PluginEntry => {
        if (typeof entry === "string") return [entry, undefined];
        if (Array.isArray(entry) && typeof entry[0] === "string") return [entry[0], entry[1]];
        throw new Error(`${path}: cada plugin del array es "nombre" o ["nombre", opciones].`);
      });
    }
    if (plugins && typeof plugins === "object") {
      return Object.entries(plugins).filter(([, options]) => options !== false) as PluginEntry[];
    }
    throw new Error(`${path}: "plugins" tiene que ser un objeto o un array.`);
  }

  /**
   * `build`: procesa cada `.css` que carga esbuild (antes de resolver sus `@import`/`url()`). Las dependencias que
   * reporta un plugin (Tailwind: los fuentes que escanea) van a `watchFiles`.
   */
  esbuildPlugin(): esbuild.Plugin {
    return {
      name: "ngjs-postcss",
      setup: (build) => {
        build.onLoad({ filter: /\.css$/ }, async (args) => {
          const { default: postcss } = await import("postcss");
          const result = await postcss(this.plugins).process(await readFile(args.path, "utf8"), {
            from: args.path,
            to: args.path,
            map: false,
          });
          const watchFiles = result.messages.filter((message) => message.type === "dependency").map((message) => message.file as string);
          return { contents: result.css, loader: "css", watchFiles: [this.path, ...watchFiles] };
        });
      },
    };
  }
}

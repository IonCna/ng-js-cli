import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { OutputHashing, StyleEntry } from "@/config/cli-config.ts";
import * as esbuild from "esbuild";

/** Un bundle de `styles` ya resuelto: varias entradas con el mismo `bundleName` salen concatenadas en orden. */
interface StyleBundle {
  name: string;
  /** Absolutas. */
  inputs: string[];
  inject: boolean;
}

/**
 * `architect.build.options.styles` — los estilos globales, como Angular real: cada entrada es un path
 * (`"src/styles.css"`) o `{ input, bundleName?, inject? }`. Todas van al bundle `styles` salvo que digan otro
 * `bundleName`; `inject: false` lo emite igual pero sin `<link>` en el `index.html` (se carga a mano).
 *
 * - `build`: esbuild bundlea cada grupo en `<outputPath>/<bundleName>.css` — resuelve `@import` (también de
 *   paquetes: `@import "bootstrap/dist/css/bootstrap.css"`) y copia lo que referencian los `url()` a `media/`.
 * - `serve`: Vite sirve el fuente: un `<link>` por archivo (así el HMR de CSS de Vite los actualiza) y
 *   `/<bundleName>.css` responde un `@import` de sus archivos, para los `inject: false`.
 */
export class GlobalStyles {
  private static readonly ASSET_LOADERS: Record<string, esbuild.Loader> = Object.fromEntries(
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".otf"].map(
      (extension) => [extension, "file"],
    ),
  );

  /** `url(/img/x.png)`: absoluta al sitio (un `assets` publicado), no un archivo a bundlear — queda tal cual. */
  private static readonly SITE_URLS: esbuild.Plugin = {
    name: "ngjs-site-urls",
    setup(build) {
      build.onResolve({ filter: /^\// }, (args) => (args.kind === "url-token" ? { path: args.path, external: true } : undefined));
    },
  };

  private constructor(
    private readonly root: string,
    private readonly bundles: StyleBundle[],
  ) {}

  static from(entries: (string | StyleEntry)[] | undefined, root = process.cwd()): GlobalStyles {
    const bundles = new Map<string, StyleBundle>();
    for (const entry of entries ?? []) {
      const { input, bundleName = "styles", inject = true } = typeof entry === "string" ? { input: entry } : entry;
      const bundle = bundles.get(bundleName) ?? { name: bundleName, inputs: [], inject: false };
      bundle.inputs.push(resolve(root, input));
      bundle.inject ||= inject;
      bundles.set(bundleName, bundle);
    }
    return new GlobalStyles(root, [...bundles.values()]);
  }

  /** Los `.css` a enlazar en el `index.html` (relativos a `outputPath`), en orden, sin hash — con hash los da `build()`. */
  get injected(): string[] {
    return this.bundles.filter((bundle) => bundle.inject).map((bundle) => `${bundle.name}.css`);
  }

  /**
   * Bundlea cada grupo en `<outputPath>/<bundleName>.css` y devuelve los que se inyectan (relativos a `outputPath`),
   * en orden. `outputHashing` (como Angular): `bundles`/`all` → `<bundleName>-<hash>.css`; `media`/`all` → lo que
   * copian los `url()` sale como `media/<nombre>-<hash>`.
   */
  async build(
    outputPath: string,
    options: { minify: boolean; sourceMap: boolean; outputHashing?: OutputHashing },
  ): Promise<string[]> {
    const hashing = options.outputHashing ?? "none";
    const hashBundles = hashing === "all" || hashing === "bundles";
    const hashMedia = hashing === "all" || hashing === "media";
    const outDir = join(this.root, outputPath);

    const built = await Promise.all(
      this.bundles.map(async (bundle) => {
        const outfile = join(outDir, `${bundle.name}.css`);
        const result = await esbuild.build({
          stdin: {
            contents: bundle.inputs.map((input) => `@import ${JSON.stringify(input)};`).join("\n"),
            resolveDir: this.root,
            sourcefile: `${bundle.name}.css`,
            loader: "css",
          },
          outfile,
          bundle: true,
          minify: options.minify,
          sourcemap: options.sourceMap,
          loader: GlobalStyles.ASSET_LOADERS,
          assetNames: hashMedia ? "media/[name]-[hash]" : "media/[name]",
          plugins: [GlobalStyles.SITE_URLS],
          charset: "utf8",
          logLevel: "silent",
          // Se escribe a mano: con hash, el `.css` cambia de nombre (y su `.map` con él).
          write: false,
        });

        const css = result.outputFiles.find((file) => file.path === outfile);
        const fileName = hashBundles && css ? `${bundle.name}-${GlobalStyles.hash(css.contents)}.css` : `${bundle.name}.css`;
        for (const file of result.outputFiles) {
          let target = file.path;
          let contents: Uint8Array | string = file.contents;
          if (file.path === outfile) {
            target = join(outDir, fileName);
            // El `.css` apunta a su mapa por nombre: sigue al renombre.
            contents = file.text.replace(`sourceMappingURL=${bundle.name}.css.map`, `sourceMappingURL=${fileName}.map`);
          } else if (file.path === `${outfile}.map`) {
            target = join(outDir, `${fileName}.map`);
          }
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, contents);
        }
        return { bundle, fileName };
      }),
    );
    return built.filter(({ bundle }) => bundle.inject).map(({ fileName }) => fileName);
  }

  /** Hash corto del contenido, en mayúsculas como los de esbuild (`chunk-ABCD1234.js`). */
  private static hash(contents: Uint8Array): string {
    return createHash("sha256").update(contents).digest("hex").slice(0, 8).toUpperCase();
  }

  /** `serve`: la URL con que Vite sirve cada archivo fuente (relativa a la raíz del proyecto). */
  sourceUrl(input: string): string {
    return `/${relative(this.root, input).split(sep).join("/")}`;
  }

  /** `serve`: un `<link>` por archivo de los bundles inyectados, en orden. */
  get injectedSourceUrls(): string[] {
    return this.bundles.filter((bundle) => bundle.inject).flatMap((bundle) => bundle.inputs.map((input) => this.sourceUrl(input)));
  }

  /** `serve`: el `/<bundleName>.css` de un bundle — `@import` de sus fuentes, que resuelve Vite. */
  bundleSource(url: string): string | undefined {
    const bundle = this.bundles.find((candidate) => url === `/${candidate.name}.css`);
    return bundle?.inputs.map((input) => `@import url(${JSON.stringify(this.sourceUrl(input))});`).join("\n");
  }
}

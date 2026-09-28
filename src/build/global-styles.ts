import { join, relative, resolve, sep } from "node:path";
import type { StyleEntry } from "@/config/cli-config.ts";
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

  /** `url(/img/x.png)`: absoluta al sitio (algo de `public/`), no un archivo a bundlear — queda tal cual. */
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

  /** Los `.css` a enlazar en el `index.html` del build (relativos a `outputPath`), en orden. */
  get injected(): string[] {
    return this.bundles.filter((bundle) => bundle.inject).map((bundle) => `${bundle.name}.css`);
  }

  async build(outputPath: string, options: { minify: boolean; sourceMap: boolean }): Promise<void> {
    await Promise.all(
      this.bundles.map((bundle) =>
        esbuild.build({
          stdin: {
            contents: bundle.inputs.map((input) => `@import ${JSON.stringify(input)};`).join("\n"),
            resolveDir: this.root,
            sourcefile: `${bundle.name}.css`,
            loader: "css",
          },
          outfile: join(this.root, outputPath, `${bundle.name}.css`),
          bundle: true,
          minify: options.minify,
          sourcemap: options.sourceMap,
          loader: GlobalStyles.ASSET_LOADERS,
          assetNames: "media/[name]-[hash]",
          plugins: [GlobalStyles.SITE_URLS],
          charset: "utf8",
          logLevel: "silent",
        }),
      ),
    );
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

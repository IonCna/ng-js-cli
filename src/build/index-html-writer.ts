import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** `index` resuelto de `ngjs.json`: `input` relativo al proyecto, `output` relativo a `outputPath`. */
export interface IndexHtmlOptions {
  input: string;
  output: string;
}

/** Lo que el build carga además de los entries (rutas relativas a `outputPath`). */
export interface IndexHtmlExtras {
  /** La plataforma (`ɵngjsPlatform`) cuando no va en el `banner`: un `<script defer>` justo antes del primer entry. */
  platform?: string;
  /** Chunks que los entries importan estáticamente: `<link rel="modulepreload">` antes de `</head>`, como Angular. */
  modulePreloads?: string[];
}

/**
 * El `index.html` de una aplicación en el build: el mismo que sirve Vite en `serve` (un `<script type="module"
 * src="/src/index.ts">` apuntando al entry fuente), con cada script de un entry point reescrito al bundle que
 * emitió esbuild (`index.js`). Si el HTML no referencia ningún entry, se agregan antes de `</body>`, como Angular.
 * La plataforma (`ɵngjsPlatform`) va en el `banner` del bundle o, si el build la emite aparte (`extras.platform`),
 * en un `<script defer>` antes del entry: los `defer` y los módulos corren en orden de documento, así que corre antes
 * que cualquier módulo de la app, como el `<script>` que pone Vite en `serve`. Los estilos globales inyectados
 * (`styles`) y los `modulepreload` van antes de `</head>`, en orden, como Angular.
 */
export class IndexHtmlWriter {
  private static readonly SCRIPT = /<script\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi;

  private constructor(
    private readonly root: string,
    private readonly entryPoints: Record<string, string>,
    private readonly outputPath: string,
    private readonly options: IndexHtmlOptions,
    /** `.css` relativos a `outputPath` (`GlobalStyles.build()`). */
    private readonly styles: string[],
    /** Nombre de entry → `.js` que emitió esbuild (relativo a `outputPath`); sin entrada, `<nombre>.js`. */
    private readonly bundleFiles: Record<string, string>,
    /** `deployUrl` normalizado (con `/` final); `""` → relativo al `index.html` emitido. */
    private readonly deployUrl: string,
    private readonly extras: IndexHtmlExtras,
  ) {}

  static from(
    entryPoints: Record<string, string>,
    outputPath: string,
    options: IndexHtmlOptions,
    styles: string[] = [],
    bundleFiles: Record<string, string> = {},
    deployUrl = "",
    extras: IndexHtmlExtras = {},
  ): IndexHtmlWriter {
    return new IndexHtmlWriter(process.cwd(), entryPoints, outputPath, options, styles, bundleFiles, deployUrl, extras);
  }

  async write(): Promise<void> {
    const html = await readFile(join(this.root, this.options.input), "utf8");
    const target = join(this.root, this.outputPath, this.options.output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, this.transform(html));
  }

  transform(html: string): string {
    return this.injectHead(this.rewriteScripts(html));
  }

  private injectHead(html: string): string {
    const links = [
      ...this.styles.map((href) => `<link rel="stylesheet" href="${this.prefix()}${href}">`),
      ...(this.extras.modulePreloads ?? []).map((href) => `<link rel="modulepreload" href="${this.prefix()}${href}">`),
    ].join("\n");
    if (!links) return html;
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${links}\n</head>`);
    return /<body\b/i.test(html) ? html.replace(/<body\b/i, `${links}\n<body`) : `${links}\n${html}`;
  }

  private rewriteScripts(html: string): string {
    const bundles = this.bundlesBySource();
    let matched = false;

    const rewritten = html.replace(IndexHtmlWriter.SCRIPT, (tag, before: string, quote: string, src: string, after: string) => {
      const bundle = bundles.get(this.resolveSource(src));
      if (!bundle) return tag;
      // La plataforma, una sola vez: antes del primer entry.
      const platform = matched ? "" : this.platformTag();
      matched = true;
      return `${platform}<script${before}src=${quote}${bundle}${quote}${after}></script>`;
    });
    if (matched) return rewritten;

    const tags = [...bundles.values()].map((bundle) => `<script type="module" src="${bundle}"></script>`).join("\n");
    const scripts = `${this.platformTag()}${tags}`;
    return /<\/body>/i.test(rewritten) ? rewritten.replace(/<\/body>/i, `${scripts}\n</body>`) : `${rewritten}\n${scripts}\n`;
  }

  /** `<script defer>` de la plataforma, con su salto de línea; `""` si va en el `banner`. */
  private platformTag(): string {
    return this.extras.platform ? `<script defer src="${this.prefix()}${this.extras.platform}"></script>\n` : "";
  }

  /** Ruta absoluta del entry fuente → URL del bundle, relativa al `index.html` emitido. */
  private bundlesBySource(): Map<string, string> {
    const prefix = this.prefix();
    return new Map(
      Object.entries(this.entryPoints).map(([name, source]) => [resolve(this.root, source), `${prefix}${this.bundleFiles[name] ?? `${name}.js`}`]),
    );
  }

  /** `deployUrl` si hay; si no, de la carpeta del `index.html` emitido a `outputPath` (`app/index.html` → `../`). */
  private prefix(): string {
    if (this.deployUrl) return this.deployUrl;
    const depth = this.options.output.split(/[\\/]/).length - 1;
    return depth ? "../".repeat(depth) : "";
  }

  /** `/src/index.ts?x` o `src/index.ts` → absoluta desde la raíz del proyecto (la raíz de Vite en `serve`). */
  private resolveSource(src: string): string {
    const [path = src] = src.split(/[?#]/);
    return resolve(this.root, path.replace(/^\/+/, ""));
  }
}

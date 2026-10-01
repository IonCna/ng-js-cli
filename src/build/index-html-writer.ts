import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** `index` resuelto de `ngjs.json`: `input` relativo al proyecto, `output` relativo a `outputPath`. */
export interface IndexHtmlOptions {
  input: string;
  output: string;
}

/**
 * El `index.html` de una aplicación en el build: el mismo que sirve Vite en `serve` (un `<script type="module"
 * src="/src/index.ts">` apuntando al entry fuente), con cada script de un entry point reescrito al bundle que
 * emitió esbuild (`index.js`). Si el HTML no referencia ningún entry, se agregan antes de `</body>`, como Angular.
 * La plataforma (`ɵngjsPlatform`) ya va en el `banner` del bundle. Los estilos globales inyectados (`styles`) van
 * como `<link rel="stylesheet">` antes de `</head>`, en orden, como Angular.
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
  ) {}

  static from(
    entryPoints: Record<string, string>,
    outputPath: string,
    options: IndexHtmlOptions,
    styles: string[] = [],
    bundleFiles: Record<string, string> = {},
    deployUrl = "",
  ): IndexHtmlWriter {
    return new IndexHtmlWriter(process.cwd(), entryPoints, outputPath, options, styles, bundleFiles, deployUrl);
  }

  async write(): Promise<void> {
    const html = await readFile(join(this.root, this.options.input), "utf8");
    const target = join(this.root, this.outputPath, this.options.output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, this.transform(html));
  }

  transform(html: string): string {
    return this.injectStyles(this.rewriteScripts(html));
  }

  private injectStyles(html: string): string {
    if (!this.styles.length) return html;
    const links = this.styles.map((href) => `<link rel="stylesheet" href="${this.prefix()}${href}">`).join("\n");
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${links}\n</head>`);
    return /<body\b/i.test(html) ? html.replace(/<body\b/i, `${links}\n<body`) : `${links}\n${html}`;
  }

  private rewriteScripts(html: string): string {
    const bundles = this.bundlesBySource();
    let matched = false;

    const rewritten = html.replace(IndexHtmlWriter.SCRIPT, (tag, before: string, quote: string, src: string, after: string) => {
      const bundle = bundles.get(this.resolveSource(src));
      if (!bundle) return tag;
      matched = true;
      return `<script${before}src=${quote}${bundle}${quote}${after}></script>`;
    });
    if (matched) return rewritten;

    const tags = [...bundles.values()].map((bundle) => `<script type="module" src="${bundle}"></script>`).join("\n");
    return /<\/body>/i.test(rewritten) ? rewritten.replace(/<\/body>/i, `${tags}\n</body>`) : `${rewritten}\n${tags}\n`;
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

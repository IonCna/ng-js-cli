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
 * La plataforma (`ɵngjsPlatform`) ya va en el `banner` del bundle — el HTML no necesita nada más.
 */
export class IndexHtmlWriter {
  private static readonly SCRIPT = /<script\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi;

  private constructor(
    private readonly root: string,
    private readonly entryPoints: Record<string, string>,
    private readonly outputPath: string,
    private readonly options: IndexHtmlOptions,
  ) {}

  static from(entryPoints: Record<string, string>, outputPath: string, options: IndexHtmlOptions): IndexHtmlWriter {
    return new IndexHtmlWriter(process.cwd(), entryPoints, outputPath, options);
  }

  async write(): Promise<void> {
    const html = await readFile(join(this.root, this.options.input), "utf8");
    const target = join(this.root, this.outputPath, this.options.output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, this.transform(html));
  }

  transform(html: string): string {
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
    const depth = this.options.output.split(/[\\/]/).length - 1;
    const prefix = depth ? "../".repeat(depth) : "";
    return new Map(
      Object.entries(this.entryPoints).map(([name, source]) => [resolve(this.root, source), `${prefix}${name}.js`]),
    );
  }

  /** `/src/index.ts?x` o `src/index.ts` → absoluta desde la raíz del proyecto (la raíz de Vite en `serve`). */
  private resolveSource(src: string): string {
    const [path = src] = src.split(/[?#]/);
    return resolve(this.root, path.replace(/^\/+/, ""));
  }
}

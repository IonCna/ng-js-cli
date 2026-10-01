import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetGlob, StyleEntry } from "@/config/cli-config.ts";
import { NgjsCommandConfig } from "@/config/ngjs-command-config.ts";

/** Flags de `ngjs serve` (línea de comandos) — pisan lo que haya en `architect.serve.options`. */
export interface ServeFlags {
  port?: number;
  /** `--proxy-config <path>` — pisa `architect.serve.options.proxyConfig`. */
  proxyConfig?: string;
}

export class ServeConfig extends NgjsCommandConfig {
  private constructor(
    public readonly port: number,
    public readonly allowedHosts: string[],
    /** `ApplicationScanner` (`ng-js-compiler`) escanea desde acá — mismo `sourceRoot` de `ngjs.json`. */
    public readonly sourceRoot: string,
    /** Como `ng serve`: los estilos globales salen de `architect.build.options.styles` (ver `GlobalStyles`). */
    public readonly styles: (string | StyleEntry)[],
    /**
     * Como `ng serve` (su `servePath` sale del `baseHref`): la app se sirve bajo el `<base href>` del `index.html`
     * — los `assets`, los scripts y las URLs relativas (`templates/…`) quedan en el mismo lugar que en el build.
     */
    public readonly baseHref: string,
    /** Como `ng serve`: los `assets` de `architect.build.options`, servidos desde el fuente (ver `Assets`). */
    public readonly assets: (string | AssetGlob)[],
    /** Ruta del JSON de proxies (`proxyConfig`), si hay — ver `ProxyConfiguration`. */
    public readonly proxyConfig: string | undefined,
  ) {
    super();
  }

  static async create(flags: ServeFlags): Promise<ServeConfig> {
    const config = await this.read();
    const options = config.architect.serve?.options ?? {};

    return new ServeConfig(
      flags.port ?? options.port ?? 4200,
      options.allowedHosts ?? [],
      config.sourceRoot,
      config.architect.build.options.styles ?? [],
      await ServeConfig.readBaseHref(join(process.cwd(), "index.html")),
      config.architect.build.options.assets ?? [],
      flags.proxyConfig ?? options.proxyConfig,
    );
  }

  /** El `<base href>` absoluto del `index.html` que sirve Vite (su raíz), con `/` al final; sin uno, `/`. */
  private static async readBaseHref(indexPath: string): Promise<string> {
    const html = await readFile(indexPath, "utf8").catch(() => undefined);
    const href = html?.match(/<base\s[^>]*href\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!href?.startsWith("/")) return "/";
    return href.endsWith("/") ? href : `${href}/`;
  }
}

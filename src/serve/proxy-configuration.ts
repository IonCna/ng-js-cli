import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type ParseError, parse, printParseErrorCode } from "jsonc-parser";
import picomatch from "picomatch";
import { isDynamicPattern } from "tinyglobby";

/**
 * `proxyConfig` de `ng serve`, port de `load-proxy-config.ts` de `@angular/build` (dev-server con Vite): el archivo
 * (`.json` con comentarios, o `.js`/`.mjs`/`.cjs`) relativo a la raíz; forma objeto o array (`context`) de webpack;
 * claves glob → regex (las que empiezan con `^` ya son regex de Vite); `pathRewrite` → `rewrite` (gana la primera
 * regla que cambia el path). El resto de las opciones pasa tal cual a `server.proxy` de Vite.
 */
export class ProxyConfiguration {
  static async load(root: string, proxyConfig: string | undefined): Promise<Record<string, object> | undefined> {
    if (!proxyConfig) return undefined;

    const proxyPath = resolve(root, proxyConfig);
    if (!existsSync(proxyPath)) {
      throw new Error(`Proxy configuration file ${proxyPath} does not exist.`);
    }

    let proxyConfiguration: Record<string, object> | object[];
    if (extname(proxyPath) === ".json") {
      const content = await readFile(proxyPath, "utf-8");
      const parseErrors: ParseError[] = [];
      proxyConfiguration = parse(content, parseErrors, { allowTrailingComma: true });

      if (parseErrors.length > 0) {
        let errorMessage = `Proxy configuration file ${proxyPath} contains parse errors:`;
        for (const parseError of parseErrors) {
          const { line, column } = ProxyConfiguration.jsonErrorLineColumn(parseError.offset, content);
          errorMessage += `\n[${line}, ${column}] ${printParseErrorCode(parseError.error)}`;
        }
        throw new Error(errorMessage);
      }
    } else {
      proxyConfiguration = await import(pathToFileURL(proxyPath).href);
    }

    if ("default" in proxyConfiguration) {
      proxyConfiguration = proxyConfiguration.default as Record<string, object> | object[];
    }

    return ProxyConfiguration.normalize(proxyConfiguration);
  }

  static normalize(proxy: Record<string, object> | object[]): Record<string, object> {
    let normalizedProxy: Record<string, object>;

    if (Array.isArray(proxy)) {
      // Forma array (webpack): cada entrada lista sus paths en `context`.
      normalizedProxy = {};
      for (const proxyEntry of proxy) {
        if (!("context" in proxyEntry) || !Array.isArray(proxyEntry.context)) continue;

        const context: unknown[] = proxyEntry.context;
        delete proxyEntry.context;
        for (const contextEntry of context) {
          if (typeof contextEntry !== "string") continue;
          normalizedProxy[contextEntry] = proxyEntry;
        }
      }
    } else {
      normalizedProxy = proxy;
    }

    for (const key of Object.keys(normalizedProxy)) {
      if (key[0] !== "^" && isDynamicPattern(key)) {
        const pattern = picomatch.makeRe(key).source;
        normalizedProxy[pattern] = normalizedProxy[key]!;
        delete normalizedProxy[key];
      }
    }

    for (const proxyEntry of Object.values(normalizedProxy)) {
      if (
        typeof proxyEntry === "object" &&
        "pathRewrite" in proxyEntry &&
        proxyEntry.pathRewrite &&
        typeof proxyEntry.pathRewrite === "object"
      ) {
        const pathRewriteEntries: [RegExp, string][] = [];
        for (const [pattern, value] of Object.entries(proxyEntry.pathRewrite as Record<string, string>)) {
          pathRewriteEntries.push([new RegExp(pattern), value]);
        }

        (proxyEntry as Record<string, unknown>).rewrite = ProxyConfiguration.pathRewriter.bind(undefined, pathRewriteEntries);
        delete proxyEntry.pathRewrite;
      }
    }

    return normalizedProxy;
  }

  private static pathRewriter(pathRewriteEntries: [RegExp, string][], path: string): string {
    for (const [pattern, value] of pathRewriteEntries) {
      const updated = path.replace(pattern, value);
      if (path !== updated) return updated;
    }
    return path;
  }

  private static jsonErrorLineColumn(offset: number, content: string): { line: number; column: number } {
    if (offset === 0) return { line: 1, column: 1 };

    let line = 0;
    let position = 0;
    while (true) {
      ++line;
      const nextNewline = content.indexOf("\n", position);
      if (nextNewline === -1 || nextNewline > offset) break;
      position = nextNewline + 1;
    }

    return { line, column: offset - position + 1 };
  }
}

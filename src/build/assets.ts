import { createReadStream, statSync } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, normalize, parse, relative, resolve, sep } from "node:path";
import type { AssetGlob } from "@/config/cli-config.ts";
import { lookup } from "mrmime";
import picomatch from "picomatch";
import { glob } from "tinyglobby";

/** Una entrada de `assets` ya normalizada — `input` absoluto; `output` relativo a `outputPath` (`""` = la raíz). */
export interface AssetPattern {
  glob: string;
  input: string;
  output: string;
  ignore: string[];
}

type Request = { url?: string };
type Response = { statusCode: number; setHeader(name: string, value: string): void; end(): void };

/**
 * `architect.build.options.assets` — como Angular 16: cada entrada es un path dentro de `sourceRoot`
 * (`"src/assets"`, `"src/favicon.ico"`) o `{ glob, input, output, ignore? }`.
 *
 * - `build`: se copian a `outputPath` (`src/assets/x.png` → `<outputPath>/assets/x.png`).
 * - `serve`: se sirven desde el fuente bajo el `<base href>` (mismas URLs que en el build), sin copiar.
 *
 * Si dos entradas publican el mismo archivo, gana la última (en el build la copia de la última pisa a las anteriores).
 */
export class Assets {
  /** Lo que Angular nunca copia, además del `ignore` de cada entrada. */
  private static readonly ALWAYS_IGNORED = [".gitkeep", "**/.DS_Store", "**/Thumbs.db"];

  private constructor(readonly patterns: AssetPattern[]) {}

  static from(entries: (string | AssetGlob)[] | undefined, sourceRoot: string, root = process.cwd()): Assets {
    const resolvedSourceRoot = resolve(root, sourceRoot);
    return new Assets((entries ?? []).map((entry) => Assets.normalize(entry, resolvedSourceRoot, root)));
  }

  /** `normalizeAssetPatterns` de Angular: un string es un directorio (`**\/*`) o un archivo, publicado con su ruta desde `sourceRoot`. */
  private static normalize(entry: string | AssetGlob, sourceRoot: string, root: string): AssetPattern {
    if (typeof entry === "string") {
      const path = resolve(root, entry);
      if (path !== sourceRoot && !path.startsWith(`${sourceRoot}${sep}`)) {
        throw new Error(`assets: "${entry}" tiene que estar dentro de sourceRoot ("${relative(root, sourceRoot)}") — si no, usá { glob, input, output }.`);
      }
      // Como Angular: si no existe, se toma como directorio (puede crearse después).
      const isDirectory = Assets.isDirectory(path) ?? true;
      const input = isDirectory ? path : dirname(path);
      const output = relative(sourceRoot, input).split(sep).join("/");
      return { glob: isDirectory ? "**/*" : parse(path).base, input, output, ignore: [] };
    }

    if (entry.glob.startsWith("/")) throw new Error(`assets: el glob "${entry.glob}" no puede ser absoluto.`);
    // Como Angular: `"/"`/`"/img/"` son relativos a `outputPath` (se saca la `/` inicial); solo `..` queda afuera.
    const output = normalize(entry.output).split(sep).join("/").replace(/^\.?\/+|\/+$/g, "").replace(/^\.$/, "");
    if (output === ".." || output.startsWith("../")) {
      throw new Error(`assets: "${entry.output}" queda fuera de outputPath — un asset no se puede escribir ahí.`);
    }
    return { glob: entry.glob, input: resolve(root, entry.input), output, ignore: entry.ignore ?? [] };
  }

  private static isDirectory(path: string): boolean | undefined {
    try {
      return statSync(path).isDirectory();
    } catch {
      return undefined;
    }
  }

  /** Copia cada entrada a `outputPath` (relativo a `root`), en orden. */
  async copyTo(outputPath: string, root = process.cwd()): Promise<void> {
    for (const pattern of this.patterns) {
      const files = await glob(pattern.glob, {
        cwd: pattern.input,
        ignore: [...Assets.ALWAYS_IGNORED, ...pattern.ignore],
        dot: true,
        onlyFiles: true,
        expandDirectories: false,
      });
      for (const file of files) {
        const target = join(root, outputPath, pattern.output, file);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(join(pattern.input, file), target);
      }
    }
  }

  /** El archivo fuente que publica `path` (relativo a la raíz publicada, sin `/` inicial), o `undefined`. */
  async resolve(path: string): Promise<string | undefined> {
    for (const pattern of [...this.patterns].reverse()) {
      const prefix = pattern.output ? `${pattern.output}/` : "";
      if (!path.startsWith(prefix)) continue;
      const file = path.slice(prefix.length);
      if (!file || !picomatch.isMatch(file, pattern.glob, { dot: true })) continue;
      if (picomatch.isMatch(file, [...Assets.ALWAYS_IGNORED, ...pattern.ignore], { dot: true })) continue;
      const source = join(pattern.input, file);
      if (!source.startsWith(`${pattern.input}${sep}`)) continue; // `..` en la URL
      const info = await stat(source).catch(() => undefined);
      if (info?.isFile()) return source;
    }
    return undefined;
  }

  /** Middleware connect para `serve`: los assets bajo `baseHref`, leídos del fuente en cada pedido. */
  middleware(baseHref: string) {
    return (request: Request, response: Response & NodeJS.WritableStream, next: (error?: unknown) => void): void => {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://ngjs.local").pathname);
      if (!pathname.startsWith(baseHref)) return next();
      this.resolve(pathname.slice(baseHref.length)).then((source) => {
        if (!source) return next();
        response.statusCode = 200;
        response.setHeader("Content-Type", lookup(source) ?? "application/octet-stream");
        createReadStream(source).on("error", next).pipe(response);
      }, next);
    };
  }
}

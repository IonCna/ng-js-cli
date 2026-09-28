import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import type * as ts from "typescript";

/**
 * `.d.ts` de una librería (`declarations: true`). Dos pasos:
 *
 * 1. `tsc` del PROYECTO (no uno del CLI) con `tsconfig.build.json` si existe — el `tsconfig.json` de desarrollo
 *    suele tener `noEmit` e incluir specs/helpers de test — o `tsconfig.json` si no. Corre con el mismo runtime
 *    que el CLI (`process.execPath`), así funciona igual bajo node que bajo bun. `tsc` no sabe de
 *    decoradores-vía-SWC ni de `templateUrl` inline: solo emite `.d.ts`, nunca JS.
 * 2. Reescribe los especificadores de los `.d.ts`: `tsc` los deja tal cual el fuente, y un consumidor no conoce
 *    los alias de `compilerOptions.paths` (`@ngb/modal/x`) ni resuelve `./x.ts` (`allowImportingTsExtensions`).
 *    Sin esto los tipos importados quedan sin resolver (errores, o `any` en silencio con `skipLibCheck`).
 *    Alias y relativos pasan a relativos con `.js` real (archivo o barrel `x/index.js`), como pide `nodenext`.
 */
export class DeclarationEmitter {
  private static readonly SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\2/g;
  private static readonly SOURCE_EXTENSION = /\.(?:[cm]?tsx?|[cm]?jsx?)$/;

  private constructor(
    private readonly root: string,
    private readonly tsconfig: string,
    /** Carpeta raíz del fuente: `types/` la espeja (`src/modal/x.ts` → `types/modal/x.d.ts`). */
    private readonly rootDir: string,
    private readonly typesDir: string,
    /** `compilerOptions.paths` absolutos (resueltos contra `baseUrl` o el tsconfig que los define). */
    private readonly paths: [pattern: string, targets: string[]][],
  ) {}

  static from(sourceRoot: string, outputPath: string, root = process.cwd()): DeclarationEmitter {
    const tsconfig = ["tsconfig.build.json", "tsconfig.json"].map((name) => join(root, name)).find(existsSync);
    if (!tsconfig) throw new Error(`"declarations: true" necesita un tsconfig.build.json o tsconfig.json en ${root}.`);

    const options = DeclarationEmitter.readOptions(root, tsconfig);
    const base = options.baseUrl ?? (options as { pathsBasePath?: string }).pathsBasePath ?? dirname(tsconfig);
    const paths = Object.entries(options.paths ?? {}).map(([pattern, targets]): [string, string[]] => [
      pattern,
      targets.map((target) => resolve(base, target)),
    ]);

    return new DeclarationEmitter(root, tsconfig, resolve(root, sourceRoot), resolve(root, outputPath, "types"), paths);
  }

  /** Solo para `rewrite()` (sin `tsc`): `paths` ya absolutos. */
  static forPaths(rootDir: string, typesDir: string, paths: Record<string, string[]>): DeclarationEmitter {
    return new DeclarationEmitter(rootDir, "", rootDir, typesDir, Object.entries(paths));
  }

  async emit(): Promise<void> {
    execFileSync(
      process.execPath,
      [
        DeclarationEmitter.resolveTsc(this.root),
        "-p",
        this.tsconfig,
        "--noEmit",
        "false",
        "--declaration",
        "--emitDeclarationOnly",
        "--rootDir",
        this.rootDir,
        "--outDir",
        this.typesDir,
      ],
      { stdio: "inherit", cwd: this.root },
    );
    await this.rewrite();
  }

  /** Reescribe todos los `.d.ts` de `typesDir`; devuelve cuántos cambió. Idempotente. */
  async rewrite(): Promise<number> {
    let touched = 0;
    for (const file of await DeclarationEmitter.listDeclarations(this.typesDir)) {
      const source = await readFile(file, "utf8");
      const next = source.replace(
        DeclarationEmitter.SPECIFIER,
        (_match, prefix: string, quote: string, specifier: string) =>
          `${prefix}${quote}${this.rewriteSpecifier(file, specifier)}${quote}`,
      );
      if (next !== source) {
        await writeFile(file, next);
        touched += 1;
      }
    }
    return touched;
  }

  /** `fromFile` es un `.d.ts` dentro de `typesDir`. Paquetes externos quedan intactos. */
  rewriteSpecifier(fromFile: string, specifier: string): string {
    if (/^\.\.?(\/|$)/.test(specifier)) {
      const base = resolve(dirname(fromFile), specifier);
      const target = this.resolveDeclaration(base.replace(DeclarationEmitter.SOURCE_EXTENSION, ""));
      if (target) return DeclarationEmitter.relativeSpecifier(fromFile, target);
      return specifier.replace(/\.([cm]?)tsx?$/, ".$1js");
    }

    for (const source of this.aliasTargets(specifier)) {
      const fromRoot = relative(this.rootDir, source.replace(DeclarationEmitter.SOURCE_EXTENSION, ""));
      if (fromRoot.startsWith("..")) continue;
      const target = this.resolveDeclaration(join(this.typesDir, fromRoot));
      if (target) return DeclarationEmitter.relativeSpecifier(fromFile, target);
    }
    return specifier;
  }

  /** Como el resolver de `tsc`: un patrón exacto antes que uno con `*`, y entre los `*` el de prefijo más largo. */
  private aliasTargets(specifier: string): string[] {
    const exact = this.paths.find(([pattern]) => pattern === specifier);
    if (exact) return exact[1];

    const wildcard = this.paths
      .filter(([pattern]) => {
        const star = pattern.indexOf("*");
        if (star < 0) return false;
        const [prefix, suffix] = [pattern.slice(0, star), pattern.slice(star + 1)];
        return specifier.length >= prefix.length + suffix.length && specifier.startsWith(prefix) && specifier.endsWith(suffix);
      })
      .sort(([a], [b]) => b.indexOf("*") - a.indexOf("*"))[0];
    if (!wildcard) return [];

    const [pattern, targets] = wildcard;
    const star = pattern.indexOf("*");
    const captured = specifier.slice(star, specifier.length - (pattern.length - star - 1));
    return targets.map((target) => target.replace("*", captured));
  }

  /** `base` sin extensión → el `.js` que acompaña al `.d.ts` emitido (archivo o barrel), si existe. */
  private resolveDeclaration(base: string): string | undefined {
    if (existsSync(`${base}.d.ts`)) return `${base}.js`;
    if (existsSync(join(base, "index.d.ts"))) return join(base, "index.js");
    return undefined;
  }

  private static relativeSpecifier(fromFile: string, target: string): string {
    const path = relative(dirname(fromFile), target).split(sep).join("/");
    return path.startsWith(".") ? path : `./${path}`;
  }

  private static async listDeclarations(directory: string): Promise<string[]> {
    if (!existsSync(directory)) return [];
    const entries = await readdir(directory, { withFileTypes: true, recursive: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".d.ts"))
      .map((entry) => join(entry.parentPath, entry.name));
  }

  private static readOptions(root: string, tsconfig: string): ts.CompilerOptions {
    const typescript = DeclarationEmitter.projectRequire(root)("typescript") as typeof ts;
    const parsed = typescript.getParsedCommandLineOfConfigFile(tsconfig, {}, {
      ...typescript.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(typescript.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    });
    return parsed?.options ?? {};
  }

  private static resolveTsc(root: string): string {
    return DeclarationEmitter.projectRequire(root).resolve("typescript/bin/tsc");
  }

  private static projectRequire(root: string): NodeJS.Require {
    const require = createRequire(join(root, "package.json"));
    try {
      require.resolve("typescript");
    } catch {
      throw new Error(`"declarations: true" necesita \`typescript\` instalado en el proyecto (${root}).`);
    }
    return require;
  }
}

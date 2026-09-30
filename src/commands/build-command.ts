import { watch } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { DeclarationEmitter } from "@/build/declaration-emitter.ts";
import { GlobalStyles } from "@/build/global-styles.ts";
import { IndexHtmlWriter } from "@/build/index-html-writer.ts";
import { Assets } from "@/build/assets.ts";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { BuildConfig, type BuildFlags } from "@/config/build-config.ts";
import * as esbuild from "esbuild";
import { LibraryManifest, type NgjsManifest, pluginLoader } from "ng-js-compiler/esbuild";
import { TemplateCompiler } from "ng-js-template-compiler";
import { TemplateFiles, templateTransform } from "ng-js-vite/esbuild";

type Format = "esm" | "cjs";

export class BuildCommand extends NgjsCommand<BuildConfig> {
  static from(config: BuildConfig): BuildCommand {
    return new BuildCommand(config);
  }

  /**
   * Aplicación: templates en archivos aparte (`templates/nombre-<hash>.html`, como `ng-js-vite` en Vite). Librería:
   * inline — un `/templates/...` apuntaría a archivos que la app que la consume no tiene.
   */
  private readonly templates = this.config.projectType === "application" ? TemplateFiles.create() : undefined;

  /** `disabled="x"` → `ng-disabled="x"` en los templates (ver `ng-js-template-compiler`), antes del scope de `ng-js-vite`. */
  private readonly templateCompiler = TemplateCompiler.create(this.config.sourceRoot);

  /** Librería: lo que publica en `ngjs-manifest.json` (ver `LibraryManifest`), del escaneo del build. */
  private manifest?: NgjsManifest;

  /**
   * `ngjs build --watch`: un build completo y después, con cada cambio bajo `sourceRoot` (agrupados, uno a la vez),
   * otro sin los `.d.ts` (`tsc` es lo lento; no hacen falta para ver el cambio). Pensado para una librería enlazada
   * (`link:`) que consume una app con `ngjs serve`: el `dist` nuevo hace recargar la página.
   */
  async watch(): Promise<void> {
    await this.run();
    console.log(`ngjs build --watch: esperando cambios en ${this.config.sourceRoot}/`);

    let timer: ReturnType<typeof setTimeout> | undefined;
    let building = false;
    let pending = false;
    const rebuild = async (): Promise<void> => {
      if (building) {
        pending = true;
        return;
      }
      building = true;
      const started = Date.now();
      try {
        await this.run({ declarations: false });
        console.log(`ngjs build --watch: reconstruido en ${Date.now() - started}ms`);
      } catch (error) {
        console.error(`ngjs build --watch: el build falló\n${error instanceof Error ? error.message : String(error)}`);
      } finally {
        building = false;
        if (pending) {
          pending = false;
          void rebuild();
        }
      }
    };

    watch(resolve(this.config.sourceRoot), { recursive: true }, (_event, file) => {
      if (file && /\.spec\.ts$/.test(String(file))) return;
      clearTimeout(timer);
      timer = setTimeout(() => void rebuild(), 100);
    });
  }

  async run({ declarations = this.config.declarations }: { declarations?: boolean } = {}): Promise<void> {
    const formats: Format[] = this.config.dualFormat ? ["esm", "cjs"] : ["esm"];
    const styles = GlobalStyles.from(this.config.styles);
    // `--watch` reusa la instancia: cada build publica solo lo que transforma (un componente borrado no queda).
    this.templates?.reset();
    const [results, injectedStyles] = await Promise.all([
      Promise.all(formats.map((format) => this.buildFormat(format))),
      styles.build(this.config.outputPath, {
        minify: this.config.minifyStyles,
        sourceMap: this.config.sourceMap,
        outputHashing: this.config.outputHashing,
      }),
    ]);

    await this.templates?.emit(this.config.outputPath);
    if (this.manifest) {
      const manifestPath = join(this.config.outputPath, LibraryManifest.FILE_NAME);
      await writeFile(manifestPath, `${JSON.stringify(this.manifest, null, 2)}\n`);
    }
    if (this.config.projectType === "application") {
      await Assets.from(this.config.assets, this.config.sourceRoot).copyTo(this.config.outputPath);
    }
    if (this.config.index) {
      const bundleFiles = this.entryFiles(results[0]!);
      await IndexHtmlWriter.from(this.config.entryPoints, this.config.outputPath, this.config.index, injectedStyles, bundleFiles).write();
    }
    if (declarations) await DeclarationEmitter.from(this.config.sourceRoot, this.config.outputPath).emit();
  }

  /** Nombre de entry → el `.js` que emitió esbuild (relativo a `outputPath`): con `outputHashing` lleva hash. */
  private entryFiles(result: esbuild.BuildResult<{ metafile: true }>): Record<string, string> {
    const sources = new Map(Object.entries(this.config.entryPoints).map(([name, source]) => [resolve(source), name]));
    const files: Record<string, string> = {};
    for (const [output, meta] of Object.entries(result.metafile.outputs)) {
      const name = meta.entryPoint && sources.get(resolve(meta.entryPoint));
      if (name && output.endsWith(".js")) files[name] = relative(this.config.outputPath, output).split(sep).join("/");
    }
    return files;
  }

  private buildFormat(format: Format): Promise<esbuild.BuildResult<{ metafile: true }>> {
    // `outputHashing` (como Angular): los `.js` de entrada con hash; los chunks lazy ya lo llevan. Solo una aplicación:
    // una librería publica sus entradas con nombre fijo (`exports` del `package.json`).
    const hashBundles =
      this.config.projectType === "application" && (this.config.outputHashing === "all" || this.config.outputHashing === "bundles");
    const fileReplacements = Object.fromEntries(
      this.config.fileReplacements.map(({ replace, with: withPath }) => [resolve(replace), resolve(withPath)]),
    );

    return esbuild.build({
      entryPoints: this.config.entryPoints,
      outdir: this.config.outputPath,
      outExtension: format === "cjs" ? { ".js": ".cjs" } : undefined,
      entryNames: hashBundles ? "[name]-[hash]" : "[name]",
      metafile: true,
      bundle: true,
      format,
      // Varios entry points (subpaths de una librería) comparten módulos: sin `splitting` cada entry trae su propia
      // copia de las clases (`instanceof` falla entre subpaths) y de los `angular.module` (se registran dos veces).
      // En una aplicación, además, cada `import()` (`loadChildren`/`loadComponent`) sale como chunk propio — sin
      // esto quedaría dentro del bundle inicial. El `banner` (plataforma + zona) se repite por chunk: los dos tienen
      // guard (`ɵngjsPlatform`/`ɵngjsZonePatched`). esbuild solo lo soporta en ESM.
      splitting: format === "esm" && (this.config.projectType === "application" || Object.keys(this.config.entryPoints).length > 1),
      platform: "browser",
      target: "es2022",
      // `angular` lo importa el compilado (`ModuleWriter`): va dentro del bundle salvo que `ngjs.json` lo liste en `external`.
      external: this.config.external,
      sourcemap: this.config.sourceMap,
      minify: this.config.minify,
      // sin esto esbuild escapa `ɵ` (`ɵ`) — válido pero ilegible; `ɵcmp` queda literal.
      charset: "utf8",
      plugins: [
        SingletonPackages.plugin(["angular"], this.config.external),
        pluginLoader(this.config.sourceRoot, [this.templateCompiler, this.templates ?? templateTransform], fileReplacements, this.config.projectType, (scanner) => {
          if (this.config.projectType === "library") this.manifest = LibraryManifest.from(scanner);
        }),
      ],
    });
  }
}

/**
 * Como `resolve.dedupe` de Vite: una librería enlazada (`link:ngjs-core`) resuelve SU copia de `node_modules/angular`,
 * y esbuild metería dos AngularJS en el bundle ("Tried to load AngularJS more than once", dos `angular.module`
 * distintos). Cada paquete listado se resuelve siempre desde el proyecto (`process.cwd()`), una sola copia.
 */
class SingletonPackages {
  static plugin(packages: string[], external: string[]): esbuild.Plugin {
    const bundled = packages.filter((name) => !external.includes(name));
    const filter = new RegExp(`^(${bundled.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`);
    const projectRequire = createRequire(join(process.cwd(), "package.json"));

    return {
      name: "ngjs-singleton-packages",
      setup(build) {
        if (!bundled.length) return;
        build.onResolve({ filter }, (args) => ({ path: projectRequire.resolve(args.path) }));
      },
    };
  }
}

/** Lo que `commander` invoca en `.action(...)` — todo lo que necesita para registrar el comando vive acá al lado. */
export async function runBuildCommand(flags: BuildFlags): Promise<void> {
  const config = await BuildConfig.create(flags);
  const cmd = BuildCommand.from(config);
  if (flags.watch) await cmd.watch();
  else await cmd.run();
}

export const buildCommandDefinition = {
  name: "build",
  alias: "b",
};

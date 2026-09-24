import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { IndexHtmlWriter } from "@/build/index-html-writer.ts";
import { PublicDir } from "@/build/public-dir.ts";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { BuildConfig, type BuildFlags } from "@/config/build-config.ts";
import * as esbuild from "esbuild";
import { pluginLoader } from "ng-js-compiler/esbuild";
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

  async run(): Promise<void> {
    const formats: Format[] = this.config.dualFormat ? ["esm", "cjs"] : ["esm"];
    await Promise.all(formats.map((format) => this.buildFormat(format)));

    await this.templates?.emit(this.config.outputPath);
    if (this.config.projectType === "application") await PublicDir.copyTo(this.config.outputPath);
    if (this.config.index) {
      await IndexHtmlWriter.from(this.config.entryPoints, this.config.outputPath, this.config.index).write();
    }
    if (this.config.declarations) this.emitDeclarations();
  }

  private buildFormat(format: Format): Promise<esbuild.BuildResult> {
    const fileReplacements = Object.fromEntries(
      this.config.fileReplacements.map(({ replace, with: withPath }) => [resolve(replace), resolve(withPath)]),
    );

    return esbuild.build({
      entryPoints: this.config.entryPoints,
      outdir: this.config.outputPath,
      outExtension: format === "cjs" ? { ".js": ".cjs" } : undefined,
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
        pluginLoader(this.config.sourceRoot, [this.templates ?? templateTransform], fileReplacements, this.config.projectType),
      ],
    });
  }

  /**
   * `tsc` no sabe de decoradores-vía-SWC ni de `templateUrl` inline — solo emite `.d.ts`, nunca JS (`emitDeclarationOnly`).
   * Corre el `tsc` del PROYECTO (no uno del CLI) con el mismo runtime que corre el CLI (`process.execPath`),
   * así funciona igual bajo node que bajo bun.
   */
  private emitDeclarations(): void {
    execFileSync(
      process.execPath,
      [this.resolveTsc(), "--emitDeclarationOnly", "--declaration", "--outDir", `${this.config.outputPath}/types`],
      { stdio: "inherit" },
    );
  }

  private resolveTsc(): string {
    try {
      return createRequire(join(process.cwd(), "package.json")).resolve("typescript/bin/tsc");
    } catch {
      throw new Error(`"declarations: true" necesita \`typescript\` instalado en el proyecto (${process.cwd()}).`);
    }
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
  await cmd.run();
}

export const buildCommandDefinition = {
  name: "build",
  alias: "b",
};

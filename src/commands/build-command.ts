import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { BuildConfig, type BuildFlags } from "@/config/build-config.ts";
import * as esbuild from "esbuild";
import { pluginLoader } from "ng-js-compiler/esbuild";
import { templateTransform } from "ng-js-template-plugin";

type Format = "esm" | "cjs";

/** El `ModuleWriter` mete `import angular from "angular"` en cualquier `@NgModule` — siempre external, sin depender de que el usuario lo liste en `ngjs.json`. */
const ALWAYS_EXTERNAL = ["angular"];

export class BuildCommand extends NgjsCommand<BuildConfig> {
  static from(config: BuildConfig): BuildCommand {
    return new BuildCommand(config);
  }

  async run(): Promise<void> {
    const formats: Format[] = this.config.dualFormat ? ["esm", "cjs"] : ["esm"];
    await Promise.all(formats.map((format) => this.buildFormat(format)));

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
      platform: "browser",
      target: "es2022",
      external: [...new Set([...ALWAYS_EXTERNAL, ...this.config.external])],
      sourcemap: this.config.sourceMap,
      minify: this.config.minify,
      // sin esto esbuild escapa `ɵ` (`ɵ`) — válido pero ilegible; `ɵcmp` queda literal.
      charset: "utf8",
      plugins: [pluginLoader(this.config.sourceRoot, [templateTransform], fileReplacements)],
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

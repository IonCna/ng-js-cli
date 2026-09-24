import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import type { FileReplacement } from "@/config/cli-config.ts";
import { TestConfig, type TestFlags } from "@/config/test-config.ts";
import { TestEnvironment } from "@/test/test-environment.ts";
import { viteTransformPlugin } from "ng-js-compiler/vite";
import { templateTransform } from "ng-js-vite/esbuild";
import type { Plugin } from "vite";
import { startVitest } from "vitest/node";

export class TestCommand extends NgjsCommand<TestConfig> {
  /** Donde se escribe el entorno (`TestEnvironment`) — un setup file de Vitest tiene que ser un archivo. */
  private static readonly SETUP_FILE = join("node_modules", ".cache", "ngjs", "test-setup.js");

  static from(config: TestConfig): TestCommand {
    return new TestCommand(config);
  }

  /**
   * `ng test` sin configurar nada: Vitest en jsdom con globals (`describe`/`it`/`expect`, más Jasmine por
   * `TestEnvironment`), sin `vitest.config.ts` del proyecto. Los specs (y todo `sourceRoot`) pasan por el mismo
   * compilador que `serve`, con los templates inline (`templateTransform`, como una librería) — no hay dev-server
   * que sirva `/templates/...`.
   */
  async run(): Promise<void> {
    const setupFile = resolve(TestCommand.SETUP_FILE);
    await mkdir(join(setupFile, ".."), { recursive: true });
    await writeFile(setupFile, TestEnvironment.source(), "utf8");

    await startVitest(
      [],
      {
        config: false,
        root: process.cwd(),
        watch: this.config.watch,
        run: !this.config.watch,
        environment: "jsdom",
        globals: true,
        // Como Jasmine: los `spyOn` se restauran solos después de cada test.
        restoreMocks: true,
        include: this.config.include,
        exclude: ["**/node_modules/**", ...this.config.exclude],
        setupFiles: [setupFile, ...this.config.setupFiles.map((file) => resolve(file))],
        // `ngjs-core` pasa por Vite (no por `require` de Node): así le aplica el `dedupe` de `angular`.
        server: { deps: { inline: ["ngjs-core"] } },
      },
      {
        // `ng-js-compiler` trae su propia copia de `vite`: mismo `Plugin` en runtime, tipo nominal distinto para TS.
        plugins: [
          FileReplacements.plugin(this.config.fileReplacements),
          viteTransformPlugin(this.config.sourceRoot, [templateTransform], this.config.projectType) as Plugin,
        ],
        // Una sola copia de AngularJS: la del proyecto, también para `ngjs-core` (ver `ServeCommand`). `tsconfigPaths`:
        // los alias de `compilerOptions.paths` (`@ngb/*`), como `ngjs build` (esbuild los lee solo) y `ng test`.
        resolve: { dedupe: ["angular"], tsconfigPaths: true },
      },
    );
  }
}

/**
 * `fileReplacements` de `architect.test.options` (`environment.ts` → `environment.test.ts`): cada import que resuelve
 * a un `replace` pasa a resolver al `with`, como el `onLoad` de `pluginLoader` en `ngjs build`.
 */
class FileReplacements {
  static plugin(replacements: FileReplacement[]): Plugin {
    const normalize = (path: string) => resolve(path).replaceAll("\\", "/");
    const byPath = new Map(replacements.map(({ replace, with: withPath }) => [normalize(replace), normalize(withPath)]));

    return {
      name: "ngjs-file-replacements",
      enforce: "pre",
      async resolveId(source, importer, options) {
        if (!byPath.size) return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        return (resolved && byPath.get(normalize(resolved.id))) ?? null;
      },
    };
  }
}

/** Lo que `commander` invoca en `.action(...)` — todo lo que necesita para registrar el comando vive acá al lado. */
export async function runTestCommand(flags: TestFlags): Promise<void> {
  const config = await TestConfig.create(flags);
  const cmd = TestCommand.from(config);
  await cmd.run();
}

export const testCommandDefinition = {
  name: "test",
  alias: "t",
};

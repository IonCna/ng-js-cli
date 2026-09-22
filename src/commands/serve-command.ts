import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { ServeConfig, type ServeFlags } from "@/config/serve-config.ts";
import { viteTransformPlugin } from "ng-js-compiler/vite";
import { ngJsTemplateParser } from "ng-js-vite/vite";
import { createServer, type Plugin } from "vite";

export class ServeCommand extends NgjsCommand<ServeConfig> {
  static from(config: ServeConfig): ServeCommand {
    return new ServeCommand(config);
  }

  async run(): Promise<void> {
    const server = await createServer({
      server: {
        port: this.config.port,
        // Vacío != "sin restricción" para Vite — un array vacío bloquea todo host.
        // Sin overrides propios, mejor dejar que Vite use su default.
        allowedHosts: this.config.allowedHosts.length ? this.config.allowedHosts : undefined,
      },
      // El `ModuleWriter` mete `import angular from "angular"` en cualquier
      // `@NgModule` — excluido del pre-bundling de Vite (`optimizeDeps`, su
      // propio esbuild interno) para que no le haga nada raro, mismo trato
      // que `external` en el esbuild de `build`.
      optimizeDeps: { exclude: ["angular"] },
      // `ng-js-vite` y `ng-js-cli` son repos separados (sin workspace compartido),
      // cada uno con su propia copia de `vite` en `node_modules` — TS ve el
      // `Plugin` de `ngJsTemplateParser()` como un tipo nominal distinto al de
      // ESTE `vite` (mismo paquete, dos instancias). En runtime es el mismo
      // objeto de siempre; el cast es solo para esta discrepancia estructural.
      plugins: [ngJsTemplateParser() as Plugin, viteTransformPlugin(this.config.sourceRoot)],
    });

    await server.listen();
    server.printUrls();
  }
}

/** Lo que `commander` invoca en `.action(...)` — todo lo que necesita para registrar el comando vive acá al lado. */
export async function runServeCommand(flags: ServeFlags): Promise<void> {
  const config = await ServeConfig.create(flags);
  const cmd = ServeCommand.from(config);
  await cmd.run();
}

export const serveCommandDefinition = {
  name: "serve",
  alias: "s",
};

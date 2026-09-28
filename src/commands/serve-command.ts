import { GlobalStyles } from "@/build/global-styles.ts";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { AngularDependencies } from "@/serve/angular-dependencies.ts";
import { ServeConfig, type ServeFlags } from "@/config/serve-config.ts";
import { viteTransformPlugin } from "ng-js-compiler/vite";
import { TemplateFiles } from "ng-js-vite/esbuild";
import { createServer, type Plugin } from "vite";

export class ServeCommand extends NgjsCommand<ServeConfig> {
  static from(config: ServeConfig): ServeCommand {
    return new ServeCommand(config);
  }

  async run(): Promise<void> {
    // Nombre fijo (sin hash): el `templateUrl` lo fija el escaneo al arrancar; el middleware relee el `.html` en
    // cada request, así editar un template se ve al recargar.
    const templates = TemplateFiles.create({ hashed: false });
    const server = await createServer({
      server: {
        port: this.config.port,
        // Vacío != "sin restricción" para Vite — un array vacío bloquea todo host.
        // Sin overrides propios, mejor dejar que Vite use su default.
        allowedHosts: this.config.allowedHosts.length ? this.config.allowedHosts : undefined,
      },
      // `angular` es CommonJS (`module.exports = angular`): Vite lo tiene que pre-bundlear (`optimizeDeps`) para
      // que exista el `import angular from "angular"` que emite `ModuleWriter`. `dedupe`: una librería enlazada
      // (`link:ngjs-core`) resolvería SU copia de `node_modules/angular` — dos AngularJS en la misma página.
      // `tsconfigPaths`: los alias de `compilerOptions.paths` (`@/*`), como `ngjs build` (esbuild) y `ngjs test`.
      resolve: { dedupe: ["angular"], tsconfigPaths: true },
      // `angular` y lo que lo requiere, todo desde el arranque — ver `AngularDependencies` (bug de Vite 8 al
      // re-optimizar a mitad de sesión: "does not provide an export named 'n'").
      optimizeDeps: { include: AngularDependencies.include() },
      // Los templates de `ng-js-vite` van como transform PREVIO del compilador (igual que en `build`), no como plugin
      // de Vite aparte: `ModuleWriter` registra `.component()` en el archivo del `@NgModule` con la metadata del
      // ESCANEO — si el escaneo viera el `templateUrl` crudo, lo emitiría relativo al componente dentro de
      // `app.module.ts`. Así ya ve la URL pública (`/templates/x.html`), que sirve el middleware de abajo.
      // `ng-js-compiler` trae su propia copia de `vite`: mismo `Plugin` en runtime, tipo nominal distinto para TS.
      plugins: [
        viteTransformPlugin(this.config.sourceRoot, [templates]) as Plugin,
        ServeCommand.templatesPlugin(templates),
        ServeCommand.stylesPlugin(GlobalStyles.from(this.config.styles)),
      ],
    });

    await server.listen();
    server.printUrls();
  }

  /**
   * Sirve `/templates/…` y `/styles/…` (`TemplateFiles.middleware`). Esos `.html`/`.css` no están en el grafo de
   * módulos de Vite, así que editarlos no recargaba nada: se da por cambiado el componente dueño (el mismo evento del
   * watcher que al editar el `.ts`): el compilador lo recompila — `ɵngContent` puede cambiar — y Vite recarga.
   */
  private static templatesPlugin(templates: TemplateFiles): Plugin {
    return {
      name: "ngjs-templates",
      configureServer: (server) => {
        server.middlewares.use(templates.middleware());
        const onChange = (file: string) => {
          for (const owner of templates.ownersOf(file)) server.watcher.emit("change", owner);
        };
        server.watcher.on("change", onChange);
        server.watcher.on("unlink", onChange);
      },
    };
  }

  /**
   * `styles` de `architect.build.options`, como `ng serve`: un `<link>` por archivo fuente en el `index.html` (Vite
   * los procesa y les da HMR de CSS) y `/<bundleName>.css` para los que se cargan a mano (`inject: false`).
   */
  private static stylesPlugin(styles: GlobalStyles): Plugin {
    return {
      name: "ngjs-global-styles",
      transformIndexHtml: () =>
        styles.injectedSourceUrls.map((href) => ({
          tag: "link",
          attrs: { rel: "stylesheet", href },
          injectTo: "head" as const,
        })),
      configureServer: (server) =>
        void server.middlewares.use((request, response, next) => {
          const css = styles.bundleSource(request.url?.split("?")[0] ?? "");
          if (css === undefined) return next();
          response.setHeader("Content-Type", "text/css");
          response.end(css);
        }),
    };
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

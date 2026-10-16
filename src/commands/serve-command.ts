import { Assets } from "@/build/assets.ts";
import { GlobalStyles } from "@/build/global-styles.ts";
import { PostcssConfiguration } from "@/build/postcss-configuration.ts";
import { SassStyles } from "@/build/sass-styles.ts";
import { SingletonPackages } from "@/commands/build-command.ts";
import { NgjsCommand } from "@/commands/ngjs-command.ts";
import { AngularDependencies } from "@/serve/angular-dependencies.ts";
import { ProxyConfiguration } from "@/serve/proxy-configuration.ts";
import { ServeConfig, type ServeFlags } from "@/config/serve-config.ts";
import { viteTransformPlugin } from "ng-js-compiler/vite";
import { TemplateCompiler } from "ng-js-template-compiler";
import { TemplateFiles } from "ng-js-vite/esbuild";
import { createServer, type Plugin } from "vite";

export class ServeCommand extends NgjsCommand<ServeConfig> {
  static from(config: ServeConfig): ServeCommand {
    return new ServeCommand(config);
  }

  async run(): Promise<void> {
    // Como `build`: templates dentro del JS salvo `isolateTemplate`. Con él, nombre fijo (sin hash): el `templateUrl`
    // lo fija el escaneo al arrancar; el middleware relee el `.html` en cada request, así editar un template se ve
    // al recargar.
    const templates = TemplateFiles.create({ hashed: false, inline: !this.config.isolateTemplate });
    const templateCompiler = TemplateCompiler.create(this.config.sourceRoot);
    const postcss = await PostcssConfiguration.load();
    const proxy = await ProxyConfiguration.load(process.cwd(), this.config.proxyConfig);
    const server = await createServer({
      base: this.config.baseHref,
      // Como Angular 16: lo estático sale de `assets` (ver `assetsPlugin`), no de un `public/` implícito de Vite.
      publicDir: false,
      server: {
        port: this.config.port,
        // Como `ng serve`: puerto ocupado es error, no otro puerto en silencio (un backend apunta a este).
        strictPort: true,
        // Vacío != "sin restricción" para Vite — un array vacío bloquea todo host.
        // Sin overrides propios, mejor dejar que Vite use su default.
        allowedHosts: this.config.allowedHosts.length ? this.config.allowedHosts : undefined,
        proxy,
      },
      // `angular` es CommonJS (`module.exports = angular`): Vite lo tiene que pre-bundlear (`optimizeDeps`) para
      // que exista el `import angular from "angular"` que emite `ModuleWriter`. `dedupe`: una librería enlazada
      // (`link:ngjs-core`) resolvería SU copia de `node_modules/angular` — dos AngularJS en la misma página.
      // `tsconfigPaths`: los alias de `compilerOptions.paths` (`@/*`), como `ngjs build` (esbuild) y `ngjs test`.
      // Como `build` (y Angular): PostCSS solo con `postcss.config.json`/`.postcssrc.json` — inline, así Vite no
      // busca por su cuenta un `postcss.config.js` que el build ignoraría.
      // Sass (`.scss`/`.sass` en `styles`): lo compila Vite con el `sass` del proyecto y las opciones del build.
      css: {
        postcss: { plugins: postcss?.plugins ?? [] },
        preprocessorOptions: { scss: SassStyles.options(), sass: SassStyles.options() },
      },
      // Los mismos paquetes que `build` resuelve desde el proyecto (ver `SingletonPackages`): `angular` y los peers de
      // las dependencias (`rxjs`) — sin esto cada librería enlazada trae su copia y Vite pre-bundlea las dos.
      resolve: { dedupe: SingletonPackages.names(), tsconfigPaths: true },
      // `angular` y lo que lo requiere, todo desde el arranque — ver `AngularDependencies` (bug de Vite 8 al
      // re-optimizar a mitad de sesión: "does not provide an export named 'n'").
      // `entries`: Vite busca dependencias desde todos los `.html` de su raíz; en un workspace eso incluye el
      // `index.html` de otro proyecto, cuyo código este escaneo no conoce. Solo el `index` del proyecto que se sirve.
      optimizeDeps: { include: AngularDependencies.include(), entries: [this.config.index] },
      // Los templates de `ng-js-vite` van como transform PREVIO del compilador (igual que en `build`), no como plugin
      // de Vite aparte: `ModuleWriter` registra `.component()` en el archivo del `@NgModule` con la metadata del
      // ESCANEO — si el escaneo viera el `templateUrl` crudo, lo emitiría relativo al componente dentro de
      // `app.module.ts`. Así ya ve la URL pública (`/templates/x.html`), que sirve el middleware de abajo.
      // `ng-js-compiler` trae su propia copia de `vite`: mismo `Plugin` en runtime, tipo nominal distinto para TS.
      plugins: [
        viteTransformPlugin(this.config.sourceRoot, [templateCompiler, templates]) as Plugin,
        ServeCommand.templatesPlugin(templates, templateCompiler),
        ServeCommand.stylesPlugin(GlobalStyles.from(this.config.styles), this.config.baseHref),
        ServeCommand.assetsPlugin(Assets.from(this.config.assets, this.config.sourceRoot), this.config.baseHref),
        ServeCommand.indexPlugin(this.config.index, this.config.baseHref),
      ],
    });

    await server.listen();
    server.printUrls();
  }

  /**
   * Sirve `/templates/…` y `/media/…` (`TemplateFiles.middleware`). El `.html` y el `.css` de un componente no están
   * en el grafo de módulos de Vite, así que editarlos no recargaba nada: se da por cambiado el componente dueño (el
   * mismo evento del watcher que al editar el `.ts`): el compilador lo recompila — `ɵngContent` puede cambiar, y el
   * CSS va dentro del módulo — y Vite recarga.
   */
  private static templatesPlugin(templates: TemplateFiles, templateCompiler: TemplateCompiler): Plugin {
    return {
      name: "ngjs-templates",
      configureServer: (server) => {
        server.middlewares.use(templates.middleware());
        const onChange = (file: string) => {
          // Un `.html` que `ng-js-template-compiler` reescribió lo sirve su copia: el dueño se conoce por el original.
          const owners = new Set([...templates.ownersOf(file), ...templateCompiler.ownersOf(file)]);
          for (const owner of owners) server.watcher.emit("change", owner);
        };
        server.watcher.on("change", onChange);
        server.watcher.on("unlink", onChange);
      },
    };
  }

  /**
   * Vite sirve el `index.html` de su raíz (la del workspace). Un proyecto con otro `index` (`projects/login/src/index.html`)
   * lo recibe en cada navegación, como `ng serve`: un pedido de HTML a una ruta sin extensión (`/`, `/olvide`) pasa a
   * pedir ese archivo, que Vite transforma igual que el de la raíz.
   */
  static indexPlugin(index: string, baseHref: string): Plugin {
    return {
      name: "ngjs-index",
      configureServer: (server) => {
        if (index === "index.html") return;
        server.middlewares.use((request, _response, next) => {
          const pathname = request.url?.split(/[?#]/)[0] ?? "";
          const navigation =
            (request.method === "GET" || request.method === "HEAD") &&
            Boolean(request.headers.accept?.includes("text/html")) &&
            `${pathname}/`.startsWith(baseHref) &&
            !/\.[^/]+$/.test(pathname);
          if (navigation) request.url = `${baseHref}${index}`;
          next();
        });
      },
    };
  }

  /** `assets` de `architect.build.options`, como `ng serve`: bajo el `<base href>`, releídos del fuente en cada pedido. */
  private static assetsPlugin(assets: Assets, baseHref: string): Plugin {
    return {
      name: "ngjs-assets",
      configureServer: (server) => void server.middlewares.use(assets.middleware(baseHref)),
    };
  }

  /**
   * `styles` de `architect.build.options`, como `ng serve`: un `<link>` por archivo fuente en el `index.html` (Vite
   * los procesa y les da HMR de CSS) y `/<bundleName>.css` para los que se cargan a mano (`inject: false`).
   */
  private static stylesPlugin(styles: GlobalStyles, baseHref: string): Plugin {
    // Vite sirve todo bajo `base` (el `<base href>`): las URLs de la raíz del proyecto van con ese prefijo.
    const withBase = (url: string) => `${baseHref}${url.replace(/^\//, "")}`;
    return {
      name: "ngjs-global-styles",
      transformIndexHtml: () =>
        styles.injectedSourceUrls.map((href) => ({
          tag: "link",
          attrs: { rel: "stylesheet", href: withBase(href) },
          injectTo: "head" as const,
        })),
      configureServer: (server) =>
        void server.middlewares.use((request, response, next) => {
          const pathname = request.url?.split("?")[0] ?? "";
          const css = styles.bundleSource(pathname.startsWith(baseHref) ? `/${pathname.slice(baseHref.length)}` : pathname);
          if (css === undefined) return next();
          response.setHeader("Content-Type", "text/css");
          response.end(css);
        }),
    };
  }
}

/** Lo que `commander` invoca en `.action(...)` — todo lo que necesita para registrar el comando vive acá al lado. */
export async function runServeCommand(project: string | undefined, flags: Omit<ServeFlags, "project">): Promise<void> {
  const config = await ServeConfig.create({ ...flags, project });
  const cmd = ServeCommand.from(config);
  await cmd.run();
}

export const serveCommandDefinition = {
  name: "serve",
  alias: "s",
};

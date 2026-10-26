import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigCommand } from "@/commands/config-command.ts";
import { GenerateCommand } from "@/commands/generate-command.ts";
import { ServeCommand } from "@/commands/serve-command.ts";
import { BuildConfig } from "@/config/build-config.ts";
import type { NgjsProjectConfig, NgjsWorkspace } from "@/config/cli-config.ts";
import { ConfigConfig } from "@/config/config-command-config.ts";
import { ConfigReader } from "@/config/config-reader.ts";
import { GenerateConfig } from "@/config/generate-config.ts";
import { ServeConfig } from "@/config/serve-config.ts";
import { TestConfig } from "@/config/test-config.ts";

/** Workspace como `angular.json`: la app en la raíz y otra en `projects/login`, rutas desde la raíz del workspace. */
const app: NgjsProjectConfig = {
  root: "",
  projectType: "application",
  sourceRoot: "src",
  prefix: "app",
  architect: {
    build: { options: { entryPoints: { main: "src/main.ts" }, outputPath: "dist" } },
    serve: { options: { port: 4200 } },
  },
};

const login: NgjsProjectConfig = {
  root: "projects/login",
  projectType: "application",
  sourceRoot: "projects/login/src",
  prefix: "login",
  architect: {
    build: {
      options: {
        entryPoints: { main: "projects/login/src/main.ts" },
        index: { input: "projects/login/src/index.html" },
        outputPath: "dist/login",
      },
      configurations: { production: { optimization: true } },
    },
    serve: { options: { port: 4201 } },
  },
};

const workspace: NgjsWorkspace = { version: "1", newProjectRoot: "projects", projects: { app, login } };

describe("ngjs.json con varios proyectos", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "ngjs-workspace-test-"));
    process.chdir(dir);
    await writeFile(join(dir, "ngjs.json"), JSON.stringify(workspace));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  describe("ConfigReader.read()", () => {
    it("con nombre, devuelve ese proyecto con la version del workspace", async () => {
      await expect(ConfigReader.read("login")).resolves.toEqual({ version: "1", ...login });
    });

    it("sin nombre, el proyecto cuya root contiene el directorio actual: en la raíz, el de la raíz", async () => {
      expect((await ConfigReader.read()).sourceRoot).toBe("src");
    });

    it("sin nombre y sin proyecto en la raíz, el único que hay", async () => {
      await writeFile(join(dir, "ngjs.json"), JSON.stringify({ version: "1", projects: { login } }));
      expect((await ConfigReader.read()).sourceRoot).toBe("projects/login/src");
    });

    it("sin nombre, varios proyectos y ninguno en la raíz: pide uno", async () => {
      const other = { ...login, root: "projects/other", sourceRoot: "projects/other/src" };
      await writeFile(join(dir, "ngjs.json"), JSON.stringify({ version: "1", projects: { login, other } }));
      await expect(ConfigReader.read()).rejects.toThrow(/nombrá uno \(login, other\)/);
    });

    it("un proyecto que no existe es error, con los que hay", async () => {
      await expect(ConfigReader.read("admin")).rejects.toThrow(/"admin" no existe .*\(hay: app, login\)/);
    });

    it("un ngjs.json de un solo proyecto no acepta nombre", async () => {
      await writeFile(join(dir, "ngjs.json"), JSON.stringify({ version: "1", ...app }));
      await expect(ConfigReader.read()).resolves.toMatchObject({ sourceRoot: "src" });
      await expect(ConfigReader.read("login")).rejects.toThrow(/no define "projects"/);
    });
  });

  describe("build / serve / test / generate", () => {
    it("build toma options y configurations del proyecto elegido", async () => {
      const config = await BuildConfig.create({ project: "login", configuration: "production" });
      expect(config.entryPoints).toEqual({ main: "projects/login/src/main.ts" });
      expect(config.outputPath).toBe("dist/login");
      expect(config.sourceRoot).toBe("projects/login/src");
      expect(config.minify).toBe(true);
    });

    it("build sin `index` busca el index.html en la root del proyecto, no en la del workspace", async () => {
      const { index: _index, ...options } = login.architect.build.options;
      const withoutIndex = { ...login, architect: { build: { options } } };
      await writeFile(join(dir, "ngjs.json"), JSON.stringify({ ...workspace, projects: { app, login: withoutIndex } }));
      await writeFile(join(dir, "index.html"), "<html></html>");
      expect((await BuildConfig.create({ project: "login" })).index).toBeUndefined();

      await mkdir(join(dir, "projects", "login"), { recursive: true });
      await writeFile(join(dir, "projects", "login", "index.html"), "<html></html>");
      expect((await BuildConfig.create({ project: "login" })).index).toEqual({ input: "projects/login/index.html", output: "index.html" });
    });

    it("serve usa el puerto, el index y el <base href> del proyecto", async () => {
      await mkdir(join(dir, "projects", "login", "src"), { recursive: true });
      await writeFile(join(dir, "projects", "login", "src", "index.html"), '<html><head><base href="/login/"></head></html>');
      const config = await ServeConfig.create({ project: "login" });
      expect(config.port).toBe(4201);
      expect(config.index).toBe("projects/login/src/index.html");
      expect(config.baseHref).toBe("/login/");
      expect((await ServeConfig.create({})).index).toBe("index.html");
    });

    it("test corre por default los specs del sourceRoot del proyecto", async () => {
      expect((await TestConfig.create({ project: "login" })).include).toEqual(["projects/login/src/**/*.spec.ts"]);
    });

    it("generate escribe en el sourceRoot y con el prefix del proyecto", async () => {
      const config = await GenerateConfig.create({ schematic: "component", name: "card", project: "login" });
      expect(config.path).toBe(join("projects/login/src", "app"));
      expect(config.prefix).toBe("login");
      expect(config.root).toBe("projects/login");
    });

    it("generate no sube más allá de la root del proyecto buscando el @NgModule", async () => {
      // Un módulo en la raíz del workspace (de otro proyecto) no cuenta para `login`.
      await mkdir(join(dir, "projects", "login", "src", "app"), { recursive: true });
      await writeFile(join(dir, "root.module.ts"), "@NgModule({ declarations: [] })\nexport class RootModule {}\n");
      const config = await GenerateConfig.create({ schematic: "component", name: "card", project: "login", dryRun: true });
      await expect(GenerateCommand.from(config).run()).rejects.toThrow(/No se encontró ningún módulo/);
    });
  });

  describe("ngjs config", () => {
    it("navega y escribe el workspace completo, validado como workspace", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      await ConfigCommand.from(await ConfigConfig.create({ path: "projects.login.architect.serve.options.port" })).run();
      expect(log).toHaveBeenCalledWith("4201");
      log.mockRestore();

      await ConfigCommand.from(await ConfigConfig.create({ path: "projects.login.architect.serve.options.port", value: "4300" })).run();
      const written = JSON.parse(await readFile(join(dir, "ngjs.json"), "utf8")) as NgjsWorkspace;
      expect(written.projects.login?.architect.serve?.options?.port).toBe(4300);
      expect(written.projects.app).toEqual(app);
    });

    it("rechaza un valor que deja un proyecto inválido", async () => {
      const set = ConfigConfig.create({ path: "projects.login.projectType", value: "nope" });
      await expect(ConfigCommand.from(await set).run()).rejects.toThrow(/projects\.login\.projectType/);
    });
  });

  describe("ServeCommand.indexPlugin", () => {
    type Middleware = (request: { url?: string; method?: string; headers: { accept?: string } }, response: unknown, next: () => void) => void;

    function middleware(index: string, baseHref = "/"): Middleware | undefined {
      let registered: Middleware | undefined;
      const server = { middlewares: { use: (fn: Middleware) => (registered = fn) } };
      const plugin = ServeCommand.indexPlugin(index, baseHref);
      (plugin.configureServer as (server: unknown) => void)(server);
      return registered;
    }

    function navigate(fn: Middleware, url: string, accept = "text/html,*/*", method = "GET"): string | undefined {
      const request = { url, method, headers: { accept } };
      fn(request, {}, () => {});
      return request.url;
    }

    it("con el index.html de la raíz no hace nada (Vite ya lo sirve)", () => {
      expect(middleware("index.html")).toBeUndefined();
    });

    it("las navegaciones de HTML piden el index del proyecto; archivos y pedidos que no son HTML pasan igual", () => {
      const fn = middleware("projects/login/src/index.html")!;
      expect(navigate(fn, "/")).toBe("/projects/login/src/index.html");
      expect(navigate(fn, "/recuperar?id=1")).toBe("/projects/login/src/index.html");
      expect(navigate(fn, "/projects/login/src/main.ts")).toBe("/projects/login/src/main.ts");
      expect(navigate(fn, "/", "application/json")).toBe("/");
      expect(navigate(fn, "/", "text/html", "POST")).toBe("/");
    });

    it("respeta el <base href>", () => {
      const fn = middleware("projects/login/src/index.html", "/login/")!;
      expect(navigate(fn, "/login/")).toBe("/login/projects/login/src/index.html");
      expect(navigate(fn, "/login")).toBe("/login/projects/login/src/index.html");
      expect(navigate(fn, "/otra/")).toBe("/otra/");
    });
  });
});

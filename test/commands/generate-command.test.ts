import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GenerateCommand } from "@/commands/generate-command.ts";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { GenerateConfig, type GenerateFlags } from "@/config/generate-config.ts";

async function generate(schematic: string, name: string, flags: Partial<GenerateFlags> = {}): Promise<void> {
  const config = await GenerateConfig.create({ schematic, name, ...flags });
  await GenerateCommand.from(config).run();
}

describe("GenerateCommand", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "ngjs-generate-test-"));
    process.chdir(dir);
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "ngjs.json"),
      JSON.stringify({
        version: "1",
        root: ".",
        projectType: "application",
        sourceRoot: "src",
        architect: { build: { options: { entryPoints: {}, outputPath: "dist" } } },
      } satisfies NgjsConfig),
      "utf8",
    );
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it("genera un componente con decorador real", async () => {
    await generate("component", "card", { skipImport: true });

    const component = await readFile(join(dir, "src", "card.component.ts"), "utf8");
    expect(component).toContain('import { Component } from "ngjs-core";');
    expect(component).toContain('selector: "app-card"');
  });

  it("genera una directiva con selector de atributo", async () => {
    await generate("directive", "highlight", { skipImport: true });

    const directive = await readFile(join(dir, "src", "highlight.directive.ts"), "utf8");
    expect(directive).toContain('import { Directive } from "ngjs-core";');
    expect(directive).toContain('selector: "[appHighlight]"');
  });

  it("genera un pipe implementando PipeTransform", async () => {
    await generate("pipe", "upper", { skipImport: true });

    const pipe = await readFile(join(dir, "src", "upper.pipe.ts"), "utf8");
    expect(pipe).toContain('import { Pipe, type PipeTransform } from "ngjs-core";');
    expect(pipe).toContain("implements PipeTransform");
  });

  it("genera un servicio @Injectable con providedIn root", async () => {
    await generate("service", "user");

    const service = await readFile(join(dir, "src", "user.service.ts"), "utf8");
    expect(service).toContain('import { Injectable } from "ngjs-core";');
    expect(service).toContain('@Injectable({\n  providedIn: "root",\n})');
  });

  it("genera un módulo con declarations/imports vacíos", async () => {
    await generate("module", "app");

    const module = await readFile(join(dir, "src", "app.module.ts"), "utf8");
    expect(module).toContain('import { NgModule } from "ngjs-core";');
    expect(module).toContain("declarations: []");
  });

  it("genera una class plana, sin decorador", async () => {
    await generate("class", "user-model");

    const cls = await readFile(join(dir, "src", "user-model.ts"), "utf8");
    expect(cls).toBe("export class UserModel {}\n");
  });

  it("genera una interface plana", async () => {
    await generate("interface", "user");

    const iface = await readFile(join(dir, "src", "user.ts"), "utf8");
    expect(iface).toBe("export interface User {}\n");
  });

  it("genera un enum plano", async () => {
    await generate("enum", "role");

    const en = await readFile(join(dir, "src", "role.ts"), "utf8");
    expect(en).toBe("export enum Role {}\n");
  });

  it("genera un guard funcional (CanActivateFn) desde ngjs-core/router", async () => {
    await generate("guard", "auth");

    const guard = await readFile(join(dir, "src", "auth.guard.ts"), "utf8");
    expect(guard).toContain('import type { ActivatedRouteSnapshot, CanActivateFn } from "ngjs-core/router";');
    expect(guard).toContain("export const authGuard: CanActivateFn =");
  });

  it("genera un resolver funcional (ResolveFn) desde ngjs-core/router", async () => {
    await generate("resolver", "user");

    const resolver = await readFile(join(dir, "src", "user.resolver.ts"), "utf8");
    expect(resolver).toContain('import type { ActivatedRouteSnapshot, ResolveFn } from "ngjs-core/router";');
    expect(resolver).toContain("export const userResolver: ResolveFn<unknown> =");
  });

  it("genera un interceptor como clase (implements HttpInterceptor) desde la raíz ngjs-core", async () => {
    await generate("interceptor", "auth");

    const interceptor = await readFile(join(dir, "src", "auth.interceptor.ts"), "utf8");
    expect(interceptor).toContain('import type { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from "ngjs-core";');
    expect(interceptor).toContain("export class AuthInterceptor implements HttpInterceptor {");
  });

  it("acepta el alias del schematic (c/d/p/s/m)", async () => {
    await generate("c", "card", { skipImport: true });
    await expect(readFile(join(dir, "src", "card.component.ts"), "utf8")).resolves.toContain("@Component");
  });

  it("soporta subcarpetas (feature/card)", async () => {
    await generate("component", "feature/card", { skipImport: true });
    await expect(readFile(join(dir, "src", "feature", "card.component.ts"), "utf8")).resolves.toContain("@Component");
  });

  it("schematic desconocido tira error claro", async () => {
    await expect(generate("nope", "card")).rejects.toThrow(/Schematic desconocido/);
  });

  describe("auto-registro en @NgModule", () => {
    const appModule = () => readFile(join(dir, "src", "app.module.ts"), "utf8");

    beforeEach(async () => {
      await generate("module", "app");
    });

    it("agrega component/directive/pipe a declarations del módulo más cercano, con su import", async () => {
      await generate("component", "feature/card");
      await generate("directive", "highlight");
      await generate("pipe", "upper");

      const module = await appModule();
      expect(module).toContain('import { CardComponent } from "./feature/card.component";');
      expect(module).toContain('import { HighlightDirective } from "./highlight.directive";');
      expect(module).toContain('import { UpperPipe } from "./upper.pipe";');
      expect(module).toContain("declarations: [CardComponent, HighlightDirective, UpperPipe]");
    });

    it("prefiere el módulo de la subcarpeta antes que el de más arriba", async () => {
      await generate("module", "feature/feature");
      await generate("component", "feature/card");

      await expect(readFile(join(dir, "src", "feature", "feature.module.ts"), "utf8")).resolves.toContain(
        "declarations: [CardComponent]",
      );
      await expect(appModule()).resolves.not.toContain("CardComponent");
    });

    it("un módulo nuevo no se importa en otro salvo con --module", async () => {
      await generate("module", "feature/feature");
      await expect(appModule()).resolves.not.toContain("FeatureModule");

      await generate("module", "shared/shared", { module: "app" });
      const module = await appModule();
      expect(module).toContain('import { SharedModule } from "./shared/shared.module";');
      expect(module).toContain("imports: [SharedModule]");
    });

    it("--module registra en el módulo pedido en vez del más cercano", async () => {
      await generate("module", "feature/feature");
      await generate("component", "feature/card", { module: "app" });

      await expect(appModule()).resolves.toContain("declarations: [CardComponent]");
    });

    it("--skip-import no toca ningún módulo", async () => {
      await generate("component", "card", { skipImport: true });
      await expect(appModule()).resolves.toContain("declarations: []");
    });

    it("services y demás no se registran en el módulo", async () => {
      await generate("service", "user");
      await expect(appModule()).resolves.not.toContain("UserService");
    });

    it("respeta coma final en arrays multilínea y agrega la propiedad si falta", async () => {
      await writeFile(
        join(dir, "src", "app.module.ts"),
        `import { NgModule } from "ngjs-core";
import { OtherComponent } from "./other.component";

@NgModule({
  declarations: [
    OtherComponent,
  ],
})
export class AppModule {}
`,
        "utf8",
      );
      await generate("component", "card");
      await generate("module", "shared", { module: "app" });

      const module = await appModule();
      expect(module).toContain("declarations: [\n    OtherComponent, CardComponent,\n  ]");
      expect(module).toContain("@NgModule({\n  imports: [SharedModule],\n  declarations:");
    });

    it("sin ningún módulo en el camino falla antes de escribir nada", async () => {
      await rm(join(dir, "src", "app.module.ts"));

      await expect(generate("component", "card")).rejects.toThrow(/No se encontró ningún módulo/);
      await expect(readFile(join(dir, "src", "card.component.ts"), "utf8")).rejects.toThrow();
    });

    it("más de un módulo en la misma carpeta es ambiguo", async () => {
      await generate("module", "other");
      await expect(generate("component", "card")).rejects.toThrow(/más de un módulo/);
    });

    it("ignora los -routing.module.ts", async () => {
      await writeFile(join(dir, "src", "app-routing.module.ts"), "export class AppRoutingModule {}\n", "utf8");
      await generate("component", "card");

      await expect(appModule()).resolves.toContain("declarations: [CardComponent]");
    });
  });
});

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GenerateCommand } from "@/commands/generate-command.ts";
import { GenerateConfig } from "@/config/generate-config.ts";
import { ModuleTemplate } from "@/schematics/module-template.ts";

async function generate(schematic: string, name: string): Promise<void> {
  const config = await GenerateConfig.create({ schematic, name });
  await GenerateCommand.from(config).run();
}

describe("GenerateCommand — registro en el módulo más cercano", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "ngjs-generate-test-"));
    process.chdir(dir);
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "ngjs.json"),
      JSON.stringify({ version: "1", root: ".", projectType: "application", sourceRoot: "src", architect: { build: { options: {} } } }),
      "utf8",
    );
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it("el primer módulo del proyecto se genera sin error aunque no haya padre donde registrarlo", async () => {
    await generate("module", "app");

    expect(await readFile(join(dir, "src", "app.module.ts"), "utf8")).toBe(ModuleTemplate.from("app").toString());
  });

  it("registra un componente en el módulo del mismo directorio (import sin .ts + .component encadenado)", async () => {
    await generate("module", "app");
    await generate("component", "card");

    const module = await readFile(join(dir, "src", "app.module.ts"), "utf8");
    expect(module).toContain(`import { CardComponent } from "./card.component";`);
    expect(module).toContain(`angular.module(AppModule.$name, [])\n    .component(CardComponent.$name, CardComponent.ɵcmp);`);
  });

  it("sube por el árbol hasta el primer módulo y arma el import relativo", async () => {
    await generate("module", "app");
    await generate("component", "feature/card");

    const module = await readFile(join(dir, "src", "app.module.ts"), "utf8");
    expect(module).toContain(`import { CardComponent } from "./feature/card.component";`);
  });

  it("encadena varias llamadas y cada tipo usa la suya", async () => {
    await generate("module", "app");
    await generate("directive", "highlight");
    await generate("pipe", "upper");
    await generate("service", "user");

    const module = await readFile(join(dir, "src", "app.module.ts"), "utf8");
    expect(module).toContain(".directive(HighlightDirective.$name, () => HighlightDirective.ɵdir)");
    expect(module).toContain(".filter(UpperPipe.$name, UpperPipe.transform)");
    expect(module).toContain(".service(UserService.$name, UserService)");
    expect(module.indexOf(".directive(")).toBeLessThan(module.indexOf(".filter("));
  });

  it("un módulo generado dentro de otro se agrega a `requires` del más cercano", async () => {
    await generate("module", "app");
    await generate("module", "feature/shop");
    await generate("module", "feature/admin");

    const app = await readFile(join(dir, "src", "app.module.ts"), "utf8");
    // shop se registró en app; admin encuentra a shop (el más cercano subiendo desde feature/), no a app.
    expect(app).toContain("angular.module(AppModule.$name, [ShopModule.$name])");
    const shop = await readFile(join(dir, "src", "feature", "shop.module.ts"), "utf8");
    expect(shop).toContain("angular.module(ShopModule.$name, [AdminModule.$name])");
  });

  it("sin módulo en todo el camino hasta sourceRoot: error, y no escribe nada", async () => {
    await expect(generate("component", "feature/card")).rejects.toThrow(/No se encontró ningún módulo/);

    await expect(readFile(join(dir, "src", "feature", "card.component.ts"), "utf8")).rejects.toThrow();
  });

  it("no sale de sourceRoot: un módulo fuera de `src` no cuenta", async () => {
    await writeFile(join(dir, "outside.module.ts"), ModuleTemplate.from("outside").toString(), "utf8");

    await expect(generate("component", "card")).rejects.toThrow(/No se encontró ningún módulo/);
  });
});

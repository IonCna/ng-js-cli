import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GenerateCommand } from "@/commands/generate-command.ts";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { GenerateConfig } from "@/config/generate-config.ts";

async function generate(schematic: string, name: string): Promise<void> {
  const config = await GenerateConfig.create({ schematic, name });
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

  it("genera un componente con decorador real, sin exigir un módulo donde registrarlo", async () => {
    await generate("component", "card");

    const component = await readFile(join(dir, "src", "card.component.ts"), "utf8");
    expect(component).toContain('import { Component } from "ngjs-core";');
    expect(component).toContain('selector: "app-card"');
  });

  it("genera una directiva con selector de atributo", async () => {
    await generate("directive", "highlight");

    const directive = await readFile(join(dir, "src", "highlight.directive.ts"), "utf8");
    expect(directive).toContain('import { Directive } from "ngjs-core";');
    expect(directive).toContain('selector: "[appHighlight]"');
  });

  it("genera un pipe implementando PipeTransform", async () => {
    await generate("pipe", "upper");

    const pipe = await readFile(join(dir, "src", "upper.pipe.ts"), "utf8");
    expect(pipe).toContain('import { Pipe, type PipeTransform } from "ngjs-core";');
    expect(pipe).toContain("implements PipeTransform");
  });

  it("genera un servicio @Injectable", async () => {
    await generate("service", "user");

    const service = await readFile(join(dir, "src", "user.service.ts"), "utf8");
    expect(service).toContain('import { Injectable } from "ngjs-core";');
    expect(service).toContain("@Injectable()");
  });

  it("genera un módulo con declarations/imports vacíos", async () => {
    await generate("module", "app");

    const module = await readFile(join(dir, "src", "app.module.ts"), "utf8");
    expect(module).toContain('import { NgModule } from "ngjs-core";');
    expect(module).toContain("declarations: []");
  });

  it("acepta el alias del schematic (c/d/p/s/m)", async () => {
    await generate("c", "card");
    await expect(readFile(join(dir, "src", "card.component.ts"), "utf8")).resolves.toContain("@Component");
  });

  it("soporta subcarpetas (feature/card)", async () => {
    await generate("component", "feature/card");
    await expect(readFile(join(dir, "src", "feature", "card.component.ts"), "utf8")).resolves.toContain("@Component");
  });

  it("schematic desconocido tira error claro", async () => {
    await expect(generate("nope", "card")).rejects.toThrow(/Schematic desconocido/);
  });
});

import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigCommand } from "@/commands/config-command.ts";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { ConfigConfig } from "@/config/config-command-config.ts";

const baseConfig: NgjsConfig = {
  version: "1",
  root: ".",
  projectType: "library",
  sourceRoot: "src",
  architect: {
    build: { options: { entryPoints: { index: "src/index.ts" }, outputPath: "dist", sourceMap: false } },
  },
};

describe("ConfigCommand", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "ngjs-config-test-"));
    process.chdir(dir);
    await writeFile(join(dir, "ngjs.json"), JSON.stringify(baseConfig));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it("get: imprime un valor string plano", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await ConfigCommand.from(await ConfigConfig.create({ path: "architect.build.options.outputPath" })).run();
    expect(log).toHaveBeenCalledWith("dist");
    log.mockRestore();
  });

  it("get: imprime un objeto como JSON", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await ConfigCommand.from(await ConfigConfig.create({ path: "architect.build.options.entryPoints" })).run();
    expect(log).toHaveBeenCalledWith(JSON.stringify({ index: "src/index.ts" }, null, 2));
    log.mockRestore();
  });

  it("get: tira error si el path no existe", async () => {
    await expect(ConfigCommand.from(await ConfigConfig.create({ path: "architect.build.options.nope" })).run()).rejects.toThrow(
      /No existe "architect.build.options.nope"/,
    );
  });

  it("set: escribe un string cuando el valor no parsea como JSON", async () => {
    await ConfigCommand.from(await ConfigConfig.create({ path: "architect.build.options.outputPath", value: "dist2" })).run();

    const written = JSON.parse(await readFile(join(dir, "ngjs.json"), "utf8")) as NgjsConfig;
    expect(written.architect.build.options.outputPath).toBe("dist2");
  });

  it("set: parsea booleans/numbers/objetos vía JSON.parse", async () => {
    await ConfigCommand.from(await ConfigConfig.create({ path: "architect.build.options.sourceMap", value: "true" })).run();

    const written = JSON.parse(await readFile(join(dir, "ngjs.json"), "utf8")) as NgjsConfig;
    expect(written.architect.build.options.sourceMap).toBe(true);
  });

  it("set: crea objetos intermedios que no existen todavía", async () => {
    await ConfigCommand.from(await ConfigConfig.create({ path: "architect.serve.options.port", value: "4200" })).run();

    const written = JSON.parse(await readFile(join(dir, "ngjs.json"), "utf8")) as NgjsConfig;
    expect(written.architect.serve?.options?.port).toBe(4200);
  });

  it("set: rechaza un valor que rompe el schema, sin tocar el archivo", async () => {
    const before = await readFile(join(dir, "ngjs.json"), "utf8");

    await expect(
      ConfigCommand.from(await ConfigConfig.create({ path: "architect.build.options.outputPath", value: "123" })).run(),
    ).rejects.toThrow(/deja "ngjs.json" inválido/);

    await expect(readFile(join(dir, "ngjs.json"), "utf8")).resolves.toBe(before);
  });

  it("set: rechaza un projectType fuera de 'application' | 'library'", async () => {
    await expect(
      ConfigCommand.from(await ConfigConfig.create({ path: "projectType", value: '"nope"' })).run(),
    ).rejects.toThrow(/deja "ngjs.json" inválido/);
  });
});

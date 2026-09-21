import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { ConfigReader } from "@/config/config-reader.ts";

describe("ConfigReader.read()", () => {
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    projectDir = await mkdtemp(join(tmpdir(), "ngjs-cli-test-"));
    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(projectDir, { recursive: true, force: true });
  });

  it("tira un error claro si no hay ngjs.json en el cwd", async () => {
    await expect(ConfigReader.read()).rejects.toThrow(/No se encontró "ngjs.json"/);
  });

  it("devuelve la config parseada si ngjs.json existe en el cwd", async () => {
    const config: NgjsConfig = {
      version: "1",
      root: ".",
      projectType: "library",
      sourceRoot: "src",
      architect: { build: { options: { entryPoints: { index: "src/index.ts" }, outputPath: "dist" } } },
    };
    await writeFile(join(projectDir, "ngjs.json"), JSON.stringify(config));

    await expect(ConfigReader.read()).resolves.toEqual(config);
  });
});

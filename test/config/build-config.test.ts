import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BuildConfig } from "@/config/build-config.ts";
import type { NgjsConfig } from "@/config/cli-config.ts";

describe("BuildConfig.create()", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "build-config-test-"));
    process.chdir(dir);

    const config: NgjsConfig = {
      version: "1",
      root: ".",
      projectType: "library",
      sourceRoot: "src",
      architect: {
        build: {
          options: { entryPoints: { index: "src/index.ts" }, outputPath: "dist", sourceMap: true },
          configurations: {
            production: { outputPath: "dist-prod", sourceMap: false, optimization: true },
            "es-MX": { outputPath: "dist-es-mx", fileReplacements: [{ replace: "src/locale.ts", with: "src/locale.es-MX.ts" }] },
          },
        },
      },
    };
    await writeFile(join(dir, "ngjs.json"), JSON.stringify(config));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it("lleva el projectType de ngjs.json (el compilador solo inyecta la plataforma en una aplicación)", async () => {
    const config = await BuildConfig.create({});
    expect(config.projectType).toBe("library");
    expect(config.dualFormat).toBe(true);
  });

  it("sin --configuration usa options tal cual", async () => {
    const config = await BuildConfig.create({});
    expect(config.outputPath).toBe("dist");
    expect(config.sourceMap).toBe(true);
    expect(config.minify).toBe(false);
  });

  it("con --configuration mergea solo lo que esa configuration pisa, el resto queda de options", async () => {
    const config = await BuildConfig.create({ configuration: "production" });
    expect(config.outputPath).toBe("dist-prod");
    expect(config.sourceMap).toBe(false);
    expect(config.minify).toBe(true);
    // no pisado por la configuration — sigue viniendo de options
    expect(config.entryPoints).toEqual({ index: "src/index.ts" });
  });

  it("--configuration con nombre inexistente tira error, como Angular real", async () => {
    await expect(BuildConfig.create({ configuration: "no-existe" })).rejects.toThrow(/"no-existe" no está definida/);
    await expect(BuildConfig.create({ configuration: "production,no-existe" })).rejects.toThrow(/"no-existe"/);
  });

  it("--configuration a,b compone: aplica en orden y la última pisa", async () => {
    const config = await BuildConfig.create({ configuration: "production,es-MX" });
    expect(config.outputPath).toBe("dist-es-mx");
    expect(config.minify).toBe(true);
    expect(config.sourceMap).toBe(false);
    expect(config.fileReplacements).toEqual([{ replace: "src/locale.ts", with: "src/locale.es-MX.ts" }]);
  });

  it("el orden importa y tolera espacios", async () => {
    const config = await BuildConfig.create({ configuration: "es-MX , production" });
    expect(config.outputPath).toBe("dist-prod");
  });
});

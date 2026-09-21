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

  it("--configuration con nombre inexistente cae a options sin tirar", async () => {
    const config = await BuildConfig.create({ configuration: "no-existe" });
    expect(config.outputPath).toBe("dist");
  });
});

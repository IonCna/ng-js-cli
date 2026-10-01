import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BuildCommand } from "@/commands/build-command.ts";
import { BuildConfig } from "@/config/build-config.ts";
import type { NgjsConfig } from "@/config/cli-config.ts";

describe("BuildCommand.clean() (como deleteOutputDir de Angular)", () => {
  let dir: string;
  let originalCwd: string;

  const writeConfig = async (outputPath: string, deleteOutputPath?: boolean) => {
    const config: NgjsConfig = {
      version: "1",
      root: ".",
      projectType: "application",
      sourceRoot: "src",
      architect: { build: { options: { entryPoints: { main: "src/main.ts" }, outputPath, deleteOutputPath } } },
    };
    await writeFile(join(dir, "ngjs.json"), JSON.stringify(config));
  };

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "ngjs-clean-"));
    process.chdir(dir);
    await mkdir(join(dir, "dist", "templates"), { recursive: true });
    await writeFile(join(dir, "dist", "main-OLD.js"), "");
    await writeFile(join(dir, "dist", "templates", "a.html"), "");
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it("vacía outputPath pero deja la carpeta", async () => {
    await writeConfig("dist");
    await BuildCommand.from(await BuildConfig.create({})).clean();

    expect(await readdir(join(dir, "dist"))).toEqual([]);
  });

  it("deleteOutputPath: false no borra nada; un outputPath que no existe no es error", async () => {
    await writeConfig("dist", false);
    await BuildCommand.from(await BuildConfig.create({})).clean();
    expect(await readdir(join(dir, "dist"))).toHaveLength(2);

    await writeConfig("missing");
    await expect(BuildCommand.from(await BuildConfig.create({})).clean()).resolves.toBeUndefined();
  });

  it("la raíz del proyecto es error (mismo texto que Angular)", async () => {
    await writeConfig(".");
    await expect(BuildCommand.from(await BuildConfig.create({})).clean()).rejects.toThrow("Output path MUST not be project root directory!");
  });
});

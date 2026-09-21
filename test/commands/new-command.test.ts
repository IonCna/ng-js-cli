import { readFile } from "node:fs/promises";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NewCommand } from "@/commands/new-command.ts";
import type { NgjsConfig } from "@/config/cli-config.ts";
import { NewConfig } from "@/config/new-config.ts";

describe("NewCommand", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "ngjs-new-test-"));
    process.chdir(dir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  });

  it("escribe un ngjs.json inicial con projectType 'library' por default", async () => {
    await NewCommand.from(NewConfig.create({})).run();

    const written = JSON.parse(await readFile(join(dir, "ngjs.json"), "utf8")) as NgjsConfig;
    expect(written.projectType).toBe("library");
    expect(written.architect.build.options.entryPoints).toEqual({ index: "src/index.ts" });
  });

  it("respeta --project-type application", async () => {
    await NewCommand.from(NewConfig.create({ projectType: "application" })).run();

    const written = JSON.parse(await readFile(join(dir, "ngjs.json"), "utf8")) as NgjsConfig;
    expect(written.projectType).toBe("application");
  });

  it("no sobreescribe un ngjs.json existente", async () => {
    await writeFile(join(dir, "ngjs.json"), "{}");

    await expect(NewCommand.from(NewConfig.create({})).run()).rejects.toThrow(/Ya existe "ngjs.json"/);
  });
});

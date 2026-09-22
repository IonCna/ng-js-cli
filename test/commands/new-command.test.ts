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

  it("setea prefix por default", async () => {
    await NewCommand.from(NewConfig.create({})).run();

    const written = JSON.parse(await readFile(join(dir, "ngjs.json"), "utf8")) as NgjsConfig;
    expect(written.prefix).toBe("app");
  });

  it("arma configurations.production con el fileReplacements de environments", async () => {
    await NewCommand.from(NewConfig.create({})).run();

    const written = JSON.parse(await readFile(join(dir, "ngjs.json"), "utf8")) as NgjsConfig;
    expect(written.architect.build.configurations?.production?.fileReplacements).toEqual([
      { replace: "src/environments/environment.ts", with: "src/environments/environment.prod.ts" },
    ]);
  });

  it("escribe src/environments/environment.ts y environment.prod.ts", async () => {
    await NewCommand.from(NewConfig.create({})).run();

    const dev = await readFile(join(dir, "src", "environments", "environment.ts"), "utf8");
    const prod = await readFile(join(dir, "src", "environments", "environment.prod.ts"), "utf8");
    expect(dev).toContain("production: false");
    expect(prod).toContain("production: true");
  });

  it("agrega architect.serve solo para projectType 'application'", async () => {
    await NewCommand.from(NewConfig.create({ projectType: "application" })).run();
    const application = JSON.parse(await readFile(join(dir, "ngjs.json"), "utf8")) as NgjsConfig;
    expect(application.architect.serve?.options?.port).toBe(4200);
  });

  it("no agrega architect.serve para projectType 'library'", async () => {
    await NewCommand.from(NewConfig.create({ projectType: "library" })).run();
    const library = JSON.parse(await readFile(join(dir, "ngjs.json"), "utf8")) as NgjsConfig;
    expect(library.architect.serve).toBeUndefined();
  });
});

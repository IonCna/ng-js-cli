import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SingletonPackages } from "@/commands/build-command.ts";

describe("SingletonPackages (una sola copia de angular y de los peers de las dependencias)", () => {
  let dir: string;

  const writePackage = async (path: string, manifest: Record<string, unknown>, files: Record<string, string> = {}) => {
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "package.json"), JSON.stringify(manifest));
    for (const [name, contents] of Object.entries(files)) {
      await mkdir(join(path, name, ".."), { recursive: true });
      await writeFile(join(path, name), contents);
    }
  };

  // Como una librería enlazada: `lib` trae su propia copia de su peer `shared` (la que usa para compilarse).
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ngjs-singleton-"));
    await writePackage(dir, { name: "app", dependencies: { lib: "1.0.0", shared: "1.0.0" } }, { "main.js": 'import "lib";' });
    await writePackage(
      join(dir, "node_modules", "lib"),
      { name: "lib", main: "index.js", peerDependencies: { shared: "*", missing: "*" } },
      { "index.js": 'import { copy } from "shared";\nimport { sub } from "shared/sub";\nconsole.log(copy, sub);' },
    );
    await writePackage(
      join(dir, "node_modules", "shared"),
      { name: "shared", main: "index.cjs", exports: { ".": { import: "./index.mjs", require: "./index.cjs" }, "./sub": "./sub.mjs" } },
      {
        "index.mjs": 'export const copy = "project-esm";',
        "index.cjs": 'exports.copy = "project-cjs";',
        "sub.mjs": 'export const sub = "project-sub";',
      },
    );
    await writePackage(
      join(dir, "node_modules", "lib", "node_modules", "shared"),
      { name: "shared", exports: { ".": "./index.mjs", "./sub": "./sub.mjs" } },
      { "index.mjs": 'export const copy = "nested";', "sub.mjs": 'export const sub = "nested-sub";' },
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("names(): angular + los peers instalados de las dependencias directas", () => {
    expect(SingletonPackages.names(dir)).toEqual(["angular", "shared"]);
  });

  it("resuelve el peer (y sus subpaths) desde el proyecto, por su entrada ESM", async () => {
    const result = await esbuild.build({
      entryPoints: [join(dir, "main.js")],
      bundle: true,
      format: "esm",
      write: false,
      plugins: [SingletonPackages.plugin(SingletonPackages.names(dir), [], dir)],
    });
    const output = result.outputFiles[0]!.text;

    expect(output).toContain("project-esm");
    expect(output).toContain("project-sub");
    expect(output).not.toContain("nested");
    expect(output).not.toContain("project-cjs");
  });

  it("un paquete en external no se toca", async () => {
    const result = await esbuild.build({
      entryPoints: [join(dir, "main.js")],
      bundle: true,
      format: "esm",
      write: false,
      external: ["shared", "shared/*"],
      plugins: [SingletonPackages.plugin(SingletonPackages.names(dir), ["shared"], dir)],
    });

    expect(result.outputFiles[0]!.text).toContain('from "shared"');
  });
});

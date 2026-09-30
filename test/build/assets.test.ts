import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Assets } from "@/build/assets.ts";

describe("Assets (architect.build.options.assets, como Angular 16)", () => {
  let root: string;

  const file = async (path: string, content = path) => {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  const read = (path: string) => readFile(join(root, path), "utf8");
  const exists = (path: string) => readFile(join(root, path)).then(() => true, () => false);

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ngjs-assets-"));
    await file("src/favicon.ico");
    await file("src/assets/brand/logo.png");
    await file("src/assets/.gitkeep");
    await file("node_modules/pkg/img/icon.svg");
    await file("node_modules/pkg/img/skip.map");
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it("un string es un directorio o un archivo dentro de sourceRoot, publicado con su ruta desde ahí", async () => {
    const assets = Assets.from(["src/favicon.ico", "src/assets"], "src", root);
    expect(assets.patterns).toEqual([
      { glob: "favicon.ico", input: join(root, "src"), output: "", ignore: [] },
      { glob: "**/*", input: join(root, "src", "assets"), output: "assets", ignore: [] },
    ]);

    await assets.copyTo("dist", root);
    expect(await read("dist/favicon.ico")).toBe("src/favicon.ico");
    expect(await read("dist/assets/brand/logo.png")).toBe("src/assets/brand/logo.png");
    expect(await exists("dist/assets/.gitkeep")).toBe(false);
  });

  it("{ glob, input, output, ignore } copia lo que matchea a output (relativo a outputPath)", async () => {
    const assets = Assets.from([{ glob: "**/*", input: "node_modules/pkg/img", output: "/vendor/", ignore: ["**/*.map"] }], "src", root);

    await assets.copyTo("dist", root);
    expect(await read("dist/vendor/icon.svg")).toBe("node_modules/pkg/img/icon.svg");
    expect(await exists("dist/vendor/skip.map")).toBe(false);
  });

  it("un string fuera de sourceRoot, un glob absoluto o un output fuera de outputPath son errores (como Angular)", () => {
    expect(() => Assets.from(["node_modules/pkg/img"], "src", root)).toThrow(/sourceRoot/);
    expect(() => Assets.from([{ glob: "/x", input: "src", output: "" }], "src", root)).toThrow(/absoluto/);
    expect(() => Assets.from([{ glob: "**/*", input: "src", output: "../fuera" }], "src", root)).toThrow(/fuera de outputPath/);
  });

  it("resolve(): la URL publicada (sin base) → el archivo fuente, respetando glob e ignore; `..` no sale del input", async () => {
    const assets = Assets.from(
      ["src/favicon.ico", "src/assets", { glob: "*.svg", input: "node_modules/pkg/img", output: "vendor" }],
      "src",
      root,
    );

    expect(await assets.resolve("favicon.ico")).toBe(join(root, "src", "favicon.ico"));
    expect(await assets.resolve("assets/brand/logo.png")).toBe(join(root, "src", "assets", "brand", "logo.png"));
    expect(await assets.resolve("vendor/icon.svg")).toBe(join(root, "node_modules", "pkg", "img", "icon.svg"));
    expect(await assets.resolve("vendor/skip.map")).toBeUndefined();
    expect(await assets.resolve("assets/.gitkeep")).toBeUndefined();
    expect(await assets.resolve("assets/../favicon.ico")).toBeUndefined();
    expect(await assets.resolve("assets/nada.png")).toBeUndefined();
  });
});

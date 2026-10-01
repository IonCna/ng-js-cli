import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GlobalStyles } from "@/build/global-styles.ts";
import { PostcssConfiguration } from "@/build/postcss-configuration.ts";

describe("PostcssConfiguration", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ngjs-postcss-"));
    // Un plugin instalado en el proyecto: reemplaza `@tw;` por la clase que recibe en las opciones.
    const plugin = join(dir, "node_modules", "fake-tw");
    await mkdir(plugin, { recursive: true });
    await writeFile(join(plugin, "package.json"), JSON.stringify({ name: "fake-tw", main: "index.cjs" }));
    await writeFile(
      join(plugin, "index.cjs"),
      `module.exports = (opts = {}) => ({ postcssPlugin: "fake-tw", AtRule: { tw: (rule) => rule.replaceWith(\`.\${opts.name ?? "tw"} { color: red; }\`) } });
module.exports.postcss = true;`,
    );
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "styles.css"), `@tw;\nbody { margin: 0; }\n`);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("sin postcss.config.json ni .postcssrc.json no hay configuración", async () => {
    expect(await PostcssConfiguration.load(dir)).toBeUndefined();
  });

  it("postcss.config.json (plugins como objeto): el build de los estilos globales pasa por sus plugins", async () => {
    await writeFile(join(dir, "postcss.config.json"), JSON.stringify({ plugins: { "fake-tw": { name: "utility" } } }));
    const postcss = await PostcssConfiguration.load(dir);
    await GlobalStyles.from(["src/styles.css"], dir).build("dist", { minify: false, sourceMap: false, postcss });
    const css = await readFile(join(dir, "dist", "styles.css"), "utf8");
    expect(css).toContain(".utility {");
    expect(css).not.toContain("@tw");
  });

  it(".postcssrc.json con plugins como array; `false` en el objeto lo desactiva", async () => {
    await writeFile(join(dir, ".postcssrc.json"), JSON.stringify({ plugins: [["fake-tw", { name: "arr" }]] }));
    expect((await PostcssConfiguration.load(dir))?.plugins).toHaveLength(1);
    await writeFile(join(dir, "postcss.config.json"), JSON.stringify({ plugins: { "fake-tw": false } }));
    expect((await PostcssConfiguration.load(dir))?.plugins).toHaveLength(0);
  });

  it("un plugin que no está instalado es error claro", async () => {
    await writeFile(join(dir, "postcss.config.json"), JSON.stringify({ plugins: { "@tailwindcss/postcss": {} } }));
    await expect(PostcssConfiguration.load(dir)).rejects.toThrow(/"@tailwindcss\/postcss".*instalado/);
  });
});

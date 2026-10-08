import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GlobalStyles } from "@/build/global-styles.ts";

describe("GlobalStyles", () => {
  const root = "/project";

  it("un path suelto va al bundle `styles`, inyectado — como Angular", () => {
    const styles = GlobalStyles.from(["src/style.css"], root);
    expect(styles.injected).toEqual(["styles.css"]);
    expect(styles.injectedSourceUrls).toEqual(["/src/style.css"]);
    expect(styles.bundleSource("/styles.css")).toBe(`@import url("/src/style.css");`);
  });

  it("agrupa por bundleName en orden; inject: false se emite pero no se enlaza", () => {
    const styles = GlobalStyles.from(
      ["src/a.css", { input: "src/print.css", bundleName: "print", inject: false }, { input: "src/b.css" }],
      root,
    );
    expect(styles.injected).toEqual(["styles.css"]);
    expect(styles.injectedSourceUrls).toEqual(["/src/a.css", "/src/b.css"]);
    expect(styles.bundleSource("/print.css")).toBe(`@import url("/src/print.css");`);
    expect(styles.bundleSource("/otro.css")).toBeUndefined();
  });

  it("sin styles no hay nada que emitir ni enlazar", () => {
    const styles = GlobalStyles.from(undefined, root);
    expect(styles.injected).toEqual([]);
    expect(styles.injectedSourceUrls).toEqual([]);
  });

  describe("build()", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "ngjs-styles-"));
      await mkdir(join(dir, "src", "img"), { recursive: true });
      await writeFile(join(dir, "src", "img", "bg.svg"), `<svg xmlns="http://www.w3.org/2000/svg"/>`);
      await writeFile(join(dir, "src", "theme.css"), ".title { color: red; }\n");
      await writeFile(
        join(dir, "src", "style.css"),
        `@import "./theme.css";\nbody { background: url(./img/bg.svg); }\n.logo { background: url(/logo.png); }\n`,
      );
    });

    afterEach(() => rm(dir, { recursive: true, force: true }));

    it("bundlea @import, copia los url() relativos a media/ y deja los absolutos al sitio", async () => {
      await GlobalStyles.from(["src/style.css"], dir).build("dist", { minify: false, sourceMap: false });
      const css = await readFile(join(dir, "dist", "styles.css"), "utf8");
      expect(css).toContain(".title {");
      expect(css.indexOf(".title")).toBeLessThan(css.indexOf("body {"));
      // Sin `outputHashing` (default `none`, como Angular): nombres fijos.
      expect(css).toContain('url("./media/bg.svg")');
      expect(css).toContain("url(/logo.png)");
    });

    it("una entrada .scss se compila con Sass: variables, parciales y paquetes de node_modules", async () => {
      await mkdir(join(dir, "node_modules", "kit", "scss"), { recursive: true });
      await writeFile(join(dir, "node_modules", "kit", "scss", "_buttons.scss"), ".btn { color: $accent; }");
      await writeFile(join(dir, "src", "_tokens.scss"), "$accent: #123456;");
      await writeFile(
        join(dir, "src", "theme.scss"),
        `@import "tokens"; @import "kit/scss/buttons"; .card { .heading { color: $accent; } background: url(./img/bg.svg); }`,
      );

      await GlobalStyles.from(["src/style.css", "src/theme.scss"], dir).build("dist", { minify: false, sourceMap: false });
      const css = await readFile(join(dir, "dist", "styles.css"), "utf8");

      expect(css).toContain(".btn {");
      expect(css).toContain(".card .heading {");
      expect(css).toContain("#123456");
      expect(css).not.toContain("$accent");
      // Mismo bundle y en orden: primero el .css, después el .scss; sus url() también van a media/.
      expect(css.indexOf("body {")).toBeLessThan(css.indexOf(".btn {"));
      expect(css.split('url("./media/bg.svg")')).toHaveLength(3);
    });

    it("outputHashing: 'all' → styles-<hash>.css y media con hash; build() devuelve el nombre a enlazar", async () => {
      const injected = await GlobalStyles.from(["src/style.css"], dir).build("dist", {
        minify: false,
        sourceMap: true,
        outputHashing: "all",
      });
      expect(injected).toHaveLength(1);
      expect(injected[0]).toMatch(/^styles-[A-F0-9]{8}\.css$/);
      const css = await readFile(join(dir, "dist", injected[0]!), "utf8");
      expect(css).toMatch(/url\("\.\/media\/bg-[A-Z0-9]+\.svg"\)/);
      // El mapa sigue al renombre.
      expect(css).toContain(`sourceMappingURL=${injected[0]}.map`);
      await expect(readFile(join(dir, "dist", `${injected[0]}.map`), "utf8")).resolves.toContain('"version"');
    });

    it("outputHashing: 'bundles' → solo el .css lleva hash, la media no", async () => {
      const [file] = await GlobalStyles.from(["src/style.css"], dir).build("dist", { minify: false, sourceMap: false, outputHashing: "bundles" });
      expect(file).toMatch(/^styles-[A-F0-9]{8}\.css$/);
      expect(await readFile(join(dir, "dist", file!), "utf8")).toContain('url("./media/bg.svg")');
    });
  });
});

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
      expect(css).toMatch(/url\("\.\/media\/bg-[A-Z0-9]+\.svg"\)/);
      expect(css).toContain("url(/logo.png)");
    });
  });
});

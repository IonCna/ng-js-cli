import { describe, expect, it } from "vitest";
import { IndexHtmlWriter } from "@/build/index-html-writer.ts";

describe("IndexHtmlWriter.transform()", () => {
  const writer = (output = "index.html") =>
    IndexHtmlWriter.from({ index: "src/index.ts" }, "dist", { input: "index.html", output });

  it("con outputHashing usa el .js que emitió esbuild (con hash)", () => {
    const hashed = IndexHtmlWriter.from({ index: "src/index.ts" }, "dist", { input: "index.html", output: "index.html" }, [], {
      index: "index-ABCD1234.js",
    });
    const html = `<body>\n<script type="module" src="/src/index.ts"></script>\n</body>`;
    expect(hashed.transform(html)).toBe(`<body>\n<script type="module" src="index-ABCD1234.js"></script>\n</body>`);
  });

  it("reescribe el script del entry fuente (el de Vite) al bundle, conservando sus atributos", () => {
    const html = `<body>\n<script type="module" src="/src/index.ts"></script>\n</body>`;
    expect(writer().transform(html)).toBe(`<body>\n<script type="module" src="index.js"></script>\n</body>`);
  });

  it("acepta el src sin barra inicial y con query", () => {
    const html = `<script type="module" src="src/index.ts?v=1"></script>`;
    expect(writer().transform(html)).toBe(`<script type="module" src="index.js"></script>`);
  });

  it("no toca scripts que no son entry points", () => {
    const html = `<script src="https://cdn.example/x.js"></script><script type="module" src="/src/index.ts"></script>`;
    expect(writer().transform(html)).toBe(
      `<script src="https://cdn.example/x.js"></script><script type="module" src="index.js"></script>`,
    );
  });

  it("sin script del entry, agrega el bundle antes de </body>", () => {
    expect(writer().transform("<html><body><app-root></app-root></body></html>")).toBe(
      `<html><body><app-root></app-root><script type="module" src="index.js"></script>\n</body></html>`,
    );
  });

  it("un output en subcarpeta referencia el bundle relativo a ella", () => {
    const html = `<script type="module" src="/src/index.ts"></script>`;
    expect(writer("app/index.html").transform(html)).toBe(`<script type="module" src="../index.js"></script>`);
  });

  it("con deployUrl, scripts y estilos salen con ese prefijo (no relativos al index.html)", () => {
    const html = `<html><head></head><body><script type="module" src="/src/index.ts"></script></body></html>`;
    const deployed = IndexHtmlWriter.from(
      { index: "src/index.ts" },
      "dist",
      { input: "index.html", output: "app/index.html" },
      ["styles-AB12.css"],
      { index: "index-ABCD1234.js" },
      "/Client/dist/",
    );
    expect(deployed.transform(html)).toBe(
      `<html><head><link rel="stylesheet" href="/Client/dist/styles-AB12.css">\n</head><body><script type="module" src="/Client/dist/index-ABCD1234.js"></script></body></html>`,
    );
  });

  it("los estilos inyectados van como <link> antes de </head>, en orden", () => {
    const html = `<html><head><title>x</title></head><body></body></html>`;
    const withStyles = IndexHtmlWriter.from({ index: "src/index.ts" }, "dist", { input: "index.html", output: "app/index.html" }, [
      "styles.css",
      "theme.css",
    ]);
    expect(withStyles.transform(html)).toBe(
      `<html><head><title>x</title><link rel="stylesheet" href="../styles.css">\n<link rel="stylesheet" href="../theme.css">\n</head><body><script type="module" src="../index.js"></script>\n</body></html>`,
    );
  });

  describe("plataforma aparte y modulepreload", () => {
    const withExtras = (entryPoints: Record<string, string> = { main: "src/main.ts" }) =>
      IndexHtmlWriter.from(
        entryPoints,
        "dist",
        { input: "index.html", output: "index.html" },
        [],
        { main: "main-AB12.js", other: "other-CD34.js" },
        "/Client/dist/",
        { platform: "platform-EF56.js", modulePreloads: ["chunk-1.js", "chunk-2.js"] },
      );

    // Los `defer` y los módulos corren en orden de documento: la plataforma corre antes que cualquier módulo.
    it("la plataforma va una sola vez, como <script defer>, justo antes del primer entry", () => {
      const html = `<head><script type="module" src="/src/main.ts"></script><script type="module" src="/src/other.ts"></script></head>`;
      expect(withExtras({ main: "src/main.ts", other: "src/other.ts" }).transform(html)).toBe(
        `<head><script defer src="/Client/dist/platform-EF56.js"></script>\n<script type="module" src="/Client/dist/main-AB12.js"></script><script type="module" src="/Client/dist/other-CD34.js"></script>` +
          `<link rel="modulepreload" href="/Client/dist/chunk-1.js">\n<link rel="modulepreload" href="/Client/dist/chunk-2.js">\n</head>`,
      );
    });

    it("sin script del entry, la plataforma va antes de los bundles que se agregan al final", () => {
      expect(withExtras().transform("<html><body></body></html>")).toBe(
        `<html><link rel="modulepreload" href="/Client/dist/chunk-1.js">\n<link rel="modulepreload" href="/Client/dist/chunk-2.js">\n` +
          `<body><script defer src="/Client/dist/platform-EF56.js"></script>\n<script type="module" src="/Client/dist/main-AB12.js"></script>\n</body></html>`,
      );
    });
  });
});

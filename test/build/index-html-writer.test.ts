import { describe, expect, it } from "vitest";
import { IndexHtmlWriter } from "@/build/index-html-writer.ts";

describe("IndexHtmlWriter.transform()", () => {
  const writer = (output = "index.html") =>
    IndexHtmlWriter.from({ index: "src/index.ts" }, "dist", { input: "index.html", output });

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
});

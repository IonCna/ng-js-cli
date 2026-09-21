import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { templateTransform } from "@/plugins/esbuild-template-plugin.ts";

describe("templateTransform", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "template-transform-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("devuelve undefined si el archivo no tiene templateUrl", async () => {
    const result = await templateTransform.transform("class Foo {}", join(dir, "foo.ts"));
    expect(result).toBeUndefined();
  });

  it("inlinea el template escopeado e inyecta el style al document.head", async () => {
    await writeFile(join(dir, "card.html"), "<div class='card'><p>hola</p></div>");
    await writeFile(join(dir, "card.css"), ".card { color: red; }");

    const code = `@Component({ selector: "app-card", templateUrl: "./card.html", styleUrl: "./card.css" }) class Card {}`;
    const result = await templateTransform.transform(code, join(dir, "card.ts"));

    expect(result).toBeDefined();
    expect(result).toContain("template:");
    expect(result).not.toContain("styleUrl");
    expect(result).toMatch(/_content-[0-9a-f]{8}/);
    expect(result).toContain("document.head.appendChild(s)");
    expect(result).toContain(".card[_content-");
  });

  it("no rompe sintaxis cuando no hay styleUrl (sin inyección de estilo)", async () => {
    await writeFile(join(dir, "card.html"), "<div class='card'></div>");

    const code = `@Component({ selector: "app-card", templateUrl: "./card.html" }) class Card {}`;
    const result = await templateTransform.transform(code, join(dir, "card.ts"));

    expect(result).toBeDefined();
    expect(result).toContain("template:");
    expect(result).not.toContain("document.head.appendChild");
  });
});

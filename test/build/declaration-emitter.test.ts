import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DeclarationEmitter } from "@/build/declaration-emitter.ts";

describe("DeclarationEmitter.rewrite()", () => {
  let root: string;
  const src = () => join(root, "src");
  const types = () => join(root, "dist", "types");

  const declare = async (path: string, content = "export {};\n") => {
    const file = join(types(), path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
    return file;
  };

  const emitter = () =>
    DeclarationEmitter.forPaths(src(), types(), { "@ngb": [`${src()}/`], "@ngb/*": [`${src()}/*`] });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ngjs-dts-"));
    await declare("utils/index.d.ts");
    await declare("modal/ngb-modal-ref.d.ts");
    await declare("index.d.ts");
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it("resuelve alias de paths a relativos con .js (archivo y barrel)", async () => {
    const file = await declare(
      "modal/ngb-modal.d.ts",
      [
        `import { NgbModalRef } from "@ngb/modal/ngb-modal-ref.ts";`,
        `import type { X } from '@ngb/utils';`,
        `export { NgbModule } from "@ngb";`,
        `export declare const x: import("@ngb/modal/ngb-modal-ref").NgbModalRef;`,
        "",
      ].join("\n"),
    );
    expect(await emitter().rewrite()).toBe(1);
    expect(await readFile(file, "utf8")).toBe(
      [
        `import { NgbModalRef } from "./ngb-modal-ref.js";`,
        `import type { X } from '../utils/index.js';`,
        `export { NgbModule } from "../index.js";`,
        `export declare const x: import("./ngb-modal-ref.js").NgbModalRef;`,
        "",
      ].join("\n"),
    );
  });

  it("relativos con .ts o sin extensión pasan al .js real", async () => {
    const file = await declare("index.d.ts", `export * from "./utils.ts";\nexport * from "./modal/ngb-modal-ref";\n`);
    await emitter().rewrite();
    expect(await readFile(file, "utf8")).toBe(
      `export * from "./utils/index.js";\nexport * from "./modal/ngb-modal-ref.js";\n`,
    );
  });

  it("no toca paquetes externos ni strings que no son imports; es idempotente", async () => {
    const content = `import { Injectable } from "ngjs-core";\nimport type { Observable } from "rxjs";\nexport type S = "@ngb/utils";\n`;
    const file = await declare("x.d.ts", content);
    expect(await emitter().rewrite()).toBe(0);
    expect(await readFile(file, "utf8")).toBe(content);
  });
});

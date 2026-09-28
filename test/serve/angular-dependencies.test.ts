import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AngularDependencies } from "@/serve/angular-dependencies.ts";

describe("AngularDependencies.include()", () => {
  let dir: string;

  const pkg = async (path: string, json: object) => {
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "package.json"), JSON.stringify(json));
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ngjs-angular-deps-"));
    const app = join(dir, "app");
    await pkg(app, {
      dependencies: { angular: "1.8.3", "angular-translate": "^2", lodash: "^4", "my-lib": "link:my-lib" },
      devDependencies: { "@types/angular": "^1" },
    });
    await pkg(join(app, "node_modules", "angular"), { main: "index.js" });
    await pkg(join(app, "node_modules", "angular-translate"), { main: "dist/t.js", dependencies: { angular: "^1.8" } });
    await pkg(join(app, "node_modules", "lodash"), { main: "lodash.js" });
    await pkg(join(app, "node_modules", "@types", "angular"), { types: "index.d.ts", dependencies: { angular: "*" } });

    // Librería enlazada (`link:`): fuera de `node_modules`, con sus propias dependencias.
    const lib = join(dir, "my-lib");
    await pkg(lib, { module: "dist/index.js", dependencies: { "@uirouter/angularjs": "^1", rxjs: "^7" } });
    await pkg(join(lib, "node_modules", "@uirouter", "angularjs"), { main: "r.js", peerDependencies: { angular: ">=1.2" } });
    await pkg(join(lib, "node_modules", "rxjs"), { module: "index.js" });
    await symlink(lib, join(app, "node_modules", "my-lib"), "dir");
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("incluye angular y lo que lo requiere, también dentro de librerías enlazadas (sintaxis `a > b`)", () => {
    expect(AngularDependencies.include(join(dir, "app"))).toEqual([
      "angular",
      "angular-translate",
      "my-lib > @uirouter/angularjs",
    ]);
  });

  it("sin package.json solo angular", () => {
    expect(AngularDependencies.include(join(dir, "nope"))).toEqual(["angular"]);
  });
});

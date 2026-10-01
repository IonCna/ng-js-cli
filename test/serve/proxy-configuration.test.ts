import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProxyConfiguration } from "@/serve/proxy-configuration.ts";

describe("ProxyConfiguration (como load-proxy-config de @angular/build)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ngjs-proxy-config-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("sin proxyConfig no hay proxy", async () => {
    expect(await ProxyConfiguration.load(dir, undefined)).toBeUndefined();
  });

  it(".json con comentarios y coma final; las opciones pasan tal cual, la clave ^regex queda igual", async () => {
    await writeFile(
      join(dir, "proxy.conf.json"),
      `{
        // backend
        "^/[A-Z]": { "target": "https://localhost:44383", "secure": false, "changeOrigin": true, },
      }`,
    );

    expect(await ProxyConfiguration.load(dir, "proxy.conf.json")).toEqual({
      "^/[A-Z]": { target: "https://localhost:44383", secure: false, changeOrigin: true },
    });
  });

  it(".mjs: usa el export default", async () => {
    await writeFile(join(dir, "proxy.conf.mjs"), `export default { "/api": { target: "http://backend" } };`);

    expect(await ProxyConfiguration.load(dir, "proxy.conf.mjs")).toEqual({ "/api": { target: "http://backend" } });
  });

  it("errores con el mismo texto que Angular", async () => {
    await expect(ProxyConfiguration.load(dir, "missing.json")).rejects.toThrow(
      `Proxy configuration file ${join(dir, "missing.json")} does not exist.`,
    );

    await writeFile(join(dir, "bad.json"), `{\n  "/api": { "target" }\n}`);
    await expect(ProxyConfiguration.load(dir, "bad.json")).rejects.toThrow(/contains parse errors:\n\[2, \d+\] ColonExpected/);
  });

  it("forma array (webpack): una entrada por cada path de context", () => {
    const entry = { target: "http://backend" };
    expect(ProxyConfiguration.normalize([{ context: ["/api", "/auth"], ...entry }])).toEqual({ "/api": entry, "/auth": entry });
  });

  it("claves glob → regex; las que empiezan con ^ no se tocan", () => {
    const proxy = ProxyConfiguration.normalize({ "/api/**": { target: "a" }, "^/[A-Z]": { target: "b" } });

    expect(Object.keys(proxy)).toContain("^/[A-Z]");
    const globKey = Object.keys(proxy).find((key) => key !== "^/[A-Z]")!;
    expect(new RegExp(globKey).test("/api/users/1")).toBe(true);
  });

  it("pathRewrite → rewrite: gana la primera regla que cambia el path", () => {
    const proxy = ProxyConfiguration.normalize({ "/api": { target: "x", pathRewrite: { "^/api": "", "/v1/": "/v2/" } } }) as Record<
      string,
      { rewrite: (path: string) => string; pathRewrite?: unknown }
    >;

    expect(proxy["/api"]).not.toHaveProperty("pathRewrite");
    expect(proxy["/api"]!.rewrite("/api/v1/users")).toBe("/v1/users");
    expect(proxy["/api"]!.rewrite("/other/v1/")).toBe("/other/v2/");
  });
});

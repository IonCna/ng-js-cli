import { afterEach, describe, expect, it } from "vitest";
import type { NgModuleMetadata } from "@/metadata/decorator-metadata.ts";
import { MetadataStore } from "@/metadata/metadata-store.ts";
import { ModuleWriter } from "@/plugins/module-writer.ts";

describe("ModuleWriter", () => {
  afterEach(() => {
    MetadataStore.clear();
  });

  it("devuelve undefined si no hay metadata de ngmodule para el path", () => {
    expect(ModuleWriter.write("class Foo {}", "foo.ts")).toBeUndefined();
  });

  it("estampa ɵmod con la forma de StampedNgModuleDef — declarations/imports/providers/bootstrap sin comillas (referencias reales)", () => {
    const metadata: NgModuleMetadata = {
      kind: "ngmodule",
      className: "AppModule",
      declarations: ["CardComponent"],
      imports: ["SharedModule"],
      providers: ["SomeService"],
      bootstrap: ["CardComponent"],
    };
    MetadataStore.set("app.module.ts", [metadata]);

    const output = ModuleWriter.write("class AppModule {}", "app.module.ts")!;

    expect(output).toMatch(/AppModule\.ɵmod = \{ id: "AppModule_[0-9a-f]{8}", declarations: \[CardComponent\], imports: \[SharedModule\], providers: \[SomeService\], bootstrap: \[CardComponent\] \};/);
    expect(output).not.toContain('"CardComponent"');
    expect(output).not.toContain('"SomeService"');
  });

  it("también estampa $name = id (como stampNgModuleDef, para que otro módulo que lo importe lo resuelva igual)", () => {
    const metadata: NgModuleMetadata = {
      kind: "ngmodule",
      className: "AppModule",
      declarations: [],
      imports: [],
      providers: [],
      bootstrap: [],
    };
    MetadataStore.set("app.module.ts", [metadata]);

    const output = ModuleWriter.write("class AppModule {}", "app.module.ts")!;
    const idMatch = output.match(/AppModule\.ɵmod = \{ id: "([^"]+)"/);
    expect(idMatch).not.toBeNull();
    expect(output).toContain(`AppModule.$name = "${idMatch![1]}";`);
  });

  it("agrega controllerAs solo si @NgModule lo declaró", () => {
    const withControllerAs: NgModuleMetadata = {
      kind: "ngmodule",
      className: "AppModule",
      declarations: [],
      imports: [],
      providers: [],
      bootstrap: [],
      controllerAs: "vm",
    };
    MetadataStore.set("app.module.ts", [withControllerAs]);

    expect(ModuleWriter.write("class AppModule {}", "app.module.ts")).toContain('controllerAs: "vm"');

    MetadataStore.clear();
    MetadataStore.set("app.module.ts", [{ ...withControllerAs, controllerAs: undefined }]);
    expect(ModuleWriter.write("class AppModule {}", "app.module.ts")).not.toContain("controllerAs");
  });

  it("el id es determinista para el mismo path+className (mismo hash que usa DecoratorWriter para $name de un injectable sin id)", () => {
    const metadata: NgModuleMetadata = {
      kind: "ngmodule",
      className: "AppModule",
      declarations: [],
      imports: [],
      providers: [],
      bootstrap: [],
    };
    MetadataStore.set("app.module.ts", [metadata]);

    const first = ModuleWriter.write("class AppModule {}", "app.module.ts")!;
    MetadataStore.set("app.module.ts", [metadata]);
    const second = ModuleWriter.write("class AppModule {}", "app.module.ts")!;

    expect(first).toBe(second);
  });

  it("no registra nada en angular.module(...) directamente — eso queda para ngjs-core/runtime al leer ɵmod", () => {
    const metadata: NgModuleMetadata = {
      kind: "ngmodule",
      className: "AppModule",
      declarations: ["CardComponent"],
      imports: [],
      providers: [],
      bootstrap: [],
    };
    MetadataStore.set("app.module.ts", [metadata]);

    const output = ModuleWriter.write("class AppModule {}", "app.module.ts")!;

    expect(output).not.toContain("angular.module");
    expect(output).not.toContain(".component(");
    expect(output).not.toContain(".directive(");
  });
});

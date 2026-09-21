import { afterEach, describe, expect, it } from "vitest";
import type { ComponentMetadata, DirectiveMetadata } from "@/metadata/decorator-metadata.ts";
import { MetadataStore } from "@/metadata/metadata-store.ts";
import { DecoratorWriter } from "@/plugins/decorator-writer.ts";

describe("DecoratorWriter", () => {
  afterEach(() => {
    MetadataStore.clear();
  });

  it("devuelve undefined si no hay metadata de component para el path", () => {
    expect(DecoratorWriter.write("class Foo {}", "foo.ts")).toBeUndefined();
  });

  it("escribe ClassName.ɵcmp con la forma de StampedComponentDef: inputs/outputs como arrays, host anidado", () => {
    const metadata: ComponentMetadata = {
      kind: "component",
      className: "CardComponent",
      options: { selector: "app-card" },
      constructorTokens: [],
      inputs: [{ propName: "title", bindingName: "title" }],
      outputs: [{ propName: "closed", bindingName: "closed" }],
      hostBindings: [{ propName: "isOpen", hostProperty: "class.open" }],
      hostListeners: [{ methodName: "onClick", eventName: "click" }],
      providers: [],
    };
    MetadataStore.set("card.ts", [metadata]);

    const output = DecoratorWriter.write("class CardComponent {}", "card.ts")!;

    expect(output).toContain("class CardComponent {}");
    expect(output).not.toContain('"CardComponent"');
    expect(output).not.toContain("type:");
    expect(output).not.toContain("ɵid");

    // el resultado debe ser JS válido — la clase existe cuando corre la asignación
    const module = { CardComponent: undefined as unknown };
    // eslint-disable-next-line no-new-func
    new Function("module", `${output.replace("class CardComponent {}", "class CardComponent {}; module.CardComponent = CardComponent;")}`)(module);
    expect((module.CardComponent as { ɵcmp: unknown }).ɵcmp).toEqual({
      selector: "app-card",
      inputs: [{ propName: "title", bindingName: "title" }],
      outputs: [{ propName: "closed", bindingName: "closed" }],
      host: {
        bindings: [{ propName: "isOpen", hostProperty: "class.open" }],
        listeners: [{ methodName: "onClick", eventName: "click" }],
      },
    });
  });

  it("no agrega 'host' si no hay hostBindings ni hostListeners", () => {
    const metadata: ComponentMetadata = {
      kind: "component",
      className: "CardComponent",
      options: { selector: "app-card" },
      constructorTokens: [],
      inputs: [],
      outputs: [],
      hostBindings: [],
      hostListeners: [],
      providers: [],
    };
    MetadataStore.set("card.ts", [metadata]);

    const output = DecoratorWriter.write("class CardComponent {}", "card.ts")!;

    expect(output).not.toContain("host:");
  });

  it("conserva el resto de las options de @Component (template, transclude, ...) tal cual", () => {
    const metadata: ComponentMetadata = {
      kind: "component",
      className: "CardComponent",
      options: { selector: "app-card", template: "<div></div>", controllerAs: "vm" },
      constructorTokens: [],
      inputs: [],
      outputs: [],
      hostBindings: [],
      hostListeners: [],
      providers: [],
    };
    MetadataStore.set("card.ts", [metadata]);

    const output = DecoratorWriter.write("class CardComponent {}", "card.ts")!;

    expect(output).toContain('template: "<div></div>"');
    expect(output).toContain('controllerAs: "vm"');
  });

  it("escribe ClassName.ɵdir para @Directive (no ɵcmp)", () => {
    const metadata: DirectiveMetadata = {
      kind: "directive",
      className: "HighlightDirective",
      options: { selector: "[appHighlight]" },
      constructorTokens: [],
      inputs: [],
      outputs: [],
      hostBindings: [],
      hostListeners: [],
      providers: [],
    };
    MetadataStore.set("highlight.ts", [metadata]);

    const output = DecoratorWriter.write("class HighlightDirective {}", "highlight.ts")!;

    expect(output).toContain("HighlightDirective.ɵdir = {");
    expect(output).not.toContain("ɵcmp");
  });

  it("ignora 'ngmodule' — eso lo procesa ModuleWriter, no acá", () => {
    MetadataStore.set("app.module.ts", [
      { kind: "ngmodule", className: "AppModule", declarations: [], imports: [], providers: [], bootstrap: [] },
    ]);

    expect(DecoratorWriter.write("class AppModule {}", "app.module.ts")).toBeUndefined();
  });

  it("escribe $name para 'service' aunque no tenga ɵcmp/ɵdir (sin bindings), solo si no hay uno propio", () => {
    MetadataStore.set("foo.service.ts", [
      { kind: "service", className: "FooService", options: {}, constructorTokens: [] },
    ]);

    const output = DecoratorWriter.write("class FooService {}", "foo.service.ts")!;

    expect(output).toMatch(/if \(!Object\.hasOwn\(FooService, "\$name"\)\) \{ FooService\.\$name = "FooService_[0-9a-f]{8}"; \}/);
    expect(output).not.toContain("ɵcmp");
    expect(output).not.toContain("ɵdir");
    expect(output).not.toContain("$inject");
  });

  it("usa @Injectable({ id }) tal cual, sin guardia ni hash", () => {
    MetadataStore.set("foo.service.ts", [
      { kind: "injectable", className: "FooService", options: { id: "myFoo" }, constructorTokens: [] },
    ]);

    const output = DecoratorWriter.write("class FooService {}", "foo.service.ts")!;

    expect(output).toContain('FooService.$name = "myFoo";');
  });

  it("escribe $inject con referencias de clase reales (no strings precalculados) y literals tal cual, respetando null posicional", () => {
    MetadataStore.set("foo.service.ts", [
      {
        kind: "service",
        className: "FooService",
        options: {},
        constructorTokens: [
          { kind: "identifier", value: "SomeService" },
          { kind: "literal", value: "$http" },
          null,
        ],
      },
    ]);

    const output = DecoratorWriter.write("class FooService {}", "foo.service.ts")!;

    expect(output).toContain('FooService.$inject = [SomeService, "$http", null];');
  });

  it("escribe providers sin comillas dentro de ɵcmp (referencias reales, no strings)", () => {
    const metadata: ComponentMetadata = {
      kind: "component",
      className: "CardComponent",
      options: { selector: "app-card" },
      constructorTokens: [],
      inputs: [],
      outputs: [],
      hostBindings: [],
      hostListeners: [],
      providers: ["SomeService", "OtherService"],
    };
    MetadataStore.set("card.ts", [metadata]);

    const output = DecoratorWriter.write("class CardComponent {}", "card.ts")!;

    expect(output).toContain("providers: [SomeService, OtherService]");
    expect(output).not.toContain('"SomeService"');
  });

  it("no agrega providers al ɵcmp si viene vacío", () => {
    const metadata: ComponentMetadata = {
      kind: "component",
      className: "CardComponent",
      options: { selector: "app-card" },
      constructorTokens: [],
      inputs: [],
      outputs: [],
      hostBindings: [],
      hostListeners: [],
      providers: [],
    };
    MetadataStore.set("card.ts", [metadata]);

    const output = DecoratorWriter.write("class CardComponent {}", "card.ts")!;

    expect(output).not.toContain("providers");
  });

  it("escribe ClassName.ɵpipe con name/pure para @Pipe", () => {
    MetadataStore.set("upper.pipe.ts", [
      { kind: "pipe", className: "UpperPipe", options: { name: "upper", pure: false }, constructorTokens: [] },
    ]);

    const output = DecoratorWriter.write("class UpperPipe {}", "upper.pipe.ts")!;

    expect(output).toContain('UpperPipe.ɵpipe = { name: "upper", pure: false };');
  });
});

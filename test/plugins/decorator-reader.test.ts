import { afterEach, describe, expect, it } from "vitest";
import type { ComponentMetadata, NgModuleMetadata, PipeMetadata, ServiceMetadata } from "@/metadata/decorator-metadata.ts";
import { MetadataStore } from "@/metadata/metadata-store.ts";
import { decoratorReaderTransform } from "@/plugins/decorator-reader.ts";

describe("decoratorReaderTransform", () => {
  afterEach(() => {
    MetadataStore.clear();
  });

  it("devuelve undefined si no hay decoradores conocidos (no toca nada)", async () => {
    const result = await decoratorReaderTransform.transform("export class Plain {}", "plain.ts");
    expect(result).toBeUndefined();
  });

  it("saca el decorador de clase reconocido del código — no debe seguir ejecutándose en runtime", async () => {
    const code = `@Component({ selector: "app-card" }) export class CardComponent {}`;
    const result = await decoratorReaderTransform.transform(code, "card.ts");

    expect(result).not.toContain("@Component");
    expect(result).toContain("export class CardComponent {}");
  });

  it("no guarda nada si no hay decoradores conocidos", async () => {
    await decoratorReaderTransform.transform("export class Plain {}", "plain.ts");
    expect(MetadataStore.get("plain.ts")).toEqual([]);
  });

  it("lee constructorTokens: @Inject(Token) tiene prioridad, sin decorador cae al tipo (como Angular real)", async () => {
    const code = `
      @Component({ selector: "app-card" })
      export class CardComponent {
        constructor(@Inject(SomeToken) private svc: SomeService, private http: HttpClient) {}
      }
    `;

    await decoratorReaderTransform.transform(code, "card.ts");
    const [metadata] = MetadataStore.get("card.ts") as [ComponentMetadata];

    expect(metadata.constructorTokens).toEqual([
      { kind: "identifier", value: "SomeToken" },
      { kind: "identifier", value: "HttpClient" },
    ]);
  });

  it("@Inject('$http') (string literal) queda como literal, no identifier — es el nombre real de AngularJS", async () => {
    const code = `
      @Service()
      export class FooService {
        constructor(@Inject("$http") private http: unknown) {}
      }
    `;

    await decoratorReaderTransform.transform(code, "foo.service.ts");
    const [metadata] = MetadataStore.get("foo.service.ts") as [ServiceMetadata];

    expect(metadata.constructorTokens).toEqual([{ kind: "literal", value: "$http" }]);
  });

  it("constructorTokens queda null (no filtrado) si no hay @Inject ni tipo resoluble", async () => {
    const code = `
      @Component({ selector: "app-card" })
      export class CardComponent {
        constructor(private untyped, private http: HttpClient) {}
      }
    `;

    await decoratorReaderTransform.transform(code, "card.ts");
    const [metadata] = MetadataStore.get("card.ts") as [ComponentMetadata];

    expect(metadata.constructorTokens).toEqual([null, { kind: "identifier", value: "HttpClient" }]);
  });

  it("lee @Component con selector, inputs, outputs, host binding y host listener — y saca TODOS los decoradores reconocidos del código", async () => {
    const code = `
      @Component({ selector: "app-card", templateUrl: "./card.html" })
      export class CardComponent {
        @Input() title!: string;
        @Input("aka") alias!: string;
        @Output() closed = new EventEmitter<void>();

        @HostBinding("class.open") isOpen = false;

        constructor(@Inject(SomeService) private svc: SomeService) {}

        @HostListener("click", ["$event"])
        onClick(event: unknown) {}
      }
    `;

    const result = await decoratorReaderTransform.transform(code, "card.ts");
    for (const decorator of ["@Component", "@Input", "@Output", "@HostBinding", "@HostListener", "@Inject"]) {
      expect(result).not.toContain(decorator);
    }
    expect(result).toContain("export class CardComponent {");
    expect(result).toContain("title!: string;");
    expect(result).toContain("onClick(event: unknown) {}");

    const [metadata] = MetadataStore.get("card.ts") as [ComponentMetadata];

    expect(metadata.kind).toBe("component");
    expect(metadata.className).toBe("CardComponent");
    expect(metadata.options).toEqual({ selector: "app-card", templateUrl: "./card.html" });
    expect(metadata.inputs).toEqual([
      { propName: "title", bindingName: "title" },
      { propName: "alias", bindingName: "aka" },
    ]);
    expect(metadata.outputs).toEqual([{ propName: "closed", bindingName: "closed" }]);
    expect(metadata.hostBindings).toEqual([{ propName: "isOpen", hostProperty: "class.open" }]);
    expect(metadata.hostListeners).toEqual([{ methodName: "onClick", eventName: "click" }]);
  });

  it("lee providers de @Component/@Directive como identificadores, no literales", async () => {
    const code = `@Component({ selector: "app-card", providers: [SomeService, OtherService] }) export class CardComponent {}`;

    await decoratorReaderTransform.transform(code, "card.ts");
    const [metadata] = MetadataStore.get("card.ts") as [ComponentMetadata];

    expect(metadata.providers).toEqual(["SomeService", "OtherService"]);
  });

  it("lee providers de @NgModule", async () => {
    const code = `@NgModule({ declarations: [], imports: [], providers: [SomeService] }) export class AppModule {}`;

    await decoratorReaderTransform.transform(code, "app.module.ts");
    const [metadata] = MetadataStore.get("app.module.ts") as [NgModuleMetadata];

    expect(metadata.providers).toEqual(["SomeService"]);
  });

  it("lee @Pipe sin bindings", async () => {
    const code = `@Pipe({ name: "truncate" }) export class TruncatePipe { transform(v: unknown) { return v; } }`;
    await decoratorReaderTransform.transform(code, "truncate.ts");

    const [metadata] = MetadataStore.get("truncate.ts") as [PipeMetadata];
    expect(metadata.kind).toBe("pipe");
    expect(metadata.options).toEqual({ name: "truncate" });
  });

  it("lee @Service y @Injectable como kinds distintos", async () => {
    await decoratorReaderTransform.transform(`@Service() export class FooService {}`, "foo.service.ts");
    await decoratorReaderTransform.transform(`@Injectable() export class BarService {}`, "bar.service.ts");

    const [foo] = MetadataStore.get("foo.service.ts") as [ServiceMetadata];
    const [bar] = MetadataStore.get("bar.service.ts") as [ServiceMetadata];
    expect(foo.kind).toBe("service");
    expect(bar.kind).toBe("injectable");
  });

  it("lee @NgModule con declarations/imports como identificadores, no literales", async () => {
    const code = `
      import { CardComponent } from "./card.component.ts";
      @NgModule({ declarations: [CardComponent], imports: [] })
      export class AppModule {}
    `;

    await decoratorReaderTransform.transform(code, "app.module.ts");
    const [metadata] = MetadataStore.get("app.module.ts") as [NgModuleMetadata];

    expect(metadata.kind).toBe("ngmodule");
    expect(metadata.className).toBe("AppModule");
    expect(metadata.declarations).toEqual(["CardComponent"]);
    expect(metadata.imports).toEqual([]);
  });

  it("lee bootstrap (identificadores) y controllerAs (string) de @NgModule", async () => {
    const code = `
      import { AppComponent } from "./app.component.ts";
      @NgModule({ declarations: [AppComponent], imports: [], bootstrap: [AppComponent], controllerAs: "vm" })
      export class AppModule {}
    `;

    await decoratorReaderTransform.transform(code, "app.module.ts");
    const [metadata] = MetadataStore.get("app.module.ts") as [NgModuleMetadata];

    expect(metadata.bootstrap).toEqual(["AppComponent"]);
    expect(metadata.controllerAs).toBe("vm");
  });

  it("lee más de una clase decorada por archivo", async () => {
    const code = `
      @Injectable() export class AService {}
      @Injectable() export class BService {}
    `;
    await decoratorReaderTransform.transform(code, "multi.ts");
    expect(MetadataStore.get("multi.ts")).toHaveLength(2);
  });
});

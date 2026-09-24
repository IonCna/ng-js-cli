import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

/**
 * El `.spec.ts` que `ng generate` escribe junto a cada schematic (el mismo de Angular 16, con `TestBed` de
 * `ngjs-core/testing`): lo corre `ngjs test`. `module`, `interface` y `enum` no llevan, como en Angular.
 */
export class SpecTemplate {
  private constructor(
    private readonly generated: GeneratedSchematic,
    private readonly body: string,
  ) {}

  static for(generated: GeneratedSchematic): SpecTemplate | undefined {
    const body = SpecTemplate.body(generated);
    return body === undefined ? undefined : new SpecTemplate(generated, body);
  }

  toString(): string {
    return this.body;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.generated.fileName}.spec.ts`), this.body, "utf8");
  }

  private static body({ kind, className: name, fileName }: GeneratedSchematic): string | undefined {
    const source = `./${fileName}`;
    switch (kind) {
      case "component":
        return `import { ComponentFixture, TestBed } from "ngjs-core/testing";
import { ${name} } from "${source}";

describe("${name}", () => {
  let component: ${name};
  let fixture: ComponentFixture<${name}>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [${name}],
    }).compileComponents();

    fixture = TestBed.createComponent(${name});
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
`;
      case "service":
        return `import { TestBed } from "ngjs-core/testing";
import { ${name} } from "${source}";

describe("${name}", () => {
  let service: ${name};

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(${name});
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });
});
`;
      case "guard":
      case "resolver": {
        const [type, execute] = kind === "guard" ? ["CanActivateFn", "executeGuard"] : ["ResolveFn<unknown>", "executeResolver"];
        const typeName = type.replace(/<.*/, "");
        return `import type { ${typeName} } from "ngjs-core/router";
import { TestBed } from "ngjs-core/testing";
import { ${name} } from "${source}";

describe("${name}", () => {
  const ${execute}: ${type} = (...parameters) => TestBed.runInInjectionContext(() => ${name}(...parameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it("should be created", () => {
    expect(${execute}).toBeTruthy();
  });
});
`;
      }
      case "directive":
      case "pipe":
      case "interceptor":
      case "class":
        return `import { ${name} } from "${source}";

describe("${name}", () => {
  it("should create an instance", () => {
    expect(new ${name}()).toBeTruthy();
  });
});
`;
      default:
        return undefined;
    }
  }
}

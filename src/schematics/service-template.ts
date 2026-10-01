import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

export class ServiceTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
  ) {}

  static from(name: string): ServiceTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ServiceTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Service`);
  }

  toString(): string {
    return `import { Injectable } from "ngjs-core";

@Injectable({
  providedIn: "root",
})
export class ${this.className} {}
`;
  }

  generated(): GeneratedSchematic {
    const fileName = `${this.fileBase}.service`;
    return { kind: "service", className: this.className, fileName, files: [{ name: `${fileName}.ts`, content: this.toString() }] };
  }
}

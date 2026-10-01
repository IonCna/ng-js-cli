import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

export class EnumTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly enumName: string,
  ) {}

  /** `--type` solo cambia el archivo (`role.enum.ts`), como Angular. */
  static from(name: string, type = ""): EnumTemplate {
    return new EnumTemplate(EnumTemplate.fileBase(name, type), CaseTransform.toPascalCase(name));
  }

  private static fileBase(name: string, type: string): string {
    const dasherized = CaseTransform.toKebabCase(name);
    return type ? `${dasherized}.${CaseTransform.toKebabCase(type)}` : dasherized;
  }

  toString(): string {
    return `export enum ${this.enumName} {}\n`;
  }

  generated(): GeneratedSchematic {
    return {
      kind: "enum",
      className: this.enumName,
      fileName: this.fileBase,
      files: [{ name: `${this.fileBase}.ts`, content: this.toString() }],
    };
  }
}

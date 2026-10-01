import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

export class InterfaceTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly interfaceName: string,
  ) {}

  /** Como Angular: `--prefix` va delante del nombre (`IUser`), `--type` solo cambia el archivo (`user.model.ts`). */
  static from(name: string, prefix = "", type = ""): InterfaceTemplate {
    return new InterfaceTemplate(InterfaceTemplate.fileBase(name, type), `${prefix}${CaseTransform.toPascalCase(name)}`);
  }

  private static fileBase(name: string, type: string): string {
    const dasherized = CaseTransform.toKebabCase(name);
    return type ? `${dasherized}.${CaseTransform.toKebabCase(type)}` : dasherized;
  }

  toString(): string {
    return `export interface ${this.interfaceName} {}\n`;
  }

  generated(): GeneratedSchematic {
    return {
      kind: "interface",
      className: this.interfaceName,
      fileName: this.fileBase,
      files: [{ name: `${this.fileBase}.ts`, content: this.toString() }],
    };
  }
}

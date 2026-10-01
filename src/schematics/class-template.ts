import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

export class ClassTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
  ) {}

  /** `--type model` → `user.model.ts`; la clase sigue siendo `User`, como Angular. */
  static from(name: string, type = ""): ClassTemplate {
    const fileBase = ClassTemplate.fileBase(name, type);
    return new ClassTemplate(fileBase, CaseTransform.toPascalCase(name));
  }

  private static fileBase(name: string, type: string): string {
    const dasherized = CaseTransform.toKebabCase(name);
    return type ? `${dasherized}.${CaseTransform.toKebabCase(type)}` : dasherized;
  }

  toString(): string {
    return `export class ${this.className} {}\n`;
  }

  generated(): GeneratedSchematic {
    return {
      kind: "class",
      className: this.className,
      fileName: this.fileBase,
      files: [{ name: `${this.fileBase}.ts`, content: this.toString() }],
    };
  }
}

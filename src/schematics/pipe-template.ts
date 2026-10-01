import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

export class PipeTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    public readonly pipeName: string,
  ) {}

  static from(name: string): PipeTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new PipeTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Pipe`, CaseTransform.toCamelCase(name));
  }

  toString(): string {
    return `import { Pipe, type PipeTransform } from "ngjs-core";

@Pipe({
  name: "${this.pipeName}",
})
export class ${this.className} implements PipeTransform {
  transform(value: unknown): unknown {
    return value;
  }
}
`;
  }

  generated(): GeneratedSchematic {
    const fileName = `${this.fileBase}.pipe`;
    return { kind: "pipe", className: this.className, fileName, files: [{ name: `${fileName}.ts`, content: this.toString() }] };
  }
}

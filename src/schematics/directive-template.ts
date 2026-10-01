import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

export class DirectiveTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    /** Nombre de atributo del selector (`[appHighlight]`) — `directive()` lo parsea a `restrict: "A"`. */
    public readonly registerName: string,
  ) {}

  /** Como Angular: `--selector` tal cual, o `<prefix>-<nombre>` en camelCase (sin prefix, solo el nombre). */
  static from(name: string, { prefix, selector }: { prefix?: string; selector?: string } = {}): DirectiveTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    const registerName = selector ?? CaseTransform.toCamelCase(prefix ? `${prefix}-${fileBase}` : fileBase);
    return new DirectiveTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Directive`, registerName);
  }

  toString(): string {
    return `import { Directive } from "ngjs-core";

@Directive({
  selector: "[${this.registerName}]",
})
export class ${this.className} {}
`;
  }

  generated(): GeneratedSchematic {
    const fileName = `${this.fileBase}.directive`;
    return { kind: "directive", className: this.className, fileName, files: [{ name: `${fileName}.ts`, content: this.toString() }] };
  }
}

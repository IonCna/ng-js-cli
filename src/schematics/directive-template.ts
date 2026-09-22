import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class DirectiveTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    /** Nombre de atributo del selector (`[appHighlight]`) — `directive()` lo parsea a `restrict: "A"`. */
    public readonly registerName: string,
  ) {}

  static from(name: string, prefix = "app"): DirectiveTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    const registerName = CaseTransform.toCamelCase(`${prefix}-${fileBase}`);
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

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.directive.ts`), this.toString(), "utf8");
  }
}

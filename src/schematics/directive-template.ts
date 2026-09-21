import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class DirectiveTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    /** Nombre de registro en AngularJS (`appHighlight`) — el selector no existe sin core. */
    public readonly registerName: string,
  ) {}

  static from(name: string, prefix = "app"): DirectiveTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    const registerName = CaseTransform.toCamelCase(`${prefix}-${fileBase}`);
    return new DirectiveTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Directive`, registerName);
  }

  toString(): string {
    return `export class ${this.className} {
  static $name = "${this.registerName}";
  static ɵdir = {
    restrict: "A",
    controller: ${this.className},
  };
  static $inject = [];
}
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.directive.ts`), this.toString(), "utf8");
  }
}

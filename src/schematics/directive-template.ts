import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class DirectiveTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    /** Nombre de registro en AngularJS (`appHighlight`) — también el nombre de atributo del selector `[appHighlight]` con `core`. */
    public readonly registerName: string,
    public readonly core: boolean,
  ) {}

  static from(name: string, prefix = "app", core = false): DirectiveTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    const registerName = CaseTransform.toCamelCase(`${prefix}-${fileBase}`);
    return new DirectiveTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Directive`, registerName, core);
  }

  toString(): string {
    return this.core ? this.toCoreString() : this.toPlainString();
  }

  /** Con `core`: selector de atributo estilo Angular real (`[appHighlight]`) — `directive()` lo parsea a `restrict: "A"`. */
  private toCoreString(): string {
    return `import { Directive } from "ngjs-core";

@Directive({
  selector: "[${this.registerName}]",
})
export class ${this.className} {}
`;
  }

  private toPlainString(): string {
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

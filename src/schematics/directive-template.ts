import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class DirectiveTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    public readonly selector: string,
  ) {}

  static from(name: string, prefix = "app"): DirectiveTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    const attribute = `${prefix}${CaseTransform.toPascalCase(name)}`;
    return new DirectiveTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Directive`, `[${attribute}]`);
  }

  toString(): string {
    return `import { Directive } from "ngjs-core";

@Directive({
  selector: "${this.selector}",
})
export class ${this.className} {}
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.directive.ts`), this.toString(), "utf8");
  }
}

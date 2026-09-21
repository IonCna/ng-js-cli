import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class ModuleTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
  ) {}

  static from(name: string): ModuleTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ModuleTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Module`);
  }

  toString(): string {
    return `import { NgModule } from "ngjs-core";

@NgModule({
  declarations: [],
  imports: [],
})
export class ${this.className} {}
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.module.ts`), this.toString(), "utf8");
  }
}

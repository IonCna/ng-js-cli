import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class ClassTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
  ) {}

  static from(name: string): ClassTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ClassTemplate(fileBase, CaseTransform.toPascalCase(name));
  }

  toString(): string {
    return `export class ${this.className} {}\n`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.ts`), this.toString(), "utf8");
  }
}

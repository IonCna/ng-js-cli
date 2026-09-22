import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class EnumTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly enumName: string,
  ) {}

  static from(name: string): EnumTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new EnumTemplate(fileBase, CaseTransform.toPascalCase(name));
  }

  toString(): string {
    return `export enum ${this.enumName} {}\n`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.ts`), this.toString(), "utf8");
  }
}

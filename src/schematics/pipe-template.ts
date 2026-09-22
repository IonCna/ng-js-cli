import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

export class PipeTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    public readonly pipeName: string,
    public readonly core: boolean,
  ) {}

  static from(name: string, core = false): PipeTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new PipeTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Pipe`, CaseTransform.toCamelCase(name), core);
  }

  toString(): string {
    return this.core ? this.toCoreString() : this.toPlainString();
  }

  /**
   * Con `core`: `@Pipe` de `ngjs-core` solo estampa metadata (`name`/`pure`) — el
   * registro (`module.filter(...)`, vía `createPipeFilter`) sigue siendo manual,
   * ni `ngjs-core` lo automatizó todavía (ver `pipe-transform.ts` ahí).
   */
  private toCoreString(): string {
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

  private toPlainString(): string {
    return `export class ${this.className} {
  static $name = "${this.pipeName}";

  static transform = (() => {
    const _ = () => (value: unknown): unknown => value;
    _.$inject = [] as string[];
    return _;
  })();
}
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.pipe.ts`), this.toString(), "utf8");
  }
}

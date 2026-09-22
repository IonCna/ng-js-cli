import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

/**
 * `scoped` viene de `--scoped` (ver `generate-config.ts`) — pensado en su momento
 * para elegir `@Service()` vs `@Injectable()`, pero `ngjs-core` no tiene `@Service`
 * (solo `@Injectable`). Con `core`, el servicio siempre usa `@Injectable()`;
 * `scoped` queda sin efecto en los dos modos.
 */
export class ServiceTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
    public readonly scoped: boolean,
    public readonly core: boolean,
  ) {}

  static from(name: string, scoped = false, core = false): ServiceTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ServiceTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Service`, scoped, core);
  }

  toString(): string {
    return this.core ? this.toCoreString() : this.toPlainString();
  }

  private toCoreString(): string {
    return `import { Injectable } from "ngjs-core";

@Injectable()
export class ${this.className} {}
`;
  }

  private toPlainString(): string {
    return `export class ${this.className} {
  static $name = "${this.className}";
  static $inject = [];
}
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.service.ts`), this.toString(), "utf8");
  }
}

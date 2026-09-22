import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

/** `CanActivateFn` — funcional, como Angular 15+ (`ngjs-core/router`, ver `route.ts`). */
export class GuardTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly guardName: string,
  ) {}

  static from(name: string): GuardTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new GuardTemplate(fileBase, `${CaseTransform.toCamelCase(name)}Guard`);
  }

  toString(): string {
    return `import type { ActivatedRouteSnapshot, CanActivateFn } from "ngjs-core/router";

export const ${this.guardName}: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  return true;
};
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.guard.ts`), this.toString(), "utf8");
  }
}

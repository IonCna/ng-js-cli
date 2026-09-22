import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CaseTransform } from "@/schematics/case-transform.ts";

/** `ResolveFn<T>` — funcional, como Angular 15+ (`ngjs-core/router`, ver `route.ts`). */
export class ResolverTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly resolverName: string,
  ) {}

  static from(name: string): ResolverTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new ResolverTemplate(fileBase, `${CaseTransform.toCamelCase(name)}Resolver`);
  }

  toString(): string {
    return `import type { ActivatedRouteSnapshot, ResolveFn } from "ngjs-core/router";

export const ${this.resolverName}: ResolveFn<unknown> = (route: ActivatedRouteSnapshot) => {
  return null;
};
`;
  }

  async write(dir: string): Promise<void> {
    await writeFile(join(dir, `${this.fileBase}.resolver.ts`), this.toString(), "utf8");
  }
}

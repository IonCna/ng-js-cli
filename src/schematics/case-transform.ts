/** Transforms de nombre compartidos entre schematics (`ComponentTemplate`, y los que sigan). */
export class CaseTransform {
  static toKebabCase(name: string): string {
    return name
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase();
  }

  static toPascalCase(name: string): string {
    return CaseTransform.toKebabCase(name)
      .split("-")
      .filter(Boolean)
      .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
      .join("");
  }

  static toCamelCase(name: string): string {
    const pascal = CaseTransform.toPascalCase(name);
    return pascal[0]!.toLowerCase() + pascal.slice(1);
  }
}

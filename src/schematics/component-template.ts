import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic, SchematicOptions } from "@/schematics/schematic-registry.ts";

type ComponentOptions = Pick<SchematicOptions, "prefix" | "selector" | "style" | "inlineStyle" | "inlineTemplate" | "displayBlock" | "type">;

/** El componente de `ng generate component` de Angular 16 (`.ts` + `.html` + `.css`, o inline). */
export class ComponentTemplate {
  /** `validateHtmlSelector` de Angular. */
  private static readonly SELECTOR = /^[a-zA-Z][.0-9a-zA-Z]*(:?-[a-zA-Z][.0-9a-zA-Z]*)*$/;

  private constructor(
    /** `card`: el nombre en kebab-case (`<p>card works!</p>`). */
    private readonly dasherized: string,
    /** `card.component` (con `--type`): base de los tres archivos. */
    public readonly fileBase: string,
    public readonly className: string,
    /** Selector CSS real (`app-card`) — el que entiende `@Component` de `ngjs-core`. */
    public readonly selector: string,
    private readonly options: ComponentOptions,
  ) {}

  /** Selector: `--selector`, o `<prefix>-<nombre>` (sin prefix, solo el nombre — como Angular). */
  static from(name: string, options: ComponentOptions): ComponentTemplate {
    const dasherized = CaseTransform.toKebabCase(name);
    const fileBase = options.type ? `${dasherized}.${CaseTransform.toKebabCase(options.type)}` : dasherized;
    const selector = options.selector ?? (options.prefix ? `${options.prefix}-${dasherized}` : dasherized);
    if (!ComponentTemplate.SELECTOR.test(selector)) throw new Error(`Selector "${selector}" inválido.`);
    const className = `${CaseTransform.toPascalCase(name)}${CaseTransform.toPascalCase(options.type)}`;
    return new ComponentTemplate(dasherized, fileBase, className, selector, options);
  }

  toString(): string {
    const { inlineTemplate, inlineStyle, style } = this.options;
    const template = inlineTemplate
      ? `  template: \`
    <p>
      ${this.dasherized} works!
    </p>
  \`,`
      : `  templateUrl: "./${this.fileBase}.html",`;
    const styles = inlineStyle
      ? this.options.displayBlock
        ? `\n  styles: [\`
    :host {
      display: block;
    }
  \`],`
        : `\n  styles: [],`
      : style === "none"
        ? ""
        : `\n  styleUrls: ["./${this.fileBase}.${style}"],`;

    return `import { Component } from "ngjs-core";

@Component({
  selector: "${this.selector}",
${template}${styles}
})
export class ${this.className} {}
`;
  }

  /** El `.ts`, más el `.html` y el `.css` salvo que vayan inline (o `style: "none"`). */
  generated(): GeneratedSchematic {
    const { inlineTemplate, inlineStyle, style, displayBlock } = this.options;
    const files = [{ name: `${this.fileBase}.ts`, content: this.toString() }];
    if (!inlineTemplate) files.push({ name: `${this.fileBase}.html`, content: `<p>${this.dasherized} works!</p>\n` });
    if (!inlineStyle && style !== "none") {
      files.push({ name: `${this.fileBase}.${style}`, content: displayBlock ? ":host {\n  display: block;\n}\n" : "" });
    }
    return { kind: "component", className: this.className, fileName: this.fileBase, files };
  }
}

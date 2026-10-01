import { ClassTemplate } from "@/schematics/class-template.ts";
import { ComponentTemplate } from "@/schematics/component-template.ts";
import { DirectiveTemplate } from "@/schematics/directive-template.ts";
import { EnumTemplate } from "@/schematics/enum-template.ts";
import { GuardTemplate } from "@/schematics/guard-template.ts";
import { InterceptorTemplate } from "@/schematics/interceptor-template.ts";
import { InterfaceTemplate } from "@/schematics/interface-template.ts";
import { ModuleTemplate } from "@/schematics/module-template.ts";
import { PipeTemplate } from "@/schematics/pipe-template.ts";
import { ResolverTemplate } from "@/schematics/resolver-template.ts";
import { ServiceTemplate } from "@/schematics/service-template.ts";

export type SchematicKind =
  | "component"
  | "directive"
  | "pipe"
  | "service"
  | "module"
  | "class"
  | "interface"
  | "enum"
  | "guard"
  | "resolver"
  | "interceptor";

/**
 * `css` o `none`: `scss`/`sass`/`less` (que sí acepta Angular) no se ofrecen — ni `ngjs build` ni `ng-js-vite` los
 * compilan, el archivo generado no andaría.
 */
export type ComponentStyle = "css" | "none";

/** Las opciones de los schematics de Angular 16 que `ngjs generate` soporta, con los mismos nombres. */
export interface SchematicOptions {
  flat: boolean;
  skipTests: boolean;
  skipImport: boolean;
  /** `--module <path>`: el `@NgModule` donde registrar, en vez del más cercano. */
  module?: string;
  /** Además de `declarations`, a `exports` del módulo. */
  export: boolean;
  prefix?: string;
  selector?: string;
  style: ComponentStyle;
  inlineStyle: boolean;
  inlineTemplate: boolean;
  /** `:host { display: block; }` en el CSS del componente. */
  displayBlock: boolean;
  /** Sufijo del archivo (`card.component.ts`) y, en un componente, de la clase (`CardComponent`). */
  type: string;
}

type OptionName = keyof SchematicOptions;

/** Un archivo generado, relativo a la carpeta destino. */
export interface SchematicFile {
  name: string;
  content: string;
}

/** `className` = nombre del símbolo principal generado (clase, interfaz, enum, o la función/const de guard/resolver). */
export interface GeneratedSchematic {
  kind: SchematicKind;
  className: string;
  /** Sin `.ts`: base del spec (`<fileName>.spec.ts`) y del `import` en el módulo. */
  fileName: string;
  files: SchematicFile[];
}

interface SchematicDefinition {
  /** Las opciones que acepta, como su `schema.json` en Angular 16. */
  options: readonly OptionName[];
  /** Defaults propios — pisan los de `DEFAULTS`. */
  defaults?: Partial<SchematicOptions>;
  /** `projectPrefix`: el `prefix` de `ngjs.json`, para el selector cuando no viene `--prefix`. */
  generate(name: string, options: SchematicOptions, projectPrefix: string | undefined): GeneratedSchematic;
}

const DEFAULTS: SchematicOptions = {
  flat: true,
  skipTests: false,
  skipImport: false,
  export: false,
  style: "css",
  inlineStyle: false,
  inlineTemplate: false,
  displayBlock: false,
  type: "",
};

const OPTION_TYPES: Record<OptionName, "boolean" | "string"> = {
  flat: "boolean",
  skipTests: "boolean",
  skipImport: "boolean",
  module: "string",
  export: "boolean",
  prefix: "string",
  selector: "string",
  style: "string",
  inlineStyle: "boolean",
  inlineTemplate: "boolean",
  displayBlock: "boolean",
  type: "string",
};

/** Diccionario cerrado — sin soporte para schematics de terceros, esto es todo lo que hay. */
const SCHEMATICS: Record<SchematicKind, SchematicDefinition> = {
  component: {
    options: [
      "flat", "skipTests", "skipImport", "module", "export", "prefix", "selector",
      "style", "inlineStyle", "inlineTemplate", "displayBlock", "type",
    ],
    defaults: { flat: false, type: "Component" },
    generate: (name, options, projectPrefix) =>
      ComponentTemplate.from(name, { ...options, prefix: options.prefix ?? projectPrefix }).generated(),
  },
  directive: {
    options: ["flat", "skipTests", "skipImport", "module", "export", "prefix", "selector"],
    generate: (name, options, projectPrefix) =>
      DirectiveTemplate.from(name, { prefix: options.prefix ?? projectPrefix, selector: options.selector }).generated(),
  },
  pipe: {
    options: ["flat", "skipTests", "skipImport", "module", "export"],
    generate: (name) => PipeTemplate.from(name).generated(),
  },
  service: {
    options: ["flat", "skipTests"],
    generate: (name) => ServiceTemplate.from(name).generated(),
  },
  module: {
    options: ["flat", "module"],
    defaults: { flat: false },
    generate: (name) => ModuleTemplate.from(name).generated(),
  },
  class: {
    options: ["skipTests", "type"],
    generate: (name, options) => ClassTemplate.from(name, options.type).generated(),
  },
  interface: {
    options: ["prefix", "type"],
    generate: (name, options) => InterfaceTemplate.from(name, options.prefix ?? "", options.type).generated(),
  },
  enum: {
    options: ["type"],
    generate: (name, options) => EnumTemplate.from(name, options.type).generated(),
  },
  guard: {
    options: ["flat", "skipTests"],
    generate: (name) => GuardTemplate.from(name).generated(),
  },
  resolver: {
    options: ["flat", "skipTests"],
    generate: (name) => ResolverTemplate.from(name).generated(),
  },
  interceptor: {
    options: ["flat", "skipTests"],
    generate: (name) => InterceptorTemplate.from(name).generated(),
  },
};

const ALIASES: Record<string, SchematicKind> = {
  c: "component",
  d: "directive",
  p: "pipe",
  s: "service",
  m: "module",
  cl: "class",
  i: "interface",
  e: "enum",
  g: "guard",
  r: "resolver",
  itc: "interceptor",
};

export interface ResolvedSchematic {
  kind: SchematicKind;
  /**
   * Como Angular: default del schematic < `schematics["@schematics/angular:<kind>"]` de `ngjs.json` < flags. Una
   * opción que el schematic no acepta (o de tipo equivocado) es error — en las flags y en `ngjs.json`.
   */
  options(configured: Record<string, unknown> | undefined, flags: Record<string, unknown>): SchematicOptions;
  generate(name: string, options: SchematicOptions, projectPrefix: string | undefined): GeneratedSchematic;
}

/** Acepta el nombre completo (`component`) o su alias (`c`); `undefined` si no existe. */
export function resolveSchematic(key: string): ResolvedSchematic | undefined {
  const kind = ALIASES[key] ?? (key in SCHEMATICS ? (key as SchematicKind) : undefined);
  if (!kind) return undefined;
  const definition = SCHEMATICS[kind];
  return {
    kind,
    options: (configured, flags) => {
      const options: SchematicOptions = { ...DEFAULTS, ...definition.defaults };
      const layers: [Record<string, unknown>, (name: string) => string][] = [
        [configured ?? {}, (name) => `"${name}" en schematics["@schematics/angular:${kind}"] de ngjs.json`],
        [flags, (name) => `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`],
      ];
      for (const [layer, describe] of layers) {
        for (const [name, value] of Object.entries(layer)) {
          if (value === undefined) continue;
          if (!definition.options.includes(name as OptionName)) {
            throw new Error(`${describe(name)}: el schematic "${kind}" no tiene esa opción.`);
          }
          if (typeof value !== OPTION_TYPES[name as OptionName]) {
            throw new Error(`${describe(name)}: esperaba ${OPTION_TYPES[name as OptionName] === "boolean" ? "true/false" : "un texto"}.`);
          }
          Object.assign(options, { [name]: value });
        }
      }
      if (options.style !== "css" && options.style !== "none") {
        throw new Error(`--style "${options.style}": ngjs solo compila CSS (usá "css" o "none").`);
      }
      return options;
    },
    generate: definition.generate,
  };
}

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parse } from "@swc/core";
import type { ArrayExpression, ModuleItem, Node, ObjectExpression, Span } from "@swc/core";
import type { GeneratedSchematic, SchematicKind } from "@/schematics/schematic-registry.ts";

interface Edit {
  at: number;
  text: string;
}

type NgModuleProperty = "declarations" | "imports";

/**
 * Registra lo recién generado en un `@NgModule` como lo hace el `ng generate` de Angular:
 * los declarables (component/directive/pipe) van a `declarations`, un módulo a `imports`,
 * más el `import { X } from "..."` correspondiente. Solo edita por texto (sin reescribir
 * el archivo), así el formato del usuario queda intacto.
 */
export class ModuleRegistrar {
  private static readonly PROPERTY: Partial<Record<SchematicKind, NgModuleProperty>> = {
    component: "declarations",
    directive: "declarations",
    pipe: "declarations",
    module: "imports",
  };

  /** A qué array del `@NgModule` va cada schematic; `undefined` = no se registra en ningún módulo (service, class, guard, ...). */
  static propertyFor(kind: SchematicKind): NgModuleProperty | undefined {
    return ModuleRegistrar.PROPERTY[kind];
  }

  /**
   * Sube desde `startDir` hasta `sourceRoot` (inclusive) y devuelve el `*.module.ts` de la primera carpeta
   * que tenga uno (los `-routing.module.ts` no cuentan); `undefined` si no hay ninguno en todo el camino.
   * Si una carpeta tiene más de uno es ambiguo — error, como en Angular.
   */
  static async find(startDir: string, sourceRoot: string): Promise<string | undefined> {
    const stop = resolve(sourceRoot);
    let dir = resolve(startDir);

    while (true) {
      const modules = (await ModuleRegistrar.listDir(dir)).filter(
        (file) => file.endsWith(".module.ts") && !file.endsWith("-routing.module.ts"),
      );
      if (modules.length > 1) {
        throw new Error(
          `Hay más de un módulo en "${dir}" (${modules.join(", ")}). Usá --module para elegir uno, o --skip-import para no registrar.`,
        );
      }
      if (modules.length === 1) return join(dir, modules[0]!);

      const parent = dirname(dir);
      if (dir === stop || parent === dir) return undefined;
      dir = parent;
    }
  }

  /**
   * Resuelve `--module <path>` como Angular: relativo a la carpeta destino y, si no, a `sourceRoot`; probando
   * `<path>`, `<path>.ts`, `<path>.module.ts` y `<path>/<basename>.module.ts`.
   */
  static locate(module: string, targetDir: string, sourceRoot: string): string {
    for (const base of [targetDir, sourceRoot]) {
      const path = resolve(base, module);
      const candidates = [path, `${path}.ts`, `${path}.module.ts`, join(path, `${basename(path)}.module.ts`)];
      const found = candidates.find((candidate) => candidate.endsWith(".ts") && existsSync(candidate));
      if (found) return found;
    }
    throw new Error(`No se encontró el módulo "${module}" (ni desde "${targetDir}" ni desde "${sourceRoot}").`);
  }

  static async register(modulePath: string, generated: GeneratedSchematic, dir: string): Promise<void> {
    const property = ModuleRegistrar.propertyFor(generated.kind);
    if (!property) return;

    const code = await readFile(modulePath, "utf8");
    const ast = await parse(code, { syntax: "typescript", decorators: true, target: "es2022" });

    const metadata = ModuleRegistrar.findNgModuleMetadata(ast.body);
    if (!metadata) {
      throw new Error(`"${modulePath}" no tiene un \`@NgModule({...})\` donde registrar.`);
    }

    const edits = [
      ModuleRegistrar.importEdit(code, ast.body, modulePath, generated, dir),
      ModuleRegistrar.arrayEdit(code, metadata, property, generated.className, modulePath),
    ];

    // De atrás para adelante — insertar adelante corre los offsets de los que faltan.
    const result = edits.sort((a, b) => b.at - a.at).reduce((text, { at, text: add }) => text.slice(0, at) + add + text.slice(at), code);
    await writeFile(modulePath, result, "utf8");
  }

  private static async listDir(dir: string): Promise<string[]> {
    try {
      return await readdir(dir);
    } catch {
      // `dir` todavía puede no existir (se crea recién después de buscar el módulo).
      return [];
    }
  }

  /**
   * Índice (de string) donde termina/empieza `node`. Los `Span` de `@swc/core` son offsets en BYTES UTF-8 que
   * arrancan en 1, no índices de string — con un caracter multi-byte antes del nodo, restarle 1 a secas quedaría corrido.
   */
  private static offset(code: string, byteOffset: number): number {
    return Buffer.from(code, "utf8").subarray(0, byteOffset - 1).toString("utf8").length;
  }

  private static end(code: string, node: Node): number {
    return ModuleRegistrar.offset(code, (node as Node & { span: Span }).span.end);
  }

  private static start(code: string, node: Node): number {
    return ModuleRegistrar.offset(code, (node as Node & { span: Span }).span.start);
  }

  /** El objeto literal de `@NgModule({...})` de la primera clase decorada con él. */
  private static findNgModuleMetadata(body: ModuleItem[]): ObjectExpression | undefined {
    for (const item of body) {
      const cls = item.type === "ExportDeclaration" ? item.declaration : item;
      if (cls.type !== "ClassDeclaration") continue;

      for (const { expression } of cls.decorators ?? []) {
        if (expression.type !== "CallExpression") continue;
        if (expression.callee.type !== "Identifier" || expression.callee.value !== "NgModule") continue;

        const metadata = expression.arguments[0]?.expression;
        if (metadata?.type === "ObjectExpression") return metadata;
      }
    }
    return undefined;
  }

  private static findArray(metadata: ObjectExpression, property: NgModuleProperty): ArrayExpression | "missing" | undefined {
    for (const prop of metadata.properties) {
      if (prop.type !== "KeyValueProperty" || prop.key.type !== "Identifier" || prop.key.value !== property) continue;
      return prop.value.type === "ArrayExpression" ? prop.value : undefined;
    }
    return "missing";
  }

  private static arrayEdit(code: string, metadata: ObjectExpression, property: NgModuleProperty, className: string, modulePath: string): Edit {
    const array = ModuleRegistrar.findArray(metadata, property);

    // Sin la propiedad: se agrega al principio del objeto (`@NgModule({})` incluido).
    if (array === "missing") {
      const text = metadata.properties.length ? `\n  ${property}: [${className}],` : `\n  ${property}: [${className}],\n`;
      return { at: ModuleRegistrar.start(code, metadata) + 1, text };
    }
    if (!array) {
      throw new Error(`"${modulePath}": \`${property}\` no es un array literal, no se puede registrar "${className}" automáticamente.`);
    }

    // Después del último elemento (no antes del `]`) — así una coma final (`[A,\n]`) no queda duplicada.
    const last = array.elements.at(-1);
    return last
      ? { at: ModuleRegistrar.end(code, last.expression), text: `, ${className}` }
      : { at: ModuleRegistrar.end(code, array) - 1, text: className };
  }

  private static importEdit(code: string, body: ModuleItem[], modulePath: string, generated: GeneratedSchematic, dir: string): Edit {
    let specifier = relative(dirname(modulePath), join(dir, generated.fileName)).split(sep).join("/");
    if (!specifier.startsWith(".")) specifier = `./${specifier}`;
    const statement = `import { ${generated.className} } from "${specifier}";`;

    const lastImport = body.filter((item) => item.type === "ImportDeclaration").at(-1);
    return lastImport ? { at: ModuleRegistrar.end(code, lastImport), text: `\n${statement}` } : { at: 0, text: `${statement}\n` };
  }
}

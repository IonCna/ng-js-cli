import { statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parse } from "@swc/core";
import type { ArrayExpression, ModuleItem, Node, ObjectExpression, Span } from "@swc/core";
import type { GeneratedSchematic, SchematicKind } from "@/schematics/schematic-registry.ts";

interface Edit {
  at: number;
  text: string;
}

type NgModuleProperty = "declarations" | "imports" | "exports";

/**
 * Registra lo recién generado en un `@NgModule` como lo hace el `ng generate` de Angular:
 * los declarables (component/directive/pipe) van a `declarations`, un módulo a `imports`,
 * más el `import { X } from "..."` correspondiente (y a `exports` con `--export`). Solo edita por texto (sin reescribir
 * el archivo), así el formato del usuario queda intacto.
 */
export class ModuleRegistrar {
  private static readonly PROPERTY: Partial<Record<SchematicKind, "declarations" | "imports">> = {
    component: "declarations",
    directive: "declarations",
    pipe: "declarations",
    module: "imports",
  };

  /** A qué array del `@NgModule` va cada schematic; `undefined` = no se registra en ningún módulo (service, class, guard, ...). */
  static propertyFor(kind: SchematicKind): "declarations" | "imports" | undefined {
    return ModuleRegistrar.PROPERTY[kind];
  }

  /**
   * `findModule` de Angular: sube desde `startDir` hasta `stopDir` (inclusive; la raíz del proyecto) y devuelve el `*.module.ts` de la primera carpeta
   * que tenga uno (los `-routing.module.ts` no cuentan); `undefined` si no hay ninguno en todo el camino.
   * Si una carpeta tiene más de uno es ambiguo — error, como en Angular.
   */
  static async find(startDir: string, stopDir: string): Promise<string | undefined> {
    const stop = resolve(stopDir);
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
   * `findModuleFromOptions` de Angular para `--module <path>`: se prueba en cada carpeta desde `<basePath>/<module>`
   * y desde `<basePath>/<name>` hacia arriba (hasta `stopDir`), de la más profunda a la menos: `<carpeta>` (si es un
   * archivo), `<carpeta>/<m>.ts` y `<carpeta>/<m>.module.ts`, con `m` el último segmento de `--module`.
   */
  static locate(module: string, basePath: string, name: string, stopDir: string): string {
    const stop = resolve(stopDir);
    const modulePath = resolve(basePath, module);
    const moduleBaseName = basename(modulePath);
    const candidates = new Set([resolve(basePath)]);
    for (const start of [modulePath, resolve(basePath, name)]) {
      for (let dir = start; ; dir = dirname(dir)) {
        candidates.add(dir);
        if (dir === stop || dirname(dir) === dir) break;
      }
    }
    const dirs = [...candidates].sort((a, b) => b.length - a.length);
    for (const dir of dirs) {
      for (const candidate of [dir, join(dir, `${moduleBaseName}.ts`), join(dir, `${moduleBaseName}.module.ts`)]) {
        if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
      }
    }
    throw new Error(`No existe el módulo "${module}". Se buscó en:\n    ${dirs.join("\n    ")}`);
  }

  /** El módulo con `generated` registrado — no lo escribe (lo hace `generate`, salvo `--dry-run`). */
  static async register(modulePath: string, generated: GeneratedSchematic, dir: string, { exported = false } = {}): Promise<string> {
    const property = ModuleRegistrar.propertyFor(generated.kind);
    if (!property) throw new Error(`"${generated.kind}" no se registra en un @NgModule.`);

    const code = await readFile(modulePath, "utf8");
    const ast = await parse(code, { syntax: "typescript", decorators: true, target: "es2022" });

    const metadata = ModuleRegistrar.findNgModuleMetadata(ast.body);
    if (!metadata) {
      throw new Error(`"${modulePath}" no tiene un \`@NgModule({...})\` donde registrar.`);
    }

    const edits = [
      ModuleRegistrar.importEdit(code, ast.body, modulePath, generated, dir),
      ModuleRegistrar.arrayEdit(code, metadata, property, generated.className, modulePath),
      ...(exported ? [ModuleRegistrar.arrayEdit(code, metadata, "exports", generated.className, modulePath)] : []),
    ];

    // De atrás para adelante — insertar adelante corre los offsets de los que faltan.
    return edits.sort((a, b) => b.at - a.at).reduce((text, { at, text: add }) => text.slice(0, at) + add + text.slice(at), code);
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

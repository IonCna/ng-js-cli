import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parse } from "@swc/core";
import type { CallExpression, ClassMember, Expression, ModuleItem, Span } from "@swc/core";
import type { GeneratedSchematic, SchematicKind } from "@/schematics/schematic-registry.ts";

interface Edit {
  at: number;
  text: string;
}

/**
 * Registra lo recién generado en el módulo más cercano: un `.module.ts` con la
 * forma que emite `ModuleTemplate` (`static ɵmod = angular.module(X.$name, [])`),
 * al que se le encadena la llamada de registro de AngularJS —
 * `.component(...)`, `.directive(...)`, `.filter(...)`, `.service(...)` — o, si
 * lo generado es otro módulo, se agrega a `requires`. Solo edita por texto (sin
 * reescribir el archivo), así el formato del usuario queda intacto.
 */
export class ModuleRegistrar {
  private static readonly CHAIN_CALL: Record<Exclude<SchematicKind, "module">, (className: string) => string> = {
    component: (c) => `.component(${c}.$name, ${c}.ɵcmp)`,
    directive: (c) => `.directive(${c}.$name, () => ${c}.ɵdir)`,
    pipe: (c) => `.filter(${c}.$name, ${c}.transform)`,
    service: (c) => `.service(${c}.$name, ${c})`,
  };

  /** Sube desde `startDir` hasta `sourceRoot` (inclusive) y devuelve el primer `*.module.ts`; `undefined` si no hay ninguno en todo el camino. */
  static async find(startDir: string, sourceRoot: string): Promise<string | undefined> {
    const stop = resolve(sourceRoot);
    let dir = resolve(startDir);

    while (true) {
      const found = (await ModuleRegistrar.listDir(dir)).filter((file) => file.endsWith(".module.ts")).sort()[0];
      if (found) return join(dir, found);

      const parent = dirname(dir);
      if (dir === stop || parent === dir) return undefined;
      dir = parent;
    }
  }

  static async register(modulePath: string, generated: GeneratedSchematic, dir: string): Promise<void> {
    const code = await readFile(modulePath, "utf8");
    const ast = await parse(code, { syntax: "typescript", decorators: true, target: "es2022" });

    const moduleExpression = ModuleRegistrar.findModuleExpression(ast.body);
    if (!moduleExpression) {
      throw new Error(`"${modulePath}" no tiene un \`static ɵmod = angular.module(...)\` donde registrar.`);
    }

    const edits: Edit[] = [ModuleRegistrar.importEdit(code, ast.body, modulePath, generated, dir)];
    edits.push(
      generated.kind === "module"
        ? ModuleRegistrar.requiresEdit(code, moduleExpression, generated.className, modulePath)
        : { at: ModuleRegistrar.end(code, moduleExpression), text: `\n    ${ModuleRegistrar.CHAIN_CALL[generated.kind](generated.className)}` },
    );

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
   * Índice (de string) donde termina `node`. Los `Span` de `@swc/core` son offsets en BYTES UTF-8 que
   * arrancan en 1, no índices de string — con un `ɵ` (2 bytes) antes del nodo, restarle 1 a secas
   * quedaría corrido.
   */
  private static end(code: string, node: Expression | ModuleItem): number {
    // `Expression` incluye variantes JSX sin `span` en los tipos — ninguna llega acá (el parser es `typescript`, no `tsx`).
    const byteEnd = (node as { span: Span }).span.end - 1;
    return Buffer.from(code, "utf8").subarray(0, byteEnd).toString("utf8").length;
  }

  private static findModuleExpression(body: ModuleItem[]): Expression | undefined {
    for (const item of body) {
      const cls = item.type === "ExportDeclaration" ? item.declaration : item;
      if (cls.type !== "ClassDeclaration") continue;

      for (const member of cls.body) {
        if (ModuleRegistrar.isModuleProperty(member) && member.value) return member.value;
      }
    }
    return undefined;
  }

  private static isModuleProperty(member: ClassMember): member is ClassMember & { type: "ClassProperty" } {
    return member.type === "ClassProperty" && member.key.type === "Identifier" && member.key.value === "ɵmod";
  }

  /** `angular.module(X.$name, [...])` es la llamada más interna de la cadena (`.component(...)` y demás cuelgan de ella). */
  private static innermostModuleCall(expression: Expression): CallExpression | undefined {
    let current = expression;
    while (current.type === "CallExpression") {
      const { callee } = current;
      if (callee.type !== "MemberExpression") return undefined;
      if (callee.property.type === "Identifier" && callee.property.value === "module") return current;
      current = callee.object;
    }
    return undefined;
  }

  private static requiresEdit(code: string, expression: Expression, className: string, modulePath: string): Edit {
    const requires = ModuleRegistrar.innermostModuleCall(expression)?.arguments[1]?.expression;
    if (requires?.type !== "ArrayExpression") {
      throw new Error(`"${modulePath}" no tiene el array \`requires\` en \`angular.module(..., [])\`.`);
    }

    const separator = requires.elements.length ? ", " : "";
    return { at: ModuleRegistrar.end(code, requires) - 1, text: `${separator}${className}.$name` };
  }

  private static importEdit(code: string, body: ModuleItem[], modulePath: string, generated: GeneratedSchematic, dir: string): Edit {
    let specifier = relative(dirname(modulePath), join(dir, generated.fileName)).split(sep).join("/");
    if (!specifier.startsWith(".")) specifier = `./${specifier}`;
    const statement = `import { ${generated.className} } from "${specifier}";`;

    const lastImport = body.filter((item) => item.type === "ImportDeclaration").at(-1);
    return lastImport ? { at: ModuleRegistrar.end(code, lastImport), text: `\n${statement}` } : { at: 0, text: `${statement}\n` };
  }
}

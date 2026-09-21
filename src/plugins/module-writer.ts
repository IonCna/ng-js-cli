import type { NgModuleMetadata } from "@/metadata/decorator-metadata.ts";
import { MetadataStore } from "@/metadata/metadata-store.ts";
import { HashId } from "@/plugins/hash-id.ts";
import type { NgjsTransform } from "@/plugins/ngjs-transform.ts";

/**
 * Fase 3: lee `NgModuleMetadata` (`@NgModule({ declarations, imports, ... })`)
 * y estampa `ɵmod` con la MISMA forma que `stampNgModuleDef` (`ngjs-core/core`)
 * — `id`/`declarations`/`imports`/`providers`/`bootstrap`/`controllerAs`, más
 * `$name = id` (así un `@NgModule` importado por otro se resuelve igual que
 * si el decorador hubiera corrido).
 *
 * NO registra nada en `angular.module(...)` acá — eso lo sigue haciendo
 * `ngjs-core/runtime` (`registerNgModule`, llamado por `bootstrapApplication`
 * o a mano), que ya resuelve `imports` sea clase (`ɵmod`), `angular.IModule`
 * o nombre de módulo string, y sabe caminar `declarations`/`providers` con
 * toda la fidelidad del motor (lifecycle bridges, DI jerárquica, pipes,
 * `multi`, etc.) — reimplementar ese registro a mano acá (como hacía antes
 * este archivo) significaba perder todo eso. El único trabajo que le
 * corresponde al CLI es dejar el dato estampado; leerlo e interpretarlo es
 * responsabilidad de `ngjs-core`, sea con decorador o sin él.
 *
 * El `id` sale de `HashId` (mismo hash de `path:className` que usa
 * `DecoratorWriter` para `$name` de un `@Injectable` sin `id`) — determinista
 * por archivo+clase, sin necesitar el contador en runtime de
 * `ModuleNameRegistry` (que resuelve colisiones por orden de ejecución, algo
 * que en build time no hace falta: cada clase ya es única por origen).
 */
export class ModuleWriter {
  static write(code: string, path: string): string | undefined {
    const modules = MetadataStore.get(path).filter(
      (metadata): metadata is NgModuleMetadata => metadata.kind === "ngmodule",
    );
    if (!modules.length) return undefined;

    const statements = modules.map((metadata) => ModuleWriter.moduleStatement(metadata, path));
    return `${code}\n${statements.join("\n")}\n`;
  }

  private static moduleStatement(metadata: NgModuleMetadata, path: string): string {
    const id = HashId.readable(metadata.className, path);

    // Los 4 arrays van sin comillas (referencias reales a clase/módulo, como
    // `providers` de `@Component`) — se emiten a mano en vez de con
    // `JSON.stringify`, que rompería las referencias.
    const fields = [
      `id: ${JSON.stringify(id)}`,
      `declarations: [${metadata.declarations.join(", ")}]`,
      `imports: [${metadata.imports.join(", ")}]`,
      `providers: [${metadata.providers.join(", ")}]`,
      `bootstrap: [${metadata.bootstrap.join(", ")}]`,
    ];
    if (metadata.controllerAs) fields.push(`controllerAs: ${JSON.stringify(metadata.controllerAs)}`);

    return [
      `${metadata.className}.ɵmod = { ${fields.join(", ")} };`,
      `${metadata.className}.$name = ${JSON.stringify(id)};`,
    ].join("\n");
  }
}

export const moduleWriterTransform: NgjsTransform = {
  transform: (code, path) => Promise.resolve(ModuleWriter.write(code, path)),
};

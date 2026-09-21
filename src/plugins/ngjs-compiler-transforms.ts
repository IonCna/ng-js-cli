import { decoratorMetadataTransform } from "@/plugins/decorator-metadata-transform.ts";
import { decoratorReaderTransform } from "@/plugins/decorator-reader.ts";
import { decoratorWriterTransform } from "@/plugins/decorator-writer.ts";
import { moduleWriterTransform } from "@/plugins/module-writer.ts";
import type { NgjsTransform } from "@/plugins/ngjs-transform.ts";

/**
 * La cadena de compilación de decoradores (`@Component`/`@Directive`/`@NgModule`
 * → `ɵcmp`/`ɵdir` → registración en AngularJS → metadata de SWC), compartida
 * entre `build` (esbuild, vía `pluginLoader`) y `serve` (Vite, vía
 * `viteTransformPlugin`) — un solo lugar, no dos listas que se puedan
 * desincronizar. El template scoping NO va acá: `build` lo resuelve inline
 * (`templateTransform`), `serve` lo resuelve distinto (`ngJsTemplateParser`
 * de `ng-js-vite`, sirviendo el template por separado) — no es compartible.
 */
export const NGJS_COMPILER_TRANSFORMS: NgjsTransform[] = [
  decoratorReaderTransform,
  decoratorWriterTransform,
  moduleWriterTransform,
  decoratorMetadataTransform,
];

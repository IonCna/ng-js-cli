/**
 * `ng-js-cli/contract` — el contrato del código que produce `ngjs build`/`ngjs serve`: lo que se estampa en cada
 * clase (`ɵfac`, `ɵprov`, `ɵcmp`/`ɵdir`, `ɵpipe`, `ɵmod`), los nombres de DI y las claves que usa, y los globales
 * que deja (`ɵngjsPlatform`, …). Solo tipos, para el runtime que lo consume: se importa desde acá, sin depender
 * de cómo se produce.
 *
 *   import type { CompiledClass, DirectiveDef } from "ng-js-cli/contract";
 *
 * Importarlo (aunque sea un tipo) también declara los globales en `globalThis`.
 */
export type * from "ng-js-compiler/contract";

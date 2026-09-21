/**
 * Base de todo comando (`BuildCommand`, `ServeCommand`, ...). No lee nada
 * — eso lo resuelve el `Config` correspondiente (`BuildConfig.create()`, ...)
 * ANTES de llegar acá.
 *
 * El constructor es `protected`, no `private`: cada subclase escribe su
 * propio `static from(config)` de una línea (`return new BuildCommand(config)`)
 * — como ESE `new` vive dentro de la propia clase, `protected` alcanza para
 * bloquear `new BuildCommand(...)` desde afuera sin pelearse con TS (un
 * `from()` genérico heredado con `this: new (...) => T`, llamado desde una
 * función suelta como `runBuildCommand`, no tipa con `private`/`protected` —
 * TS exige ahí un constructor "públicamente construible").
 */
export abstract class NgjsCommand<C> {
  protected constructor(protected readonly config: C) {}

  abstract run(): Promise<void>;
}

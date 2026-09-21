/**
 * Lo que arma el plugin de lectura (`DecoratorReader`, todavía sin construir)
 * y consume el de codegen — un tipo por decorador, discriminados por `kind`.
 * Solo se CONSTRUYE la lectura de `@Component` primero, pero el tipo ya
 * contempla los demás decoradores que `ngjs-core` soporta.
 */
/**
 * `@Inject(SomeClass)`/tipo inferido → `identifier` (referencia real a la
 * clase — se emite tal cual en el `$inject` generado, y la resuelve
 * `ReflectInjection.translate`/`getInjectableId` en runtime, igual que si
 * viniera de `design:paramtypes`; nunca se adivina un string en build time).
 * `@Inject('$http')` → `literal` (servicio nativo de AngularJS, el string YA
 * es el nombre real, se usa tal cual).
 */
export type ConstructorToken = { kind: "identifier" | "literal"; value: string } | null;

interface BaseMetadata {
  className: string;
  options: Record<string, unknown>;
  /**
   * Un token por parámetro del constructor, en orden — de `@Inject(Token)` si
   * lo tiene, si no de la anotación de tipo (`constructor(private http: HttpClient)`,
   * sin decorador — como en Angular real). `null` = no se pudo resolver
   * ninguno de los dos (posición se conserva igual, `$inject` es posicional).
   */
  constructorTokens: ConstructorToken[];
}

export interface BindingsMetadata {
  inputs: { propName: string; bindingName: string }[];
  outputs: { propName: string; bindingName: string }[];
  hostBindings: { propName: string; hostProperty: string }[];
  hostListeners: { methodName: string; eventName: string }[];
  /**
   * `providers: [SomeService]` — identificadores, no evaluados (igual que
   * `declarations`/`imports` de `@NgModule`). Solo se guarda el dato; el
   * caminado jerárquico que los CONSUME es runtime (depende del árbol de
   * componentes en vivo, no existe en build time — ni siquiera Angular real
   * lo resuelve en build time). Acá no se camina nada, solo se deja servido.
   */
  providers: string[];
}

export interface ComponentMetadata extends BaseMetadata, BindingsMetadata {
  kind: "component";
}

export interface DirectiveMetadata extends BaseMetadata, BindingsMetadata {
  kind: "directive";
}

export interface PipeMetadata extends BaseMetadata {
  kind: "pipe";
}

export interface ServiceMetadata extends BaseMetadata {
  kind: "service" | "injectable";
}

/**
 * `declarations`/`imports`/`bootstrap` de `@NgModule` son ARRAYS DE
 * IDENTIFICADORES (`[CardComponent]`), no literales — por eso van como
 * `string[]` (el nombre tal cual aparece en el código, ya importado en ese
 * archivo), no evaluados como el resto de `options`.
 *
 * Sin `id`: el `id` real de `angular.module(...)` sale de un hash (`HashId`,
 * en `ModuleWriter`) — nadie necesita saberlo de antemano, `bootstrapApplication`
 * bootstrapea por CLASE, y `ngjs-core/runtime` resuelve un import de otro
 * `@NgModule` leyendo `OtroModulo.ɵmod.id` en runtime, no adivinando un string.
 */
export interface NgModuleMetadata {
  kind: "ngmodule";
  className: string;
  declarations: string[];
  imports: string[];
  providers: string[];
  bootstrap: string[];
  controllerAs?: string;
}

export type DecoratorMetadata = ComponentMetadata | DirectiveMetadata | PipeMetadata | ServiceMetadata | NgModuleMetadata;

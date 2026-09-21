import type {
  ComponentMetadata,
  ConstructorToken,
  DecoratorMetadata,
  DirectiveMetadata,
  NgModuleMetadata,
} from "@/metadata/decorator-metadata.ts";
import { MetadataStore } from "@/metadata/metadata-store.ts";
import { HashId } from "@/plugins/hash-id.ts";
import type { NgjsTransform } from "@/plugins/ngjs-transform.ts";

type BindingsCarrier = ComponentMetadata | DirectiveMetadata;
type WritableMetadata = Exclude<DecoratorMetadata, NgModuleMetadata>;

/**
 * Fase 2: lee lo que guardó `DecoratorReader` en `MetadataStore` y escribe,
 * directo en el código, la MISMA forma que estampan `stampComponentDef`/
 * `stampDirectiveDef`/`stampInjectableName` de `ngjs-core` — así
 * `ngjs-core/runtime` (que lee `ɵcmp`/`ɵdir`/`$name`/`$inject` sin preguntar
 * quién los puso ahí) no distingue si vino de un decorador o de acá:
 * - `ClassName.ɵcmp`/`ClassName.ɵdir` — el resto de `options` de
 *   `@Component`/`@Directive` tal cual, más `inputs`/`outputs` (arrays, no
 *   mapas) y `host: { bindings, listeners }` (anidado, como `HostDef` —
 *   `host-binding-bridge.ts`/`host-listener-bridge.ts` leen ahí, no en un
 *   campo top-level).
 * - `ClassName.ɵpipe` — `{ name, pure? }`, tal cual `PipeDef`.
 * - `ClassName.$name` — identidad DI de un `@Injectable`/`@Service` sin
 *   selector (los `@Component`/`@Directive` la resuelven solos en
 *   `registerDeclaration`, desde el selector — no hace falta acá). Con
 *   `id` explícito se respeta tal cual; si no, un nombre legible y único
 *   por archivo+clase (`HashId`), y solo si no hay ya un `$name` propio
 *   (clase AngularJS nativa escrita a mano).
 * - `ClassName.$inject` — un token por posición del constructor: la
 *   REFERENCIA a la clase tal cual (no un string precalculado — se resuelve
 *   con `ReflectInjection.translate`/`getInjectableId` en runtime, igual que
 *   si viniera de `design:paramtypes`) o el string literal de `@Inject('...')`.
 *
 * Todo lo demás (registrar en AngularJS, walkear providers, etc.) es trabajo
 * de `ModuleWriter`/`ngjs-core/runtime` al leer estos campos, no de acá —
 * este writer solo entrega el dato, no interpreta nada.
 */
export class DecoratorWriter {
  private static readonly FIELD_BY_KIND: Partial<Record<WritableMetadata["kind"], string>> = {
    component: "ɵcmp",
    directive: "ɵdir",
  };

  static write(code: string, path: string): string | undefined {
    const statements = MetadataStore.get(path)
      .filter((metadata): metadata is WritableMetadata => metadata.kind !== "ngmodule")
      .flatMap((metadata) => DecoratorWriter.statementsFor(metadata, path));

    return statements.length ? `${code}\n${statements.join("\n")}\n` : undefined;
  }

  private static statementsFor(metadata: WritableMetadata, path: string): string[] {
    const statements: string[] = [];

    const field = DecoratorWriter.FIELD_BY_KIND[metadata.kind];
    if (field) {
      statements.push(DecoratorWriter.bindingsStatement(metadata as BindingsCarrier, field));
    } else if (metadata.kind === "pipe") {
      statements.push(DecoratorWriter.pipeStatement(metadata));
    } else {
      statements.push(DecoratorWriter.injectableNameStatement(metadata, path));
    }

    const inject = DecoratorWriter.injectStatement(metadata);
    if (inject) statements.push(inject);

    return statements;
  }

  /**
   * El resto de `options` de `@Component`/`@Directive` (`template`,
   * `templateUrl`, `transclude`, `controllerAs`, `exportAs`, ...) viaja tal
   * cual — salvo `providers`, que `literalValue` no puede resolver (son
   * identificadores, no literales) y por eso `DecoratorReader` lo guarda
   * aparte, en `metadata.providers`.
   */
  private static bindingsStatement(metadata: BindingsCarrier, field: string): string {
    const { providers: _ignored, ...restOptions } = metadata.options as Record<string, unknown> & {
      providers?: unknown;
    };

    const def: Record<string, unknown> = {
      ...restOptions,
      inputs: metadata.inputs,
      outputs: metadata.outputs,
    };
    if (metadata.hostBindings.length || metadata.hostListeners.length) {
      def.host = { bindings: metadata.hostBindings, listeners: metadata.hostListeners };
    }

    const fields = Object.entries(def)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(", ");

    // `providers` va sin comillas (referencias reales a clase) — solo el DATO
    // se deja servido acá; quién camina esto en runtime (y decide qué
    // instancia le toca a qué rama del árbol) no es cosa nuestra, ver nota de
    // `BindingsMetadata.providers`.
    const providers = metadata.providers.length ? `, providers: [${metadata.providers.join(", ")}]` : "";

    return `${metadata.className}.${field} = { ${fields}${providers} };`;
  }

  private static pipeStatement(metadata: WritableMetadata): string {
    const { name, pure } = metadata.options as { name?: string; pure?: boolean };
    const fields = [`name: ${JSON.stringify(name)}`];
    if (pure !== undefined) fields.push(`pure: ${JSON.stringify(pure)}`);
    return `${metadata.className}.ɵpipe = { ${fields.join(", ")} };`;
  }

  /**
   * `@Injectable({ id: "..." })` manda tal cual, siempre (como
   * `stampInjectableName`). Sin `id`, un nombre legible y único (archivo +
   * clase, vía `HashId` — no hace falta el contador en runtime de
   * `deriveInjectableName`, acá cada clase ya es única por origen), pero
   * respetando un `$name` propio si la clase ya lo declaró a mano (clase
   * AngularJS nativa).
   */
  private static injectableNameStatement(metadata: WritableMetadata, path: string): string {
    const { id } = metadata.options as { id?: string };
    if (id) return `${metadata.className}.$name = ${JSON.stringify(id)};`;

    const name = HashId.readable(metadata.className, path);
    return `if (!Object.hasOwn(${metadata.className}, "$name")) { ${metadata.className}.$name = ${JSON.stringify(name)}; }`;
  }

  /** `null` = ese parámetro no se pudo resolver — se emite `null` tal cual, nunca se filtra (rompería las posiciones). */
  private static injectStatement(metadata: WritableMetadata): string | undefined {
    if (!metadata.constructorTokens.length) return undefined;

    const tokens = metadata.constructorTokens.map((token) => DecoratorWriter.tokenExpression(token));
    return `${metadata.className}.$inject = [${tokens.join(", ")}];`;
  }

  private static tokenExpression(token: ConstructorToken): string {
    if (!token) return "null";
    return token.kind === "literal" ? JSON.stringify(token.value) : token.value;
  }
}

export const decoratorWriterTransform: NgjsTransform = {
  transform: (code, path) => Promise.resolve(DecoratorWriter.write(code, path)),
};

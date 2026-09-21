import { parse } from "@swc/core";
import type {
  ArrayExpression,
  BindingIdentifier,
  BooleanLiteral,
  ClassDeclaration,
  ClassMember,
  Decorator,
  Expression,
  ModuleItem,
  NumericLiteral,
  ObjectExpression,
  Param,
  Pattern,
  PropertyName,
  Span,
  StringLiteral,
  TsParameterProperty,
} from "@swc/core";
import type { BindingsMetadata, ConstructorToken, DecoratorMetadata } from "@/metadata/decorator-metadata.ts";
import { MetadataStore } from "@/metadata/metadata-store.ts";
import type { NgjsTransform } from "@/plugins/ngjs-transform.ts";

const CLASS_DECORATOR_KIND: Record<string, DecoratorMetadata["kind"]> = {
  Component: "component",
  Directive: "directive",
  Pipe: "pipe",
  Service: "service",
  Injectable: "injectable",
  NgModule: "ngmodule",
};

/**
 * Fase 1 del pipeline de compilación: parsea (vía `@swc/core`, el mismo AST
 * que ya usa el resto del CLI), GUARDA en `MetadataStore`, y SACA del código
 * cada decorador que ya leyó (`@Component`/`@Input`/`@Inject`/etc.) — el
 * punto es que ese trabajo deje de correr en `ngjs-core` en runtime, no que
 * conviva al lado. Lo que no reconoce (un decorador de otra librería) lo deja
 * intacto.
 */
export class DecoratorReader {
  private static readonly PROPERTY_BINDING_HANDLERS: Record<
    string,
    (bindings: BindingsMetadata, propName: string, override: string) => void
  > = {
    Input: (bindings, propName, bindingName) => bindings.inputs.push({ propName, bindingName }),
    Output: (bindings, propName, bindingName) => bindings.outputs.push({ propName, bindingName }),
    HostBinding: (bindings, propName, hostProperty) => bindings.hostBindings.push({ propName, hostProperty }),
  };

  private static readonly LITERAL_READERS: Record<string, (expr: Expression) => unknown> = {
    StringLiteral: (expr) => (expr as StringLiteral).value,
    NumericLiteral: (expr) => (expr as NumericLiteral).value,
    BooleanLiteral: (expr) => (expr as BooleanLiteral).value,
    NullLiteral: () => null,
    ArrayExpression: (expr) =>
      (expr as ArrayExpression).elements.map((el) => (el ? DecoratorReader.literalValue(el.expression) : undefined)),
    ObjectExpression: (expr) => DecoratorReader.objectLiteralValue(expr as ObjectExpression),
  };

  static async read(code: string, path: string): Promise<string | undefined> {
    if (!/@(Component|Directive|Pipe|Service|Injectable|NgModule)\s*\(/.test(code)) return undefined;

    const ast = await parse(code, { syntax: "typescript", decorators: true, target: "es2022" });

    const metadata: DecoratorMetadata[] = [];
    const stripSpans: Span[] = [];
    for (const item of ast.body) {
      const cls = DecoratorReader.unwrapClassDeclaration(item);
      const found = cls && DecoratorReader.readClassMetadata(cls, stripSpans);
      if (found) metadata.push(found);
    }

    if (!metadata.length) return undefined;

    MetadataStore.set(path, metadata);
    return DecoratorReader.stripSpans(code, stripSpans);
  }

  /**
   * Saca cada span de atrás para adelante — de adelante para atrás correr un
   * splice invalidaría los offsets de los que faltan. `-1` en start/end:
   * `Span` de `@swc/core` arranca en `BytePos(1)`, no en 0 — confirmado con
   * un parse de prueba (`code.slice(span.start, span.end)` corta un
   * caracter de más al final y pierde el `@` al principio sin el ajuste).
   */
  private static stripSpans(code: string, spans: Span[]): string {
    const sorted = [...spans].sort((a, b) => b.start - a.start);
    return sorted.reduce((result, span) => result.slice(0, span.start - 1) + result.slice(span.end - 1), code);
  }

  private static unwrapClassDeclaration(item: ModuleItem): ClassDeclaration | undefined {
    if (item.type === "ClassDeclaration") return item;
    if (item.type === "ExportDeclaration" && item.declaration.type === "ClassDeclaration") return item.declaration;
    return undefined;
  }

  private static readClassMetadata(cls: ClassDeclaration, stripSpans: Span[]): DecoratorMetadata | undefined {
    for (const decorator of cls.decorators ?? []) {
      const decoratorName = DecoratorReader.decoratorCallName(decorator);
      const kind = decoratorName ? CLASS_DECORATOR_KIND[decoratorName] : undefined;
      if (!kind) continue;

      stripSpans.push(decorator.span);
      const className = cls.identifier.value;

      const argExpr = DecoratorReader.decoratorFirstArgExpression(decorator);
      const objExpr = argExpr?.type === "ObjectExpression" ? argExpr : undefined;

      if (kind === "ngmodule") {
        return {
          kind,
          className,
          declarations: DecoratorReader.identifierArray(objExpr, "declarations"),
          imports: DecoratorReader.identifierArray(objExpr, "imports"),
          providers: DecoratorReader.identifierArray(objExpr, "providers"),
          bootstrap: DecoratorReader.identifierArray(objExpr, "bootstrap"),
          controllerAs: DecoratorReader.stringProp(objExpr, "controllerAs"),
        };
      }

      const options = DecoratorReader.decoratorFirstArgObject(decorator);
      const constructorTokens = DecoratorReader.readConstructorTokens(cls.body, stripSpans);

      if (kind === "component" || kind === "directive") {
        return {
          kind,
          className,
          options,
          constructorTokens,
          ...DecoratorReader.readBindings(cls.body, stripSpans),
          providers: DecoratorReader.identifierArray(objExpr, "providers"),
        };
      }

      return { kind, className, options, constructorTokens };
    }
    return undefined;
  }

  private static decoratorFirstArgExpression(decorator: Decorator): Expression | undefined {
    const expr = decorator.expression;
    return expr.type === "CallExpression" ? expr.arguments[0]?.expression : undefined;
  }

  /** `controllerAs: "ctrl"` — string literal simple, mismo criterio que el resto de `options`. */
  private static stringProp(objExpr: ObjectExpression | undefined, key: string): string | undefined {
    if (!objExpr) return undefined;
    for (const prop of objExpr.properties) {
      if (prop.type !== "KeyValueProperty" || DecoratorReader.propName(prop.key) !== key) continue;
      return prop.value.type === "StringLiteral" ? prop.value.value : undefined;
    }
    return undefined;
  }

  /** `declarations: [CardComponent]` — identificadores, no literales; `literalValue` no los resuelve a propósito. */
  private static identifierArray(objExpr: ObjectExpression | undefined, key: string): string[] {
    if (!objExpr) return [];

    for (const prop of objExpr.properties) {
      if (prop.type !== "KeyValueProperty" || DecoratorReader.propName(prop.key) !== key) continue;
      if (prop.value.type !== "ArrayExpression") return [];

      return prop.value.elements
        .map((el) => (el?.expression.type === "Identifier" ? el.expression.value : undefined))
        .filter((value): value is string => Boolean(value));
    }

    return [];
  }

  private static readBindings(members: ClassMember[], stripSpans: Span[]): BindingsMetadata {
    const bindings: BindingsMetadata = { inputs: [], outputs: [], hostBindings: [], hostListeners: [], providers: [] };

    for (const member of members) {
      if (member.type === "ClassProperty") {
        const name = DecoratorReader.propName(member.key);
        if (!name) continue;

        for (const decorator of member.decorators ?? []) {
          const args = DecoratorReader.decoratorArgs(decorator);
          const override = typeof args[0] === "string" ? args[0] : name;
          const decoratorName = DecoratorReader.decoratorCallName(decorator);
          const handler = decoratorName ? DecoratorReader.PROPERTY_BINDING_HANDLERS[decoratorName] : undefined;
          if (!handler) continue;
          handler(bindings, name, override);
          stripSpans.push(decorator.span);
        }
      }

      if (member.type === "ClassMethod") {
        const name = DecoratorReader.propName(member.key);
        if (!name) continue;

        for (const decorator of member.function.decorators ?? []) {
          if (DecoratorReader.decoratorCallName(decorator) !== "HostListener") continue;
          const [eventName] = DecoratorReader.decoratorArgs(decorator);
          bindings.hostListeners.push({ methodName: name, eventName: typeof eventName === "string" ? eventName : "" });
          stripSpans.push(decorator.span);
        }
      }
    }

    return bindings;
  }

  /**
   * Un token por parámetro, en orden — `@Inject(Token)` si está, si no la
   * anotación de tipo (`constructor(private http: HttpClient)`, sin
   * decorador, como en Angular real). `$inject` es POSICIONAL — un token
   * no resuelto queda `null`, nunca se filtra (rompería las posiciones).
   */
  private static readConstructorTokens(members: ClassMember[], stripSpans: Span[]): ConstructorToken[] {
    const ctor = members.find((member) => member.type === "Constructor");
    if (!ctor) return [];

    return ctor.params.map((param) => DecoratorReader.paramToken(param, stripSpans));
  }

  private static paramToken(param: TsParameterProperty | Param, stripSpans: Span[]): ConstructorToken {
    for (const decorator of param.decorators ?? []) {
      if (DecoratorReader.decoratorCallName(decorator) !== "Inject") continue;
      stripSpans.push(decorator.span);
      const arg = DecoratorReader.decoratorFirstArgExpression(decorator);
      if (arg?.type === "Identifier") return { kind: "identifier", value: arg.value };
      if (arg?.type === "StringLiteral") return { kind: "literal", value: arg.value };
    }

    const pat: Pattern = param.type === "TsParameterProperty" ? param.param : param.pat;
    // `Pattern` incluye tanto `BindingIdentifier` (con `typeAnnotation`) como el
    // `Identifier` de `Expression` (sin) — ambos con `type: "Identifier"`, TS no
    // los distingue solo, hace falta el cast.
    if (pat.type !== "Identifier") return null;
    const binding = pat as BindingIdentifier;

    const typeAnnotation = binding.typeAnnotation?.typeAnnotation;
    if (typeAnnotation?.type !== "TsTypeReference" || typeAnnotation.typeName.type !== "Identifier") return null;

    return { kind: "identifier", value: typeAnnotation.typeName.value };
  }

  private static decoratorCallName(decorator: Decorator): string | undefined {
    const expr = decorator.expression;
    if (expr.type === "CallExpression" && expr.callee.type === "Identifier") return expr.callee.value;
    if (expr.type === "Identifier") return expr.value;
    return undefined;
  }

  private static decoratorArgs(decorator: Decorator): unknown[] {
    const expr = decorator.expression;
    if (expr.type !== "CallExpression") return [];
    return expr.arguments.map((arg) => DecoratorReader.literalValue(arg.expression));
  }

  private static decoratorFirstArgObject(decorator: Decorator): Record<string, unknown> {
    const arg = DecoratorReader.decoratorArgs(decorator)[0];
    return arg && typeof arg === "object" && !Array.isArray(arg) ? (arg as Record<string, unknown>) : {};
  }

  /** Solo evalúa literales (string/número/booleano/null/array/objeto) — una referencia (identifier, etc.) no se puede resolver estáticamente acá. */
  private static literalValue(expr: Expression): unknown {
    return DecoratorReader.LITERAL_READERS[expr.type]?.(expr);
  }

  private static objectLiteralValue(expr: ObjectExpression): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const prop of expr.properties) {
      if (prop.type !== "KeyValueProperty") continue;
      const key = DecoratorReader.propName(prop.key);
      if (key) obj[key] = DecoratorReader.literalValue(prop.value);
    }
    return obj;
  }

  private static propName(key: PropertyName): string | undefined {
    if (key.type === "Identifier" || key.type === "StringLiteral") return key.value;
    if (key.type === "NumericLiteral") return String(key.value);
    return undefined;
  }
}

export const decoratorReaderTransform: NgjsTransform = {
  transform: (code, path) => DecoratorReader.read(code, path),
};

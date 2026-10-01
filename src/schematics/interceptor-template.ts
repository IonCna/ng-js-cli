import { CaseTransform } from "@/schematics/case-transform.ts";
import type { GeneratedSchematic } from "@/schematics/schematic-registry.ts";

/**
 * Clase (`implements HttpInterceptor`) — a diferencia de guard/resolver,
 * `HttpInterceptor` en `ngjs-core` es interfaz de clase, no funcional (ver
 * `http-interceptor.ts`: se registra `{ provide: HTTP_INTERCEPTORS, useClass:
 * X, multi: true }`). `ngjs-core/http` no existe como subpath — se consume
 * desde la raíz (`ngjs-core`).
 */
export class InterceptorTemplate {
  private constructor(
    public readonly fileBase: string,
    public readonly className: string,
  ) {}

  static from(name: string): InterceptorTemplate {
    const fileBase = CaseTransform.toKebabCase(name);
    return new InterceptorTemplate(fileBase, `${CaseTransform.toPascalCase(name)}Interceptor`);
  }

  toString(): string {
    return `import type { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from "ngjs-core";
import type { Observable } from "rxjs";

export class ${this.className} implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req);
  }
}
`;
  }

  generated(): GeneratedSchematic {
    const fileName = `${this.fileBase}.interceptor`;
    return { kind: "interceptor", className: this.className, fileName, files: [{ name: `${fileName}.ts`, content: this.toString() }] };
  }
}

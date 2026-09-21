import { transform } from "@swc/core";
import type { NgjsTransform } from "@/plugins/ngjs-transform.ts";

/**
 * SWC transforma decoradores (`legacyDecorator`) y emite `design:paramtypes`
 * (`decoratorMetadata`) — lo que esbuild no hace nunca, con o sin
 * `emitDecoratorMetadata` en el `tsconfig.json`. Corre último en la cadena:
 * necesita el código ya con `template`/`styleUrl` resueltos como texto plano
 * (no le importa el contenido, solo la sintaxis TS).
 */
export const decoratorMetadataTransform: NgjsTransform = {
  async transform(code, path) {
    const { code: output } = await transform(code, {
      filename: path,
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        target: "es2022",
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: "es6" },
    });

    return output;
  },
};

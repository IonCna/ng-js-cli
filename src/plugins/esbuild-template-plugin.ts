import type { NgjsTransform } from "@/plugins/ngjs-transform.ts";
import { CodeReader, FileReader, TemplatePatcher } from "ng-js-vite/core";

/**
 * Inlinea `templateUrl`/`styleUrl` (escopeados por `TemplatePatcher`, mismo
 * mecanismo que `ng-js-vite` en dev) directo en el código — sin tocar
 * `ngjs-core`: el CSS se inyecta al `document.head` desde el propio módulo
 * compilado, autocontenido. `CodeReader.templateRegExp`/`styleRegExp` son los
 * mismos que usa `ng-js-vite` (no se reinventa la detección acá).
 */
export const templateTransform: NgjsTransform = {
  async transform(code, path) {
    if (!FileReader.validate(path, code)) return undefined;

    const reader = CodeReader.from(code);
    const fileReader = FileReader.parse(reader, path);
    const patched = await TemplatePatcher.from(fileReader);

    let result = code.replace(
      CodeReader.templateRegExp,
      `template: ${JSON.stringify(patched.template.toString("utf8"))}`,
    );

    if (patched.style) {
      const removeStyleUrl = new RegExp(`${CodeReader.styleRegExp.source},?`);
      result = result.replace(removeStyleUrl, "");
      result += `\n(function () { var s = document.createElement("style"); s.textContent = ${JSON.stringify(
        patched.style.toString("utf8"),
      )}; document.head.appendChild(s); })();\n`;
    }

    return result;
  },
};

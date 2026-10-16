import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { NgjsConfig, NgjsFile, NgjsWorkspace } from "@/config/cli-config.ts";

export class ConfigReader {
  /** `ngjs.json` tal cual está en disco (un proyecto o un workspace): lo que navega `ngjs config`. */
  static async readFile(): Promise<NgjsFile> {
    const root = process.cwd();
    const path = join(root, "ngjs.json");
    if (!existsSync(path)) {
      throw new Error(`No se encontró "ngjs.json" en "${root}".`);
    }

    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as NgjsFile;
  }

  /**
   * El proyecto sobre el que corre el comando. Un `ngjs.json` de un solo proyecto se devuelve tal cual. En un
   * workspace, como `ng build [project]`: el que se nombra; sin nombre, el proyecto cuya `root` contiene el directorio
   * actual (la más larga gana, así el de la raíz del workspace es el default), o el único que hay.
   */
  static async read(project?: string): Promise<NgjsConfig> {
    const file = await ConfigReader.readFile();
    if (!ConfigReader.isWorkspace(file)) {
      if (project) throw new Error(`"ngjs.json" no define "projects": no hay un proyecto "${project}" que elegir.`);
      return file;
    }

    const name = project ?? ConfigReader.projectByCwd(file);
    const config = file.projects[name];
    if (!config) {
      throw new Error(`El proyecto "${name}" no existe en "ngjs.json" (hay: ${Object.keys(file.projects).join(", ")}).`);
    }
    return { version: file.version, ...config };
  }

  static isWorkspace(file: NgjsFile): file is NgjsWorkspace {
    return "projects" in file && typeof file.projects === "object" && file.projects !== null;
  }

  private static projectByCwd(workspace: NgjsWorkspace): string {
    const entries = Object.entries(workspace.projects);
    const cwd = process.cwd();
    const containing = entries
      .map(([name, config]) => ({ name, root: resolve(cwd, config.root || ".") }))
      .filter(({ root }) => ConfigReader.contains(root, cwd))
      .sort((a, b) => b.root.length - a.root.length);
    if (containing[0]) return containing[0].name;
    if (entries.length === 1) return entries[0]![0];
    throw new Error(
      `"ngjs.json" tiene varios proyectos y ninguno en este directorio: nombrá uno (${entries.map(([name]) => name).join(", ")}).`,
    );
  }

  private static contains(root: string, dir: string): boolean {
    const path = relative(root, dir);
    return path === "" || (!path.startsWith("..") && !isAbsolute(path));
  }
}

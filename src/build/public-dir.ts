import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";

/**
 * `public/` de la raíz del proyecto, copiado tal cual a `outputPath` — lo que Vite sirve en `serve` desde la raíz
 * (`/mock-status.json` → `public/mock-status.json`) tiene que existir igual en el build, como hace `vite build`.
 */
export class PublicDir {
  static readonly NAME = "public";

  static async copyTo(outputPath: string): Promise<void> {
    const source = join(process.cwd(), PublicDir.NAME);
    if (!existsSync(source)) return;
    await cp(source, join(process.cwd(), outputPath), { recursive: true });
  }
}

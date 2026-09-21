/**
 * Forma común de cada paso de transform (`esbuild-template-plugin.ts`,
 * `decorator-metadata-transform.ts`, ...). No son `Plugin` de esbuild —
 * esbuild solo deja que UN `onLoad` se quede con cada archivo, así que el
 * `PluginLoader` es el único que registra `onLoad`, y encadena estos
 * transforms adentro. `undefined` = "no aplica, seguí de largo sin tocar".
 */
export interface NgjsTransform {
  transform(code: string, path: string): Promise<string | undefined>;
}

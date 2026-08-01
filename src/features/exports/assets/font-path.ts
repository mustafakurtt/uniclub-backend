import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Gömülü Unicode font — prod imajında `assets/fonts` ile birlikte kopyalanır. */
export const DEJAVU_SANS_FONT_PATH = join(moduleDir, "fonts", "DejaVuSans.ttf");

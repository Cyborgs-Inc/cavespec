import fs from "node:fs";
import path from "node:path";

// cavespec.json at the repository root says where the specs are:
//   { "product": "docs/product.product-spec.md", "missions": ["docs/missions/*.product-spec.md"], "budget": 6000,
//     "keep": ["How To Keep This Current"] }
// Without one, the product spec is the only *.product-spec.md at the root or in docs/, and every other spec under
// docs/ is a mission spec.

export interface Config {
  product: string;
  missions: string[];
  budget: number;
  keep: string[];
}

export const DEFAULT_BUDGET = 6000;

export function loadConfig(root: string, file = "cavespec.json"): Config {
  const at = path.join(root, file);
  const raw = fs.existsSync(at) ? (JSON.parse(fs.readFileSync(at, "utf8")) as Partial<{ product: string; missions: string[] | string; budget: number; keep: string[] }>) : {};
  const all = findFiles(root, ["*.product-spec.md", "docs/**/*.product-spec.md"]);
  const product = raw.product ?? (all.length === 1 ? all[0] : all.find((f) => !f.includes("/missions/")));
  if (!product) throw new Error(`No product spec found. Add cavespec.json with "product": "<path to your *.product-spec.md>".`);
  const patterns = raw.missions ? (Array.isArray(raw.missions) ? raw.missions : [raw.missions]) : null;
  const missions = (patterns ? findFiles(root, patterns) : all).filter((f) => f !== product);
  return { product, missions, budget: raw.budget ?? DEFAULT_BUDGET, keep: raw.keep ?? [] };
}

/** Files under root matching any pattern ("*" within a folder, "**" across folders), as root-relative paths. */
export function findFiles(root: string, patterns: string[]): string[] {
  const res = patterns.map(toRegExp);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else if (res.some((r) => r.test(rel))) out.push(rel);
    }
  };
  walk("");
  return out.sort();
}

function toRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      re += pattern[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += pattern[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

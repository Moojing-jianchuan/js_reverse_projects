/**
 * 解析同盾补环境用的 location：优先 CLI，其次 TD_LOCATION_FILE，再次仓库 config/location.juneyaoair.json。
 */

"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_JSON = path.join(__dirname, "..", "..", "config", "location.juneyaoair.json");

/** 无 JSON 时的兜底页（吉祥 / jxhk 场景，与仓库示例一致） */
const DEFAULT_HREF = "https://www.juneyaoair.com/";

/**
 * @param {string | null | undefined} explicitPath `--location` 传入的路径，可为 null
 * @returns {{ location: Record<string, unknown> | null, resolvedPath: string | null, fallbackHref: string }}
 */
function resolveTdLocation(explicitPath) {
  const candidates = [];
  if (explicitPath) {
    candidates.push(
      path.isAbsolute(explicitPath) ? explicitPath : path.join(process.cwd(), explicitPath),
    );
  }
  if (process.env.TD_LOCATION_FILE) {
    const e = process.env.TD_LOCATION_FILE;
    candidates.push(path.isAbsolute(e) ? e : path.join(process.cwd(), e));
  }
  candidates.push(DEFAULT_JSON);

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      const location = JSON.parse(fs.readFileSync(p, "utf8"));
      return { location, resolvedPath: p, fallbackHref: DEFAULT_HREF };
    }
  }
  return { location: null, resolvedPath: null, fallbackHref: DEFAULT_HREF };
}

module.exports = { resolveTdLocation, DEFAULT_JSON, DEFAULT_HREF };

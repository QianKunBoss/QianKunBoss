#!/usr/bin/env node
/**
 * gen-stats.mjs —— 自托管 GitHub 数据卡片生成器
 *
 * 为什么自己写：github-readme-stats / github-profile-trophy / activity-graph 等
 * 全部托管在 *.vercel.app，在部分网络环境下完全不可达，README 里的图会成片挂掉。
 * 本脚本直接调用 GitHub 公开 API，用纯 SVG 手绘卡片，产物提交进仓库、
 * 由 raw.githubusercontent.com 提供，零第三方依赖。
 *
 * 产出（写入 assets/）：
 *   - stats.svg      概览：仓库 / 关注者 / 星标 / 复刻
 *   - languages.svg  语言分布横向条形图
 *
 * 用法： node scripts/gen-stats.mjs [username]
 * 环境变量：
 *   GITHUB_TOKEN   可选，提高 API 限额（Actions 里自动注入）
 *   GH_DATA_DIR    可选，离线模式：从该目录读取 user.json / repos.json，
 *                  不请求网络。便于本地预览与调试。
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USER = process.argv[2] || process.env.PROFILE_USER || "QianKunBoss";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "assets");

/* ── 主题色（宇宙科技风 · 钢蓝色系） ───────────────────────── */
const C = {
  bg: "#0B1F33",
  bgSoft: "#0E2840",
  line: "#16304D",
  blue: "#1F6FEB",
  blue2: "#2C9CDF",
  blue3: "#58A6FF",
  cyan: "#7DF9FF",
  text: "#C9D1D9",
  dim: "#8397AC",
  mute: "#5A6E82",
};

const MONO = "ui-monospace,SFMono-Regular,'Cascadia Code',Consolas,monospace";
const SANS = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif";

/* ── 工具函数 ─────────────────────────────────────────────── */
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));

async function gh(path) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "gen-stats" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status} ${res.statusText}`);
  return res.json();
}

/** 离线模式：从 GH_DATA_DIR 读取已抓取好的 JSON */
function readLocal(name) {
  const dir = process.env.GH_DATA_DIR;
  if (!dir) return null;
  try {
    // 去掉可能的 UTF-8 BOM，否则 JSON.parse 会直接抛错
    const raw = readFileSync(join(dir, name), "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`离线模式读取 ${name} 失败：${e.message}`);
  }
}

async function loadData() {
  if (process.env.GH_DATA_DIR) {
    console.log(`[gen-stats] offline mode <- ${process.env.GH_DATA_DIR}`);
    return [readLocal("user.json"), readLocal("repos.json")];
  }
  return Promise.all([
    gh(`/users/${USER}`),
    gh(`/users/${USER}/repos?per_page=100&sort=pushed`),
  ]);
}

/* ── 卡片外壳 ─────────────────────────────────────────────── */
function shell(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
  <defs>
    <pattern id="g" width="26" height="26" patternUnits="userSpaceOnUse">
      <path d="M26 0H0V26" fill="none" stroke="${C.line}" stroke-width="1" opacity="0.55"/>
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" rx="12" fill="${C.bg}"/>
  <rect width="${w}" height="${h}" rx="12" fill="url(#g)"/>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="none" stroke="${C.line}"/>
  <rect x="0" y="0" width="${w}" height="3" rx="1.5" fill="${C.blue}"/>
  <text x="26" y="36" font-family="${MONO}" font-size="12" letter-spacing="2.4" fill="${C.cyan}">${esc(title)}</text>
  <line x1="26" y1="48" x2="${w - 26}" y2="48" stroke="${C.line}" stroke-width="1"/>
${body}
</svg>
`;
}

/* ── stats.svg ────────────────────────────────────────────── */
function buildStats(user, repos) {
  const w = 860, h = 214;
  const own = repos.filter((r) => !r.fork);
  const stars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  const forks = repos.reduce((s, r) => s + (r.forks_count || 0), 0);
  const since = new Date(user.created_at).getFullYear();

  const items = [
    { v: fmt(user.public_repos), l: "PUBLIC REPOS" },
    { v: fmt(stars), l: "TOTAL STARS" },
    { v: fmt(user.followers), l: "FOLLOWERS" },
    { v: fmt(forks), l: "TOTAL FORKS" },
  ];

  const colW = (w - 52) / items.length;
  const body = items
    .map((it, i) => {
      const cx = 26 + colW * i + colW / 2;
      return `  <g>
    <text x="${cx}" y="118" text-anchor="middle" font-family="${MONO}" font-size="38" font-weight="700" fill="${C.blue3}">${esc(it.v)}</text>
    <text x="${cx}" y="146" text-anchor="middle" font-family="${MONO}" font-size="10.5" letter-spacing="1.6" fill="${C.mute}">${esc(it.l)}</text>
  </g>`;
    })
    .join("\n");

  const foot = `  <text x="26" y="186" font-family="${MONO}" font-size="11" fill="${C.dim}">@${esc(user.login)}</text>
  <text x="${w - 26}" y="186" text-anchor="end" font-family="${MONO}" font-size="11" fill="${C.dim}">SINCE ${since} · ${own.length} ORIGINAL REPOS</text>`;

  return shell(w, h, "GITHUB STATS", `${body}\n${foot}`);
}

/* ── languages.svg ────────────────────────────────────────── */
const LANG_COLORS = {
  Vue: "#41B883", TypeScript: "#3178C6", JavaScript: "#F1E05A", Java: "#B07219",
  Python: "#3572A5", HTML: "#E34C26", CSS: "#563D7C", "C#": "#178600",
  Go: "#00ADD8", Shell: "#89E051", Astro: "#FF5A03", Svelte: "#FF3E00",
  Rust: "#DEA584", Kotlin: "#A97BFF", Dart: "#00B4AB", PHP: "#4F5D95",
};

function buildLanguages(repos) {
  const counts = new Map();
  for (const r of repos) {
    if (r.fork || !r.language) continue;
    counts.set(r.language, (counts.get(r.language) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  const list = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const w = 860;
  const rowH = 27;
  const h = 70 + list.length * rowH + 22;
  const barX = 130, barMax = w - barX - 96;

  const body = list
    .map(([lang, n], i) => {
      const y = 76 + i * rowH;
      const pct = (n / total) * 100;
      const bw = Math.max(Math.round((n / total) * barMax), 4);
      const col = LANG_COLORS[lang] || C.blue2;
      return `  <g>
    <text x="26" y="${y + 12}" font-family="${MONO}" font-size="12.5" fill="${C.text}">${esc(lang)}</text>
    <rect x="${barX}" y="${y + 1}" width="${barMax}" height="13" rx="6.5" fill="${C.bgSoft}"/>
    <rect x="${barX}" y="${y + 1}" width="${bw}" height="13" rx="6.5" fill="${col}"/>
    <text x="${w - 26}" y="${y + 12}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${C.dim}">${pct.toFixed(1)}%</text>
  </g>`;
    })
    .join("\n");

  const foot = `  <text x="26" y="${h - 14}" font-family="${MONO}" font-size="10.5" fill="${C.mute}">STATISTICS BY PRIMARY LANGUAGE OF ORIGINAL REPOSITORIES</text>`;

  return shell(w, h, "MOST USED LANGUAGES", `${body}\n${foot}`);
}

/* ── 主流程 ───────────────────────────────────────────────── */
async function main() {
  console.log(`[gen-stats] user="${USER}"`);
  const [user, repos] = await loadData();
  if (!user || !Array.isArray(repos)) throw new Error("数据结构异常：需要 user 对象与 repos 数组");

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "stats.svg"), buildStats(user, repos), "utf8");
  writeFileSync(join(OUT_DIR, "languages.svg"), buildLanguages(repos), "utf8");

  const stars = repos.reduce((s, r) => s + r.stargazers_count, 0);
  console.log(`[gen-stats] ok -> assets/stats.svg, assets/languages.svg`);
  console.log(`[gen-stats] repos=${user.public_repos} stars=${stars} followers=${user.followers}`);
}

main().catch((e) => {
  console.error("[gen-stats] failed:", e.message);
  process.exit(1);
});

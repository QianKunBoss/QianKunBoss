/**
 * views-counter.js —— 自托管 GitHub 主页访问计数器（Cloudflare Worker）
 * ============================================================================
 * 【这个文件是可选的升级项】不部署也完全不影响主页 —— README 当前用的是
 *   visitorbadge.io（已由 Cloudflare 承载，实测可用）。
 *
 * 为什么值得自托管？
 *   所有第三方计数服务都必须返回 `Cache-Control: no-store`（否则数不准），
 *   于是 GitHub 的 camo 图片代理每次加载页面都要回源。它们大多是单机部署，
 *   抖一下就裂图 —— 这就是 komarev 那张 Views 间歇性损坏的根因。
 *   自托管后缓存策略由你决定：设置 5 分钟缓存 → camo 命中缓存直接返回，
 *   图片几乎不可能裂，代价只是计数精度变成 5 分钟粒度（对访问计数完全够用）。
 *
 * ----------------------------------------------------------------------------
 * 部署（约 2 分钟）
 * ----------------------------------------------------------------------------
 *   1) 建 KV 存计数
 *        npx wrangler kv namespace create VIEWS_KV
 *      把输出的 id 填进下面的 wrangler.toml
 *
 *   2) wrangler.toml
 *        name = "views-counter"
 *        main = "views-counter.js"
 *        compatibility_date = "2024-11-01"
 *        kv_namespaces = [{ binding = "VIEWS_KV", id = "<上一步的 id>" }]
 *        routes = [{ pattern = "views.tianrld.top", custom_domain = true }]
 *
 *   3) npx wrangler deploy
 *
 *   4) 把 README 里那张计数图换成（一行替换）：
 *        <img src="https://views.tianrld.top/?key=profile&label=PROFILE%20VIEWS" alt="Views" />
 * ============================================================================
 */

const THEME = {
  labelBg: "#0B1F33",
  countBg: "#1F6FEB",
  text: "#FFFFFF",
  border: "#16304D",
};

/** 生成 shields.io `for-the-badge` 风格的 SVG 徽章 */
function renderBadge(label, count) {
  const FONT = "Verdana,'Segoe UI',DejaVu Sans,Geneva,sans-serif";
  const text = String(count);
  const h = 28;
  const lp = 11; // 左右内边距
  const leftW = Math.round(label.length * 7.2 + lp * 2);
  const rightW = Math.round(text.length * 8.4 + lp * 2);
  const w = leftW + rightW;
  const cy = h / 2 + 4;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}: ${text}">
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="3" fill="${THEME.labelBg}" stroke="${THEME.border}"/>
  <path d="M${leftW} 1h${rightW - 4}a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3h-${rightW - 4}z" fill="${THEME.countBg}"/>
  <g font-family="${FONT}" font-size="10.5" font-weight="700" letter-spacing="1.2" fill="${THEME.text}" text-anchor="middle">
    <text x="${leftW / 2}" y="${cy}" fill="#8397AC">${label}</text>
    <text x="${leftW + rightW / 2}" y="${cy}">${text}</text>
  </g>
</svg>
`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 计数键：默认 profile，可用 ?key=xxx 区分不同页面
    const key = (url.searchParams.get("key") || "profile").replace(/[^\w.-]/g, "");
    const label = (url.searchParams.get("label") || "PROFILE VIEWS").toUpperCase();

    let count = 1;
    try {
      const prev = parseInt((await env.VIEWS_KV.get(key)) || "0", 10) || 0;
      count = prev + 1;
      await env.VIEWS_KV.put(key, String(count));
    } catch (err) {
      // KV 异常时也要保证图能出来，不要让主页裂图
      count = 0;
    }

    return new Response(renderBadge(label, count), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        // 关键：给 camo / 浏览器 5 分钟缓存，命中缓存就不会裂图
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};

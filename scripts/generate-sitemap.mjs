/**
 * Regenerate sitemap.xml from coupons-data.js (run after sheet updates).
 * Usage: node scripts/generate-sitemap.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const BASE = "https://atmad.io";

function normalizeBrandKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, (_, inner) => (inner.length < 40 ? " " : "(" + inner + ")"))
    .replace(/\s+promote code with link\s*/i, "")
    .replace(/\bllc\b\.?/gi, "")
    .replace(/\./g, "")
    .replace(/[^\w\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyBrand(title) {
  let s = normalizeBrandKey(title)
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "brand";
}

const dataPath = join(root, "coupons-data.js");
const raw = readFileSync(dataPath, "utf8");
const titles = [...raw.matchAll(/"titleEn":\s*"([^"]+)"/g)].map((m) => m[1]);
const slugs = new Set();
for (const t of titles) slugs.add(slugifyBrand(t));

const staticUrls = [
  { loc: `${BASE}/`, changefreq: "weekly", priority: "1.0" },
  { loc: `${BASE}/coupons.html`, changefreq: "daily", priority: "0.95" },
  { loc: `${BASE}/blog.html`, changefreq: "weekly", priority: "0.6" },
  { loc: `${BASE}/about.html`, changefreq: "monthly", priority: "0.7" }
];

const now = new Date().toISOString().slice(0, 10);

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
for (const u of staticUrls) {
  xml += `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>
`;
}
for (const slug of [...slugs].sort()) {
  xml += `  <url>
    <loc>${BASE}/${encodeURIComponent(slug)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.75</priority>
  </url>
`;
}
xml += `</urlset>
`;

writeFileSync(join(root, "sitemap.xml"), xml, "utf8");
console.log("sitemap.xml written with", staticUrls.length, "static +", slugs.size, "brand URLs");

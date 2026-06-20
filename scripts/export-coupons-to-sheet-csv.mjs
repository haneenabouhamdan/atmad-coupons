/**
 * Export coupons-data.js → CSV for Google Sheets import (sync-compatible columns).
 *
 * Usage:
 *   node scripts/export-coupons-to-sheet-csv.mjs
 *   node scripts/export-coupons-to-sheet-csv.mjs /path/to/coupons-data.js
 *   node scripts/export-coupons-to-sheet-csv.mjs /path/to/coupons-data.js /path/to/out-dir
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DEFAULT_INPUT = join(
  process.env.HOME || "",
  "Downloads/coupons-data.js"
);
const DEFAULT_OUT = join(ROOT, "exports");

const INPUT = process.argv[2] || DEFAULT_INPUT;
const OUT_DIR = process.argv[3] || DEFAULT_OUT;
const CPANEL_NAMES_PATH = join(__dirname, "cpanel-brand-names.json");

/** @type {{ entries: {titleEn:string,titleAr:string,code:string}[], byCode: Record<string,{titleEn:string,titleAr:string}>, byBrandKey: Record<string,{titleEn:string,titleAr:string}> } | null} */
let cpanelNames = null;

function loadCpanelNames() {
  if (cpanelNames) return cpanelNames;
  if (!existsSync(CPANEL_NAMES_PATH)) {
    cpanelNames = { entries: [], byCode: {}, byBrandKey: {} };
    return cpanelNames;
  }
  cpanelNames = JSON.parse(readFileSync(CPANEL_NAMES_PATH, "utf8"));
  return cpanelNames;
}

function codesOverlap(codeA, codeB) {
  const a = new Set(codeTokens(codeA));
  return codeTokens(codeB).some((t) => a.has(t));
}

function brandMatchScore(sheetBrand, cpanelTitle) {
  const a = normBrand(sheetBrand);
  const b = normBrand(cpanelTitle);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;
  const aWords = new Set(a.split(" ").filter(Boolean));
  let shared = 0;
  for (const w of b.split(" ")) if (aWords.has(w)) shared++;
  return shared * 15;
}

function resolveArabicBrand(brandEn, code, titleArFromItem) {
  const ar = String(titleArFromItem || "").trim();
  if (ar && ar !== String(brandEn || "").trim()) return ar;

  const names = loadCpanelNames();
  const brand = String(brandEn || "").trim();
  const codeStr = String(code || "").trim();

  let best = null;
  let bestScore = -1;
  for (const entry of names.entries) {
    if (!codesOverlap(entry.code, codeStr)) continue;
    const score = brandMatchScore(brand, entry.titleEn) + 50;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (best?.titleAr) return best.titleAr;

  for (const tok of codeTokens(codeStr)) {
    if (names.byCode[tok]?.titleAr) return names.byCode[tok].titleAr;
  }

  const bk = normBrand(brand);
  if (names.byBrandKey[bk]?.titleAr) return names.byBrandKey[bk].titleAr;

  return ar || brand;
}

function extractHttpUrls(s) {
  const t = String(s || "");
  const re = /https?:\/\/[^\s<>"')\],]+/gi;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) out.push(m[0].replace(/[.,;]+$/, ""));
  return out;
}

function normBrand(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bllc\b\.?/gi, "")
    .replace(/\./g, "")
    .replace(/[^a-z0-9&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function codeTokens(code) {
  return String(code || "")
    .split(/\s*\/\s*|\s*&\s+|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cols) {
  return cols.map(csvEscape).join(",");
}

function loadCouponsData(path) {
  const src = readFileSync(path, "utf8");
  const ctx = {};
  eval(src.replace(/^const /gm, "ctx."));
  const items = [];
  for (const sh of ctx.COUPON_SHEETS || []) {
    for (const it of sh.items || []) items.push(it);
  }
  return {
    items,
    countryRows: ctx.ATMAD_COUNTRY_SHEET_ROWS || [],
  };
}

function buildCountryLookup(countryRows) {
  const map = new Map();
  for (const row of countryRows) {
    const brand = String(row[0] || "").trim();
    const code = String(row[1] || "").trim();
    const countries = String(row[2] || "").trim();
    if (!brand || !code) continue;
    for (const tok of codeTokens(code)) {
      const key = `${normBrand(brand)}|${tok}`;
      if (!map.has(key)) map.set(key, countries);
    }
    const bk = normBrand(brand);
    if (!map.has(`${bk}|*`)) map.set(`${bk}|*`, countries);
  }
  return map;
}

function countriesForItem(item, countryLookup) {
  const brand = normBrand(item.titleEn);
  for (const tok of codeTokens(item.code)) {
    const hit = countryLookup.get(`${brand}|${tok}`);
    if (hit) return hit;
  }
  const brandOnly = countryLookup.get(`${brand}|*`);
  if (brandOnly) return brandOnly;

  const meta = String(item.metaEn || "");
  const validIn = meta.match(/valid in\s+(.+)/i);
  if (validIn) return validIn[1].trim();

  const parts = meta.split("·").map((p) => p.trim()).filter(Boolean);
  const nonUrl = parts.filter((p) => !/^https?:\/\//i.test(p) && p !== "—");
  if (nonUrl.length) return nonUrl.join(" · ");

  return "";
}

function websiteForItem(item) {
  const fromMeta = extractHttpUrls(item.metaEn);
  if (fromMeta.length) return fromMeta[0];
  const fromDesc = extractHttpUrls(item.descEn);
  if (fromDesc.length) return fromDesc[0];
  return "";
}

function discountForItem(item) {
  const disc = String(item.discountEn || "").trim();
  const desc = String(item.descEn || "").trim();
  const code = String(item.code || "").trim();
  if (disc && disc !== "—" && disc.toLowerCase() !== code.toLowerCase()) return disc;
  if (desc && desc !== "—" && desc.toLowerCase() !== code.toLowerCase()) return desc;
  return disc || desc || "";
}

function itemKey(item) {
  const tokens = codeTokens(item.code);
  const codePart = tokens.length ? tokens.slice().sort().join("|") : String(item.code || "").toLowerCase();
  return `${normBrand(item.titleEn)}|${codePart}`;
}

function dedupeItems(items) {
  const byKey = new Map();
  const order = [];
  for (const item of items) {
    const key = itemKey(item);
    if (!byKey.has(key)) {
      byKey.set(key, item);
      order.push(key);
      continue;
    }
    const prev = byKey.get(key);
    const score = (it) =>
      String(it.discountEn || "").length + String(it.descEn || "").length;
    if (score(item) > score(prev)) byKey.set(key, item);
  }
  return order.map((k) => byKey.get(k));
}

function toSheetRows(items, countryLookup) {
  return items.map((item) => {
    const brand = String(item.titleEn || "").trim();
    const code = String(item.code || "").trim();
    const countries = countriesForItem(item, countryLookup);
    return {
      brand,
      brandAr: resolveArabicBrand(brand, code, item.titleAr),
      url: websiteForItem(item),
      code,
      status: "Active",
      countries,
      discount: discountForItem(item),
    };
  });
}

function sortRows(rows) {
  return rows.slice().sort((a, b) => a.brand.localeCompare(b.brand, "en", { sensitivity: "base" }));
}

function main() {
  if (!existsSync(INPUT)) {
    console.error("Input not found:", INPUT);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const { items, countryRows } = loadCouponsData(INPUT);
  const deduped = dedupeItems(items);
  const countryLookup = buildCountryLookup(countryRows);
  const rows = sortRows(toSheetRows(deduped, countryLookup));

  const disclaimer =
    "Hi all please always if theres a link press it first before applying the code";
  const header = [
    "Brand Name",
    "Brand Name (Arabic)",
    "Website / App",
    "Coupon Code",
    "Status",
    "Countries",
    "Discount Detail",
  ];

  const couponsLines = [
    csvRow([disclaimer, "", "", "", "", "", ""]),
    csvRow(header),
    ...rows.map((r) =>
      csvRow([
        r.brand,
        r.brandAr,
        r.url,
        r.code,
        r.status,
        r.countries,
        r.discount,
      ])
    ),
  ];

  const outPath = join(OUT_DIR, "cpanel-coupons-google-sheet.csv");
  writeFileSync(outPath, couponsLines.join("\n") + "\n", "utf8");

  const withCountries = rows.filter((r) => r.countries).length;
  const withArabic = rows.filter(
    (r) => r.brandAr && r.brandAr !== r.brand
  ).length;
  console.log("Source:", INPUT);
  console.log(
    "Rows:",
    rows.length,
    "(deduped from",
    items.length,
    ";",
    withCountries,
    "with countries,",
    withArabic,
    "with Arabic names)"
  );
  console.log("Wrote:", outPath);
}

main();

/**
 * Pull coupon data from Google Sheets → coupons-data.js (+ sitemap.xml).
 *
 * Sheet columns (current layout):
 *   Brand | Brand (Arabic) | URL | Coupon code | Status | Countries | Code logic
 *
 * Legacy 6-column sheets (no Arabic column) still work.
 * Requires readable export (link sharing → Viewer is enough for gviz CSV).
 *
 * Usage:
 *   node scripts/sync-coupons-from-sheet.mjs
 *   node scripts/sync-coupons-from-sheet.mjs --check
 *
 * Env: ATMAD_SHEET_ID, ATMAD_SHEET_GID (default gid=0)
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_PATH = join(ROOT, "coupons-data.js");
const CPANEL_NAMES_PATH = join(__dirname, "cpanel-brand-names.json");

const SHEET_ID =
  process.env.ATMAD_SHEET_ID || "1v7QJIHRRaHiAela9PmC_e4igmUiQT6mJFn8zNOdJ-ho";
const SHEET_GID = process.env.ATMAD_SHEET_GID || "0";
const CHECK_ONLY = process.argv.includes("--check");
const INCLUDE_PAUSED = process.argv.includes("--include-paused");

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

function codesOverlap(codeA, codeB) {
  const a = new Set(codeTokens(codeA));
  const b = codeTokens(codeB);
  return b.some((t) => a.has(t));
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

/** Prefer cPanel display names (titleEn/titleAr) when we can match by code or brand. */
function resolveCpanelDisplay(sheetBrand, code) {
  const names = loadCpanelNames();
  const sheet = trimCell(sheetBrand);
  const codeStr = trimCell(code);

  let best = null;
  let bestScore = -1;
  for (const entry of names.entries) {
    if (!codesOverlap(entry.code, codeStr)) continue;
    const score = brandMatchScore(sheet, entry.titleEn) + 50;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (best) return { titleEn: best.titleEn, titleAr: best.titleAr };

  for (const tok of codeTokens(codeStr)) {
    if (names.byCode[tok]) return names.byCode[tok];
  }

  const bk = normBrand(sheet);
  if (names.byBrandKey[bk]) return names.byBrandKey[bk];

  return { titleEn: sheet, titleAr: sheet };
}

function applyCpanelDisplay(item, sheetBrand) {
  const d = resolveCpanelDisplay(sheetBrand, item.code);
  item.titleEn = d.titleEn;
  item.titleAr = d.titleAr;
  return item;
}

function codeKey(code) {
  const tokens = codeTokens(code);
  return tokens.length ? tokens.slice().sort().join("|") : polishCodeKey(code);
}

function polishCodeKey(code) {
  return String(code || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function itemDedupeKey(item) {
  return `${normBrand(item.titleEn)}|${codeKey(item.code)}`;
}

function itemRichness(item) {
  let score =
    String(item.discountEn || "").length +
    String(item.descEn || "").length +
    String(item.metaEn || "").length;
  const code = String(item.code || "").trim();
  const disc = String(item.discountEn || "").trim();
  if (code && disc && code.toLowerCase() === disc.toLowerCase()) score -= 40;
  if (/\(see details\)/i.test(code)) score -= 30;
  if (/https?:\/\//i.test(item.metaEn || "")) score += 15;
  if (String(item.discountEn || "").length > 20) score += 10;
  return score;
}

function pickRicherField(a, b) {
  const sa = String(a || "");
  const sb = String(b || "");
  if (!sa || sa === "—") return sb || sa;
  if (!sb || sb === "—") return sa;
  return sb.length > sa.length ? sb : sa;
}

function mergeCouponCodeStrings(a, b) {
  const order = [];
  const seen = new Set();
  const push = (raw) => {
    const t = String(raw || "").trim();
    if (!t) return;
    const k = t.replace(/\s+/g, "").toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    order.push(t);
  };
  String(a || "")
    .split(/\s*\/\s*|\s*&\s*/i)
    .forEach(push);
  String(b || "")
    .split(/\s*\/\s*|\s*&\s*/i)
    .forEach(push);
  return order.length ? order.join(" / ") : polishText(a || b || "");
}

function polishText(s) {
  return String(s ?? "").trim();
}

function mergeDuplicateItems(primary, incoming) {
  const pick = (a, b) => ((b || "").length > (a || "").length ? b : a);
  return {
    badgeEn: primary.badgeEn,
    badgeAr: primary.badgeAr,
    titleEn: pick(primary.titleEn, incoming.titleEn),
    titleAr: pick(primary.titleAr, incoming.titleAr),
    descEn: pickRicherField(primary.descEn, incoming.descEn),
    descAr: pickRicherField(primary.descAr, incoming.descAr),
    discountEn: pickRicherField(primary.discountEn, incoming.discountEn),
    discountAr: pickRicherField(primary.discountAr, incoming.discountAr),
    metaEn: pickRicherField(primary.metaEn, incoming.metaEn),
    metaAr: pickRicherField(primary.metaAr, incoming.metaAr),
    code: mergeCouponCodeStrings(primary.code, incoming.code),
  };
}

/** Collapse repeated sheet rows that share the same brand + coupon code(s). */
function dedupeItems(items) {
  const byKey = new Map();
  const order = [];

  for (const item of items) {
    const key = itemDedupeKey(item);
    if (!byKey.has(key)) {
      byKey.set(key, { ...item });
      order.push(key);
      continue;
    }
    const prev = byKey.get(key);
    const merged = mergeDuplicateItems(prev, item);
    byKey.set(key, merged);
  }

  return order.map((key) => byKey.get(key));
}

function dedupeCountryRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const brand = String(row[0] || "").trim();
    const code = String(row[1] || "").trim();
    const countries = String(row[2] || "").trim();
    const key = `${normBrand(brand)}|${codeKey(code)}|${countries.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([brand, code, countries]);
  }
  return out;
}

function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function trimCell(v) {
  return String(v ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .replace(/^\t+|\t+$/g, "");
}

function normRow(row, n) {
  const out = row.slice();
  while (out.length < n) out.push("");
  return out.map(trimCell);
}

function truncate(s, max) {
  const t = String(s || "");
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function linkFirst(text) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("click here") ||
    t.includes("press it") ||
    t.includes("link first")
  );
}

function isHeaderRow(row) {
  const a = row[0].toLowerCase();
  return (
    a.includes("advertiser name") ||
    a === "brand" ||
    a.startsWith("brand name")
  );
}

/** @returns {{ brand:number, brandAr:number, website:number, code:number, status:number, countries:number, discount:number, hasArabicCol:boolean }} */
function detectSheetLayout(rows) {
  const legacy = {
    brand: 0,
    brandAr: -1,
    website: 1,
    code: 2,
    status: 3,
    countries: 4,
    discount: 5,
    hasArabicCol: false,
  };

  for (const raw of rows) {
    const row = normRow(raw, 8);
    if (!isHeaderRow(row)) continue;

    const headers = row.map((h) => trimCell(h).toLowerCase());
    const arIdx = headers.findIndex(
      (h) =>
        h.includes("arabic") ||
        h.includes("عرب") ||
        h.includes("اسم العلامة") ||
        h === "brand (arabic)" ||
        h === "brand name (arabic)"
    );
    if (arIdx < 0) return legacy;

    const col = (pred, fallback) => {
      const i = headers.findIndex(pred);
      return i >= 0 ? i : fallback;
    };

    return {
      brand: 0,
      brandAr: arIdx,
      website: col(
        (h) => h.includes("website") || h.includes("url") || h.includes("app"),
        arIdx === 1 ? 2 : 1
      ),
      code: col(
        (h) => h.includes("coupon") || h === "code",
        arIdx === 1 ? 3 : 2
      ),
      status: col((h) => h === "status", arIdx === 1 ? 4 : 3),
      countries: col((h) => h.includes("countr"), arIdx === 1 ? 5 : 4),
      discount: col(
        (h) =>
          h.includes("discount") ||
          h.includes("code logic") ||
          h.includes("detail"),
        arIdx === 1 ? 6 : 5
      ),
      hasArabicCol: true,
    };
  }

  return legacy;
}

function pickCol(row, idx) {
  return idx >= 0 ? row[idx] : "";
}

function itemFromUnifiedRow(
  brand,
  brandAr,
  website,
  code,
  status,
  countries,
  discount
) {
  brand = trimCell(brand);
  brandAr = trimCell(brandAr);
  website = trimCell(website);
  code = trimCell(code);
  status = trimCell(status);
  countries = trimCell(countries);
  discount = trimCell(discount);

  if (!brand && !code) return null;
  if (!brand) brand = "(No brand)";
  if (isHeaderRow([brand])) return null;

  const st = status.toLowerCase();
  if (!INCLUDE_PAUSED && st === "paused") return null;

  if (!code && !discount) return null;

  const badge = linkFirst(website) || linkFirst(discount) ? "Link first" : "Offer";
  const badgeAr = badge === "Link first" ? "افتح الرابط أولاً" : "عرض";
  const desc = discount || website || "See store for terms.";
  const metaParts = [];
  if (countries) metaParts.push(countries);
  if (website && website.toUpperCase() !== "NA" && !linkFirst(website)) {
    metaParts.push(website);
  }
  const metaEn = metaParts.length ? metaParts.join(" · ") : "—";
  const codeDisp = code || "(See details)";
  const shortDisc = discount ? truncate(discount, 140) : codeDisp;
  const titleAr = brandAr || brand;

  return {
    badgeEn: badge,
    badgeAr,
    titleEn: brand,
    titleAr,
    descEn: desc,
    descAr: desc,
    discountEn: shortDisc,
    discountAr: shortDisc,
    metaEn,
    metaAr: metaEn,
    code: codeDisp,
  };
}

async function fetchCsv(gid) {
  const urls = [
    csvUrl(gid),
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`,
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ATMAD-coupon-sync/1.0)",
        },
        redirect: "follow",
      });
      const body = await res.text();
      if (!res.ok || body.trimStart().startsWith("<!DOCTYPE")) {
        lastErr = new Error(`HTTP ${res.status} from ${url}`);
        continue;
      }
      return parseCsv(body);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Could not export sheet gid=${gid}. ${lastErr?.message || lastErr}. ` +
      `Share → Anyone with the link → Viewer.`
  );
}

function parseUnifiedSheet(rows) {
  const layout = detectSheetLayout(rows);
  const items = [];
  const countryRows = [];
  const seenCountry = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = normRow(rows[i], 8);
    if (isHeaderRow(row)) continue;

    const brand = pickCol(row, layout.brand);
    const brandAr = pickCol(row, layout.brandAr);
    const website = pickCol(row, layout.website);
    const code = pickCol(row, layout.code);
    const status = pickCol(row, layout.status);
    const countries = pickCol(row, layout.countries);
    const discount = pickCol(row, layout.discount);

    if (!trimCell(brand) && !trimCell(code)) continue;

    const item = itemFromUnifiedRow(
      brand,
      brandAr,
      website,
      code,
      status,
      countries,
      discount
    );
    if (item) {
      if (!layout.hasArabicCol) applyCpanelDisplay(item, brand);
      items.push(item);
    }

    const b = trimCell(item?.titleEn || brand);
    const c = trimCell(code);
    const co = trimCell(countries);
    if (b && c && co) {
      const key = `${b.toLowerCase()}|${c.toLowerCase()}|${co.toLowerCase()}`;
      if (!seenCountry.has(key)) {
        seenCountry.add(key);
        countryRows.push([b, c, co]);
      }
    }
  }

  return { items, countryRows, layout };
}

function dedupeParsed(items, countryRows) {
  const beforeItems = items.length;
  const beforeCountry = countryRows.length;
  const dedupedItems = dedupeItems(items);
  const dedupedCountry = dedupeCountryRows(countryRows);
  const removedItems = beforeItems - dedupedItems.length;
  const removedCountry = beforeCountry - dedupedCountry.length;
  if (removedItems > 0 || removedCountry > 0) {
    console.log(
      `Deduped: removed ${removedItems} coupon row(s)` +
        (removedCountry ? `, ${removedCountry} country tag row(s)` : "")
    );
  }
  return { items: dedupedItems, countryRows: dedupedCountry };
}

function buildCouponsDataJs(countryRows, sheets) {
  const header =
    "// Auto-generated by scripts/sync-coupons-from-sheet.mjs — do not edit by hand.\n" +
    `// Source: https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${SHEET_GID}\n`;
  const countryBlock =
    "const ATMAD_COUNTRY_SHEET_ROWS = " +
    JSON.stringify(countryRows) +
    ";\n\n";
  const sheetsBlock =
    "const COUPON_SHEETS = " + JSON.stringify(sheets, null, 2) + ";\n\n";
  const footer = `if (typeof window !== "undefined") {
  if (typeof COUPON_SHEETS !== "undefined") window.COUPON_SHEETS = COUPON_SHEETS;
  if (typeof ATMAD_COUNTRY_SHEET_ROWS !== "undefined") {
    window.ATMAD_COUNTRY_SHEET_ROWS = ATMAD_COUNTRY_SHEET_ROWS;
  }
}
`;
  return header + countryBlock + sheetsBlock + footer;
}

async function main() {
  console.log(`Fetching sheet ${SHEET_ID} (gid=${SHEET_GID})…`);
  const rows = await fetchCsv(SHEET_GID);
  const parsed = parseUnifiedSheet(rows);
  const { items, countryRows } = dedupeParsed(parsed.items, parsed.countryRows);

  const sheets = [
    {
      tabEn: "ATMAD coupon list",
      tabAr: "قائمة أكواد ATMAD",
      items,
    },
  ];

  const layoutNote = parsed.layout.hasArabicCol
    ? " · Arabic names from sheet"
    : existsSync(CPANEL_NAMES_PATH)
      ? " · cPanel names applied (legacy 6-col sheet)"
      : "";
  console.log(
    `Parsed: ${items.length} active coupons, ${countryRows.length} country tag rows` +
      (INCLUDE_PAUSED ? " (including paused)" : " (paused excluded)") +
      layoutNote
  );

  if (CHECK_ONLY) {
    console.log("Sheet export OK (--check).");
    return;
  }

  writeFileSync(OUT_PATH, buildCouponsDataJs(countryRows, sheets), "utf8");
  console.log("Wrote", OUT_PATH);

  for (const script of [
    "scripts/generate-sitemap.mjs",
    "tools/generate-coupons-ar.cjs",
  ]) {
    const r = spawnSync("node", [join(ROOT, script)], {
      stdio: "inherit",
      cwd: ROOT,
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

/**
 * Pull coupon data from Google Sheets → coupons-data.js (+ sitemap.xml).
 *
 * Sheet columns (current layout):
 *   Brand | URL | Coupon code | Status | Countries | Code logic
 *
 * Requires readable export (link sharing → Viewer is enough for gviz CSV).
 *
 * Usage:
 *   node scripts/sync-coupons-from-sheet.mjs
 *   node scripts/sync-coupons-from-sheet.mjs --check
 *
 * Env: ATMAD_SHEET_ID, ATMAD_SHEET_GID (default gid=0)
 */
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_PATH = join(ROOT, "coupons-data.js");

const SHEET_ID =
  process.env.ATMAD_SHEET_ID || "1Vl31XJ3JVXW87IZq4NFI3mtO0LtXDXTvg8eo8lxWN5o";
const SHEET_GID = process.env.ATMAD_SHEET_GID || "0";
const CHECK_ONLY = process.argv.includes("--check");
const INCLUDE_PAUSED = process.argv.includes("--include-paused");

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
  return a.includes("advertiser name") || a === "brand" || a === "brand name";
}

function itemFromUnifiedRow(brand, website, code, status, countries, discount) {
  brand = trimCell(brand);
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

  return {
    badgeEn: badge,
    badgeAr,
    titleEn: brand,
    titleAr: brand,
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
  const items = [];
  const countryRows = [];
  const seenCountry = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = normRow(rows[i], 6);
    if (isHeaderRow(row)) continue;

    const [brand, website, code, status, countries, discount] = row;
    if (!trimCell(brand) && !trimCell(code)) continue;

    const item = itemFromUnifiedRow(
      brand,
      website,
      code,
      status,
      countries,
      discount
    );
    if (item) items.push(item);

    const b = trimCell(brand);
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

  return { items, countryRows };
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
  const { items, countryRows } = parseUnifiedSheet(rows);

  const sheets = [
    {
      tabEn: "ATMAD coupon list",
      tabAr: "قائمة أكواد ATMAD",
      items,
    },
  ];

  console.log(
    `Parsed: ${items.length} active coupons, ${countryRows.length} country tag rows` +
      (INCLUDE_PAUSED ? " (including paused)" : " (paused excluded)")
  );

  if (CHECK_ONLY) {
    console.log("Sheet export OK (--check).");
    return;
  }

  writeFileSync(OUT_PATH, buildCouponsDataJs(countryRows, sheets), "utf8");
  console.log("Wrote", OUT_PATH);

  const sitemap = spawnSync(
    "node",
    [join(ROOT, "scripts/generate-sitemap.mjs")],
    { stdio: "inherit", cwd: ROOT }
  );
  if (sitemap.status !== 0) process.exit(sitemap.status ?? 1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

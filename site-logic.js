const CATEGORY_RULES = [
  { id: "food", patterns: [/talabat/i, /deliveroo/i, /delivroo/i, /keeta/i, /yango/i, /right\s*bite/i, /now\s*now/i, /nownow/i, /grocery/i, /supermarket/i, /bakery/i, /butchery/i, /pharmacy.*coffee/i, /specialty\s*coffee/i] },
  { id: "travel", patterns: [/expedia/i, /almatar/i, /kafarat/i, /\bhotels?\b/i, /\bflights?\b/i, /agoda/i, /booking\.com/i] },
  { id: "beauty", patterns: [/iherb/i, /body\s*shop/i, /bodyshop/i, /bath\s*&\s*body/i, /sephora/i, /magrabi/i, /eyewa/i, /abdul\s*samad/i, /qurashi/i, /skincare/i, /cosmetics/i, /reef\s*perfume/i, /\boud\b/i, /izil/i] },
  { id: "electronics", patterns: [/dyson/i, /huawei/i, /hauwei/i, /shark\s*ninja/i, /shark ninja/i, /\bninja\b/i, /ace\s*hardware/i, /electronics/i, /geant/i, /extra\s*stores/i] },
  { id: "motherbaby", patterns: [/firstcry/i, /first\s*cry/i, /\bbaby\b/i, /mother\s*&\s*baby/i, /dabdoob/i, /\blego\b/i, /pottery\s*barn/i, /toddler/i, /infant/i] },
  { id: "fashion", patterns: [/namshi/i, /shein/i, /\bnoon\b/i, /crocs/i, /adidas/i, /\bgap\b/i, /under\s*armou?r/i, /bloomingdales/i, /max\s*fashion/i, /6th\s*street/i, /splash/i, /center\s*point/i, /centre\s*point/i, /asos/i, /vogacloet/i, /kiabi/i, /maje/i, /storeus/i, /gosport/i, /go\s*sport/i, /damas/i, /jewell?ery/i, /paris\s*gallery/i, /sporter/i, /sun\s*&\s*sand/i, /footwear/i, /apparel/i, /fashion/i, /sportswear/i, /swarovski/i, /platinumlist/i, /voga/i, /bloomingdale/i, /underarmou?r/i, /reebok/i, /6thstreet/i] }
];
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function extractHttpUrls(s) {
  if (s == null || s === "" || s === "—") return [];
  const re = /https?:\/\/[^\s<>'"]+/gi;
  const raw = String(s).match(re) || [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i++) {
    let u = raw[i].replace(/[.,;:!?)}\]]+$/u, "");
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      if (!seen.has(parsed.href)) {
        seen.add(parsed.href);
        out.push(parsed.href);
      }
    } catch (e) {
      /* ignore invalid */
    }
  }
  return out;
}

function stripUrlsFromMetaText(metaText) {
  if (!metaText || metaText === "—") return "";
  const urls = extractHttpUrls(metaText);
  let t = metaText;
  for (let i = 0; i < urls.length; i++) {
    t = t.split(urls[i]).join("");
  }
  return t.replace(/\n\s*\n/g, "\n").replace(/^\s+|\s+$/g, "").trim();
}

function urlsForCoupon(c, lang) {
  const metaCandidates = [
    lang === "ar" ? c.metaAr : c.metaEn,
    c.metaEn,
    c.metaAr
  ];
  for (let i = 0; i < metaCandidates.length; i++) {
    const u = extractHttpUrls(metaCandidates[i]);
    if (u.length) return u;
  }
  const descBlocks = [
    [lang === "ar" ? c.descAr : c.descEn, lang === "ar" ? c.discountAr : c.discountEn],
    [c.descEn, c.discountEn],
    [c.descAr, c.discountAr]
  ];
  for (let i = 0; i < descBlocks.length; i++) {
    const u = extractHttpUrls(String(descBlocks[i][0] || "") + "\n" + String(descBlocks[i][1] || ""));
    if (u.length) return u;
  }
  return [];
}

function hasArabicScript(s) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(String(s || ""));
}

function offerStringHash(s) {
  const t = String(s || "");
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function curatedArOfferLine(en) {
  const e = polishText(String(en || "").replace(/\r\n/g, "\n"));
  if (!e || e === "—") return null;
  const tbl = typeof window !== "undefined" && window.ATMAD_AR_OFFER ? window.ATMAD_AR_OFFER : null;
  if (!tbl) return null;
  const hit = tbl[offerStringHash(e)];
  if (hit == null || hit === "") return null;
  return hit;
}

function fieldTextEqualsOfferFields(a, b) {
  return collapseWs(a).toLowerCase() === collapseWs(b).toLowerCase();
}

function translateOfferString(en, lang) {
  if (lang !== "ar") return polishText(en || "");
  const e = polishText(en || "");
  if (!e || e === "—") return e;
  const curated = curatedArOfferLine(en);
  if (curated != null) return curated;
  return autoTranslateRetailOfferText(en);
}

/** When sheet `descAr`/`discountAr` duplicate English, synthesize readable Arabic for the coupons UI. */
function autoTranslateRetailOfferText(raw) {
  let t = polishText(raw);
  if (!t || t === "—") return t === "—" ? "—" : "";
  if (hasArabicScript(t)) return t;
  t = String(t).replace(/\r\n/g, "\n").replace(/\u00A0/g, " ");
  const pairs = [
    [/\bnew\s+user\s*[-–—:]\s*(\d+)\s*%/gi, "مستخدم جديد: $1٪"],
    [/\breturning\s*[-–—:]\s*(\d+)\s*%/gi, "للعائدين: $1٪"],
    [/\bup\s+to\s+(\d+)\s*%\s*off\b/gi, "خصم يصل إلى $1٪"],
    [/\b(\d+)\s*%\s*off\s+on\s+all\s+products?\b/gi, "خصم $1٪ على جميع المنتجات"],
    [/\b(\d+)\s*%\s*off\s+site[\s-]*wide\b/gi, "خصم $1٪ على الموقع بالكامل"],
    [/\b(\d+)\s*%\s*off\b/gi, "خصم $1٪"],
    [/\b(\d+)\s*%\s*discount\b/gi, "خصم $1٪"],
    [/\bup\s+to\s+(\d+)\s*%/gi, "يصل إلى $1٪"],
    [/\b(\d+)\s*%\s*\+\s*(\d+)\s*%/gi, "$1٪ + $2٪"],
    [/\bsite[\s-]*wide\b/gi, "على الموقع بالكامل"],
    [/\bfree\s+shipping\b/gi, "شحن مجاني"],
    [/\bfree\s+delivery\b/gi, "توصيل مجاني"],
    [/\bfree\s+assembly\b/gi, "تركيب مجاني"],
    [/\bfirst\s+order\b/gi, "الطلب الأول"],
    [/\bfirst\s+purchase\b/gi, "أول عملية شراء"],
    [/\bmin(?:imum)?\.?\s*order\b/gi, "حد أدنى للطلب"],
    [/\bnew\s+customers?\b/gi, "عملاء جدد"],
    [/\bexisting\s+customers?\b/gi, "عملاء حاليون"],
    [/\bnew\s+user\b/gi, "مستخدم جديد"],
    [/\breturning\s+(?:user|customer)s?\b/gi, "للعائدين"],
    [/\breturning\b/gi, "للعائدين"],
    [/\bon\s+all\s+products?\b/gi, "على جميع المنتجات"],
    [/\bon\s+everything\b/gi, "على كل المنتجات"],
    [/\bon\s+selected\s+items?\b/gi, "على منتجات مختارة"],
    [/\bselected\s+items?\b/gi, "منتجات مختارة"],
    [/\ball\s+items?\b/gi, "جميع المنتجات"],
    [/\bapply\s+(?:at\s+)?checkout\b/gi, "يُطبَّق عند الدفع"],
    [/\bat\s+checkout\b/gi, "عند الدفع"],
    [/\bterms\s*(?:&|and)\s*conditions\b/gi, "الشروط والأحكام"],
    [/\blimited\s+time\b/gi, "لفترة محدودة"],
    [/\bwhile\s+stocks?\s+last\b/gi, "حتى نفاد الكمية"],
    [/\bone\s+code\s+per\s+order\b/gi, "كود واحد لكل طلب"],
    [/\bpromo(?:tional)?\s+code\b/gi, "كود خصم"],
    [/\bcoupon\s+code\b/gi, "كوبون"],
    [/\bclick\s+here\b/gi, "اضغط هنا"],
    [/\boffer\b/gi, "عرض"],
    [/\bdiscount\b/gi, "خصم"],
    [/\bunited\s+arab\s+emirates\b/gi, "الإمارات"],
    [/\bu\.?a\.?e\.?\b/gi, "الإمارات"],
    [/\bUAE\b/g, "الإمارات"],
    [/\bKSA\b/g, "السعودية"],
    [/\bkingdom\s+of\s+saudi\b/gi, "السعودية"],
    [/\bSaudi\s+Arabia\b/gi, "السعودية"],
    [/\bKuwait\b/gi, "الكويت"],
    [/\bKWT\b/g, "الكويت"],
    [/\bQatar\b/gi, "قطر"],
    [/\bQAT\b/g, "قطر"],
    [/\bBahrain\b/gi, "البحرين"],
    [/\bBHR\b/g, "البحرين"],
    [/\bOman\b/gi, "عُمان"],
    [/\bOMN\b/g, "عُمان"],
    [/\bEgypt\b/gi, "مصر"],
    [/\bEGY(?:PT)?\b/g, "مصر"],
    [/\bJordan\b/gi, "الأردن"],
    [/\bJOR\b/g, "الأردن"],
    [/\bFrance\b/gi, "فرنسا"],
    [/\bFRA\b/g, "فرنسا"],
    [/\bUSA\b/g, "الولايات المتحدة"],
    [/\bMiddle\s+East\b/gi, "الشرق الأوسط"],
    [/\bMENA\b/g, "الشرق الأوسط وشمال أفريقيا"],
    [/\bGCC\b/g, "دول الخليج"],
    [/\bglobal\b/gi, "عالمي"],
    [/\ball\s+countries\b/gi, "جميع الدول"],
    [/\bworldwide\b/gi, "عالميًا"],
    [/\belectronics\b/gi, "إلكترونيات"],
    [/\bpromotional\s+items?\b/gi, "منتجات ترويجية"],
    [/\bpromotional\s+services?\b/gi, "خدمات ترويجية"],
    [/\bi\.?\s*e\.?\s/gi, "أي "],
    [/\be\.?\s*g\.?\s/gi, "مثل "],
    [/\bsubscriptions?\b/gi, "اشتراكات"],
    [/\s+\band\s+\b/gi, " و "],
    [/\bcosmetics?\b/gi, "مستحضرات تجميل"],
    [/\bskincare\b/gi, "العناية بالبشرة"],
    [/\bfashion\b/gi, "أزياء"],
    [/\bbeauty\b/gi, "تجميل"],
    [/\bapparel\b/gi, "ملابس"],
    [/\bfootwear\b/gi, "أحذية"],
    [/\bjewell?ery\b/gi, "مجوهرات"],
    [/\bperfume\b/gi, "عطور"],
    [/\bgrocery\b/gi, "بقالة"],
    [/\bsee\s+store\s+for\s+terms\.?\b/gi, "راجع شروط المتجر."],
    [/\bcashback\b/gi, "استرداد نقدي"],
    [/\bexcluding\b/gi, "باستثناء"],
    [/\bexcludes?\b/gi, "يستثني"],
    [/\bsitewide\b/gi, "على الموقع بالكامل"],
    [/\bfull[\s-]*price\b/gi, "السعر الكامل"],
    [/\bon\s+sale\b/gi, "في التخفيضات"],
    [/\bsale\s+items?\b/gi, "منتجات التخفيض"],
    [/\bdiscounted\s+items?\b/gi, "منتجات مخفّضة"],
    [/\bnon[\s-]*discounted\b/gi, "غير المخفّضة"],
    [/\bupto\b/gi, "حتى"],
    [/\bflat\b/gi, "خصم ثابت"],
    [/\bold\s+user\b/gi, "مستخدم قديم"],
    [/\bnew\s*:\s*/gi, "جديد: "],
    [/\bold\s*:\s*/gi, "قديم: "],
    [/\bget\s+(\d+)\s*%\s*off\b/gi, "احصل على خصم $1٪"],
    [/\bget\s+up\s+to\s+(\d+)\s*%\s*off\b/gi, "احصل على خصم يصل إلى $1٪"],
    [/\bget\s+extra\s+(\d+)\s*%\s*off\b/gi, "احصل على خصم إضافي $1٪"],
    [/\bget\s+(\d+)\s*%\s*discount\b/gi, "احصل على خصم $1٪"],
    [/\bon\s+all\s+orders?\b/gi, "على جميع الطلبات"],
    [/\bon\s+orders?\b/gi, "على الطلبات"],
    [/\bfor\s+all\s+users?\b/gi, "لجميع المستخدمين"],
    [/\bold\s+and\s+new\s+users?\b/gi, "المستخدمون الجدد والقدامى"],
    [/\bnew\s+and\s+returning\s+users?\b/gi, "مستخدمو جدد وعائدون"],
    [/\bpharmacy\b/gi, "صيدلية"]
  ];
  let x = t;
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < pairs.length; i++) {
      x = x.replace(pairs[i][0], pairs[i][1]);
    }
  }
  x = x.replace(/(\d+)\s*%/g, "$1٪");
  x = x.replace(/خصم\s+خصم/gi, "خصم");
  x = x
    .split("\n")
    .map(function (line) {
      return line.replace(/\s+/g, " ").replace(/\s*([،,.:;·])\s*/g, "$1 ").trim();
    })
    .join("\n");
  return beautifyText(x);
}

function localizedOfferField(en, ar, lang) {
  const e = polishText(en || "");
  const a = polishText(ar || "");
  if (lang !== "ar") return e;
  if ((!e || e === "—") && (!a || a === "—")) return "—";
  if (hasArabicScript(a) && !fieldTextEqualsOfferFields(e, a)) return a;
  if (!e || e === "—") return translateOfferString(a, "ar");
  return translateOfferString(e, "ar");
}

function couponFieldsForDisplay(c, lang) {
  return {
    desc: localizedOfferField(c.descEn, c.descAr, lang),
    discount: localizedOfferField(c.discountEn, c.discountAr, lang),
    meta: localizedOfferField(c.metaEn, c.metaAr, lang)
  };
}

function displayCodeParts(code) {
  const parts = String(code || "")
    .split(/\s*\/\s*|\s*&\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const one = polishText(code);
  return parts.length ? parts : one ? [one] : [];
}

function externalLinkIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6");
  const poly = document.createElementNS(ns, "polyline");
  poly.setAttribute("points", "15 3 21 3 21 9");
  const line = document.createElementNS(ns, "line");
  line.setAttribute("x1", "10");
  line.setAttribute("y1", "14");
  line.setAttribute("x2", "21");
  line.setAttribute("y2", "3");
  svg.appendChild(p);
  svg.appendChild(poly);
  svg.appendChild(line);
  return svg;
}

function collapseWs(s) {
  return polishText(s || "").replace(/\s+/g, " ").trim();
}

/** NBSP, thin space, etc. + unicode dash variants → plain space (before lowercasing). */
function foldUnicodeBrandInput(s) {
  let t = String(s || "");
  if (typeof t.normalize === "function") {
    try {
      t = t.normalize("NFKC");
    } catch (e) {}
  }
  return t
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, " ");
}

function normalizeBrandKey(title) {
  return foldUnicodeBrandInput(title)
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, function (_, inner) {
      return inner.length < 40 ? " " : "(" + inner + ")";
    })
    .replace(/\s+promote code with link\s*/i, "")
    .replace(/\bllc\b\.?/gi, "")
    .replace(/\./g, "")
    .replace(/[^\w\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Manual synonyms when display pack is absent or keys are not duplicated there (compact, no spaces). */
const ATMAD_BRAND_KEY_CANONICAL = {
  doctornutrition: "dr nutrition",
  drnutrition: "dr nutrition"
};

let _brandPrimaryByNormKey = null;
let _brandPrimaryByCompact = null;

function buildBrandPrimaryKeyCache() {
  _brandPrimaryByNormKey = Object.create(null);
  _brandPrimaryByCompact = Object.create(null);
  const pack =
    typeof window !== "undefined" && window.ATMAD_BRAND_DISPLAY && window.ATMAD_BRAND_DISPLAY.en;
  if (!pack) return;
  const byDisp = Object.create(null);
  for (const key of Object.keys(pack)) {
    const disp = String(pack[key] || "").toLowerCase().trim();
    if (!disp) continue;
    if (!byDisp[disp] || key.length < byDisp[disp].length) byDisp[disp] = key;
  }
  for (const key of Object.keys(pack)) {
    const disp = String(pack[key] || "").toLowerCase().trim();
    const primary = (disp && byDisp[disp]) || key;
    _brandPrimaryByNormKey[key] = primary;
    _brandPrimaryByCompact[key.replace(/\s+/g, "")] = primary;
  }
}

function brandPrimaryLookupKeyFromPack(normKey) {
  const pack =
    typeof window !== "undefined" && window.ATMAD_BRAND_DISPLAY && window.ATMAD_BRAND_DISPLAY.en;
  if (!pack) return null;
  if (!_brandPrimaryByNormKey) buildBrandPrimaryKeyCache();
  const norm = String(normKey || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (_brandPrimaryByNormKey[norm]) return _brandPrimaryByNormKey[norm];
  const compact = norm.replace(/\s+/g, "");
  if (_brandPrimaryByCompact[compact]) return _brandPrimaryByCompact[compact];
  return null;
}

function canonicalBrandLookupKey(k) {
  const norm = String(k || "").replace(/\s+/g, " ").trim().toLowerCase();
  const compact = norm.replace(/\s+/g, "");
  if (ATMAD_BRAND_KEY_CANONICAL[compact]) return ATMAD_BRAND_KEY_CANONICAL[compact];
  const primary = brandPrimaryLookupKeyFromPack(norm);
  if (primary) return primary;
  return norm;
}

/** Prefer sheet field for `lang`, but fall back to the other language so lookups (e.g. ATMAD_BRAND_DISPLAY.ar) still work when titleAr is empty. */
function couponBrandTitleForDisplay(c, lang) {
  if (!c) return "";
  const en = String(c.titleEn || "").trim();
  const ar = String(c.titleAr || "").trim();
  const src = lang === "ar" ? ar || en : en || ar;
  return brandTitleForDisplay(src, lang);
}

function brandTitleForDisplay(title, lang) {
  const t = String(title || "").trim();
  if (!t) return t;
  const k = canonicalBrandLookupKey(normalizeBrandKey(t));
  const pack = window.ATMAD_BRAND_DISPLAY;
  if (pack) {
    const branch = lang === "ar" ? pack.ar : pack.en;
    if (branch && branch[k]) return branch[k];
    if (branch) {
      const kc = k.replace(/\s+/g, "");
      if (kc.length >= 2) {
        for (const dk of Object.keys(branch)) {
          if (dk.replace(/\s+/g, "") === kc) return branch[dk];
        }
      }
    }
  }
  if (k === "dr nutrition") return "Dr Nutrition";
  return t;
}

function resolveBrandDomain(title) {
  const map = window.ATMAD_BRAND_DOMAINS || {};
  const k = canonicalBrandLookupKey(normalizeBrandKey(title));
  if (!k) return null;
  if (map[k]) return map[k];
  const kCompact = k.replace(/\s+/g, "");
  if (kCompact.length >= 2) {
    let compactVal = null;
    let compactKeyLen = 0;
    for (const key of Object.keys(map)) {
      if (key.replace(/\s+/g, "") !== kCompact) continue;
      if (key.length > compactKeyLen) {
        compactKeyLen = key.length;
        compactVal = map[key];
      }
    }
    if (compactVal) return compactVal;
  }
  let best = null;
  let bestLen = 0;
  for (const key of Object.keys(map)) {
    if (key.length < 3) continue;
    if (k === key || (k.includes(key) && key.length >= 4)) {
      if (key.length > bestLen) {
        bestLen = key.length;
        best = map[key];
      }
    }
  }
  if (best) return best;
  for (const key of Object.keys(map)) {
    if (k.length >= 5 && key.includes(k) && key.length > bestLen) {
      bestLen = key.length;
      best = map[key];
    }
  }
  return best;
}

/** Hostnames not useful for storefront favicons (app stores, short links, social). */
function isBlockedLogoHost(host) {
  if (!host) return true;
  const h = String(host).toLowerCase().replace(/\.$/, "");
  if (/^www\./.test(h)) return isBlockedLogoHost(h.slice(4));
  if (
    /^(play\.google\.com|apps\.apple\.com|app\.adjust\.com|app\.link|appsflyer\.com)$/.test(h)
  )
    return true;
  if (/^(bit\.ly|goo\.gl|tinyurl\.com|t\.co|ow\.ly)$/.test(h)) return true;
  if (
    /^(facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|youtu\.be|youtube\.com|linkedin\.com|wa\.me|api\.whatsapp\.com)$/.test(
      h
    )
  )
    return true;
  return false;
}

function hostFromHttpUrl(url) {
  try {
    let host = new URL(url).hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch (e) {
    return null;
  }
}

/** When the brand name is not in ATMAD_BRAND_DOMAINS, use the store URL from meta/description (first usable host). */
function inferBrandDomainFromCoupon(c) {
  if (!c) return null;
  for (let li = 0; li < 2; li++) {
    const urls = urlsForCoupon(c, li === 0 ? "en" : "ar");
    for (let i = 0; i < urls.length; i++) {
      const host = hostFromHttpUrl(urls[i]);
      if (host && !isBlockedLogoHost(host)) return host;
    }
  }
  return null;
}

function resolveCouponBrandDomain(c) {
  const titleEn = (c && c.titleEn) || "";
  const titleAr = (c && c.titleAr) || "";
  const forMap = brandTitleForDisplay(titleEn || titleAr, "en");
  return resolveBrandDomain(forMap) || inferBrandDomainFromCoupon(c);
}

function normalizeBrandLogoDomain(domain) {
  if (!domain) return "";
  let d = String(domain)
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0]
    .toLowerCase();
  if (d.startsWith("www.")) d = d.slice(4);
  return d;
}

/** Paths from our server: root-relative /assets/... breaks on file://; fix at runtime. */
function absolutizeSiteAssetPath(path) {
  const s = String(path || "").trim();
  if (!s || /^https?:\/\//i.test(s)) return s;
  if (typeof location === "undefined") return s;
  if (location.protocol === "file:") return s.replace(/^\/+/, "");
  if (s.startsWith("/")) return (location.origin || "") + s;
  return (location.origin || "") + "/" + s.replace(/^\/+/, "");
}

function isSameSiteAssetPath(path) {
  const s = String(path || "");
  return s.startsWith("/assets/") || s.startsWith("assets/");
}

/**
 * Ordered list of logo URLs (brand marks first, then high-res favicons).
 * Optional window.ATMAD_BRAND_LOGO_BY_DOMAIN[hostname] = string or string[] of image URLs.
 */
function brandLogoUrlCandidates(domain) {
  const d = normalizeBrandLogoDomain(domain);
  if (!d) return [];
  const overrides = window.ATMAD_BRAND_LOGO_BY_DOMAIN || {};
  const custom = overrides[d];
  const list = [];
  if (custom) {
    const parts = Array.isArray(custom) ? custom : [custom];
    for (let i = 0; i < parts.length; i++) {
      const u = parts[i];
      if (!u) continue;
      list.push(isSameSiteAssetPath(u) ? absolutizeSiteAssetPath(u) : u);
    }
  }
  list.push(
    "https://logo.clearbit.com/" + encodeURIComponent(d),
    "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=" +
      encodeURIComponent("https://" + d + "/") +
      "&size=128",
    "https://www.google.com/s2/favicons?sz=128&domain=" + encodeURIComponent(d),
    "https://icons.duckduckgo.com/ip3/" + encodeURIComponent(d) + ".ico"
  );
  return list;
}

/** First candidate only (e.g. static previews). Prefer bindBrandLogoWithFallback for <img>. */
function brandFaviconUrl(domain) {
  const urls = brandLogoUrlCandidates(domain);
  return urls.length ? urls[0] : "";
}

/**
 * Set img.src to best available logo; on final failure call onAllFailed (e.g. show initials).
 */
function bindBrandLogoWithFallback(img, domain, onAllFailed) {
  const urls = brandLogoUrlCandidates(domain);
  if (!urls.length) {
    if (onAllFailed) onAllFailed();
    return;
  }
  let index = 0;
  function onError() {
    index++;
    if (index >= urls.length) {
      img.removeEventListener("error", onError);
      if (onAllFailed) onAllFailed();
      return;
    }
    img.src = urls[index];
  }
  img.addEventListener("error", onError);
  img.src = urls[0];
}

function brandInitials(title) {
  const clean = String(title || "").replace(/\([^)]*\)/g, "").replace(/[^a-zA-Z0-9\s]/g, " ");
  const w = clean.split(/\s+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  if (w.length === 1 && w[0].length >= 2) return w[0].slice(0, 2).toUpperCase();
  return "?";
}

function beautifyText(s) {
  if (s == null || s === "") return "";
  let t = String(s).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.split("\n").map((line) => line.replace(/[\t ]+/g, " ").trim()).join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/\s+([.,;:!?])/g, "$1");
  return t.trim();
}

function polishText(s) {
  let t = beautifyText(s);
  if (!t) return "";
  t = t
    .replace(/Subsci\s+ptions/gi, "Subscriptions")
    .replace(/Subsci ptions/gi, "Subscriptions")
    .replace(/HeaIthy/gi, "Healthy")
    .replace(/Subsci\s*ptions/gi, "Subscriptions");
  return t.trim();
}

function codeMatchesField(text, code) {
  if (!text || !code) return false;
  const t = collapseWs(polishText(String(text)))
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "");
  const c = collapseWs(polishText(String(code)))
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "");
  if (!t || !c) return false;
  return t === c;
}

function stripTruncationMarks(s) {
  return String(s || "").replace(/[\u2026]+$/g, "").replace(/\.{2,}\s*$/g, "").trim();
}

function pickPrimaryOfferText(desc, discount, code) {
  let a = polishText(desc || "");
  let b = polishText(stripTruncationMarks(discount || ""));
  if (codeMatchesField(b, code)) b = "";
  if (codeMatchesField(a, code)) a = "";
  if (!a) return b;
  if (!b) return a;
  const ca = collapseWs(a);
  const cb = collapseWs(b);
  if (ca === cb) return a;
  if (ca.startsWith(cb) || cb.startsWith(ca)) return a.length >= b.length ? a : b;
  return a.length >= b.length ? a : b;
}

function secondaryOfferLine(desc, discount, code) {
  const a = polishText(desc || "");
  const b = polishText(stripTruncationMarks(discount || ""));
  if (codeMatchesField(b, code)) return "";
  if (!a || !b) return "";
  const ca = collapseWs(a);
  const cb = collapseWs(b);
  if (ca === cb) return "";
  if (ca.startsWith(cb) || cb.startsWith(ca)) return "";
  if (cb.length < 88 && ca.indexOf(cb) < 0) return b;
  return "";
}

function formatOfferBlockHtml(text) {
  const t = polishText(text);
  if (!t) return "";
  const byNl = t.split(/\n/).map((x) => x.trim()).filter(Boolean);
  if (byNl.length >= 2) {
    const flat = t.replace(/\n/g, "");
    const preferLines = !/,/.test(flat) || byNl.every((line) => line.length < 120);
    if (preferLines) {
      return (
        '<ul class="coupon-detail-list">' +
        byNl.map((seg) => "<li>" + esc(seg) + "</li>").join("") +
        "</ul>"
      );
    }
  }
  const segments = t.split(/\s*[,،;؛]\s*/).map((x) => x.trim()).filter(Boolean);
  const looksLikeOfferList =
    segments.length >= 2 &&
    segments.length <= 14 &&
    segments.every((seg) => seg.length <= 160) &&
    (segments.length >= 3 || segments.some((seg) => /%|\d+\s*%\s*off|-\s*\d+%/i.test(seg)));
  if (looksLikeOfferList) {
    return (
      '<ul class="coupon-detail-list">' +
      segments.map((seg) => "<li>" + esc(seg) + "</li>").join("") +
      "</ul>"
    );
  }
  return '<div class="coupon-body-text">' + esc(t) + "</div>";
}

function couponHaystack(c) {
  return [
    c.titleEn, c.titleAr,
    c.descEn, c.descAr,
    c.discountEn, c.discountAr,
    c.metaEn, c.metaAr,
    c.code, c.badgeEn
  ].join(" ").toLowerCase();
}

function inferCategory(c) {
  const hay = couponHaystack(c);
  for (let i = 0; i < CATEGORY_RULES.length; i++) {
    const { id, patterns } = CATEGORY_RULES[i];
    for (let j = 0; j < patterns.length; j++) {
      if (patterns[j].test(hay)) return id;
    }
  }
  return "other";
}

let _countryLookup = null;
function countryLookupTable() {
  if (_countryLookup) return _countryLookup;
  _countryLookup = Object.create(null);
  const rows =
    typeof window !== "undefined" && window.ATMAD_COUNTRY_SHEET_ROWS
      ? window.ATMAD_COUNTRY_SHEET_ROWS
      : typeof ATMAD_COUNTRY_SHEET_ROWS !== "undefined"
        ? ATMAD_COUNTRY_SHEET_ROWS
        : [];
  for (let i = 0; i < rows.length; i++) {
    const brand = rows[i][0];
    const coupon = rows[i][1];
    const countries = rows[i][2];
    const bk = normalizeBrandKey(brand).replace(/\s+/g, "");
    const parts = String(coupon).split(/\s*\/\s*|\s*&\s+/).map((s) => s.trim()).filter(Boolean);
    for (let j = 0; j < parts.length; j++) {
      const ck = parts[j].replace(/\s+/g, "").toUpperCase();
      const key = bk + "|" + ck;
      if (!_countryLookup[key]) _countryLookup[key] = countries;
    }
  }
  return _countryLookup;
}

function parseCountriesFromTagString(s) {
  if (!s || !String(s).trim()) return [];
  const t = String(s).trim();
  const lo = t.toLowerCase();
  if (lo.includes("all countries")) return ["All countries"];
  if (/^global$/i.test(lo) && t.length < 48) return ["Global"];
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const x = String(raw).replace(/\.$/, "").trim();
    if (x.length < 2 || /^click here/i.test(x)) return;
    const key = x.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(x);
  };
  const norm = t.replace(/\./g, " ");
  const re = /\b(GCC|MENA|GLOBAL|UAE|KSA|KWT|QAT|BHR|OMN|OM|EGY|EGYPT|JOR|FRA|USA|BH|KW|QA|SA|ARE|SAU|EG|BAHRAIN|QATAR|OMAN)\b/gi;
  let m;
  const hits = [];
  re.lastIndex = 0;
  while ((m = re.exec(norm)) !== null) hits.push(m[1].toUpperCase());
  if (hits.length) {
    hits.forEach(add);
    return out;
  }
  norm.split(/,|·|;/).forEach((seg) => {
    seg.split(/\s+/).filter(Boolean).forEach(add);
  });
  return out;
}

function countryTagsForCoupon(c) {
  const lookup = countryLookupTable();
  const brandKeys = [];
  const b1 = normalizeBrandKey(brandTitleForDisplay(c.titleEn, "en")).replace(/\s+/g, "");
  const b2 = normalizeBrandKey(brandTitleForDisplay(c.titleAr, "ar")).replace(/\s+/g, "");
  if (b1) brandKeys.push(b1);
  if (b2 && b2 !== b1) brandKeys.push(b2);
  const codeParts = String(c.code || "")
    .split(/\s*\/\s*|\s*&\s*|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const gathered = [];
  const seen = new Set();
  for (let bi = 0; bi < brandKeys.length; bi++) {
    for (let ci = 0; ci < codeParts.length; ci++) {
      const ck = codeParts[ci].replace(/\s+/g, "").toUpperCase();
      const raw = lookup[brandKeys[bi] + "|" + ck];
      if (!raw) continue;
      parseCountriesFromTagString(raw).forEach((tag) => {
        const k = tag.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        gathered.push(tag);
      });
    }
  }
  return gathered;
}

function stemBrandForDedup(title) {
  const k = canonicalBrandLookupKey(normalizeBrandKey(title))
    .replace(/\b(hardware|app|gcc)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return k;
}

function couponCodeTokens(code) {
  return String(code || "")
    .split(/\s*\/\s*|\s*&\s*|\n+/)
    .map((p) => polishText(p).replace(/\s+/g, "").toLowerCase())
    .filter(Boolean);
}

function couponCodesOverlap(codeA, codeB) {
  const a = couponCodeTokens(codeA);
  const b = couponCodeTokens(codeB);
  if (!a.length || !b.length) return false;
  const sb = new Set(b);
  for (let i = 0; i < a.length; i++) if (sb.has(a[i])) return true;
  return false;
}

function mergeCouponCodes(a, b) {
  const order = [];
  const seen = new Set();
  const pushPart = (raw) => {
    const t = String(raw).trim();
    if (!t) return;
    const k = t.replace(/\s+/g, "").toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    order.push(t);
  };
  String(a || "").split(/\s*\/\s*|\s*&\s*/).forEach(pushPart);
  String(b || "").split(/\s*\/\s*|\s*&\s*/).forEach(pushPart);
  return order.length ? order.join(" / ") : polishText(a || b || "");
}

function preferRicherMeta(x, y) {
  const hasUrl = (s) => /https?:\/\//i.test(String(s || ""));
  const sx = String(x || "");
  const sy = String(y || "");
  if (hasUrl(sy) && !hasUrl(sx)) return y;
  if (sy.length > sx.length && y && y !== "—") return y;
  return x && x !== "—" ? x : y || "—";
}

function mergeTwoCoupons(primary, incoming) {
  const pickTitle = (a, b) => ((b || "").length > (a || "").length ? b : a);
  return {
    badgeEn: primary.badgeEn,
    badgeAr: primary.badgeAr,
    titleEn: pickTitle(primary.titleEn, incoming.titleEn),
    titleAr: pickTitle(primary.titleAr, incoming.titleAr),
    descEn: pickTitle(primary.descEn, incoming.descEn),
    descAr: pickTitle(primary.descAr, incoming.descAr),
    discountEn:
      (incoming.discountEn || "").length > (primary.discountEn || "").length && incoming.discountEn !== "—"
        ? incoming.discountEn
        : primary.discountEn,
    discountAr:
      (incoming.discountAr || "").length > (primary.discountAr || "").length && incoming.discountAr !== "—"
        ? incoming.discountAr
        : primary.discountAr,
    metaEn: preferRicherMeta(primary.metaEn, incoming.metaEn),
    metaAr: preferRicherMeta(primary.metaAr, incoming.metaAr),
    code: mergeCouponCodes(primary.code, incoming.code)
  };
}

function findMergeableCouponIndex(list, c) {
  const stem = stemBrandForDedup(brandTitleForDisplay(c.titleEn, "en"));
  for (let i = 0; i < list.length; i++) {
    if (stemBrandForDedup(brandTitleForDisplay(list[i].titleEn, "en")) !== stem) continue;
    if (couponCodesOverlap(list[i].code, c.code)) return i;
  }
  return -1;
}

const COUNTRY_TAG_LABEL_AR = {
  UAE: "الإمارات",
  KSA: "السعودية",
  KWT: "الكويت",
  QAT: "قطر",
  BHR: "البحرين",
  BH: "البحرين",
  BAHRAIN: "البحرين",
  QATAR: "قطر",
  OMAN: "عُمان",
  OMN: "عُمان",
  OM: "عُمان",
  EGY: "مصر",
  EGYPT: "مصر",
  JOR: "الأردن",
  FRA: "فرنسا",
  USA: "الولايات المتحدة",
  ARE: "الإمارات",
  SAU: "السعودية",
  KW: "الكويت",
  QA: "قطر",
  SA: "السعودية",
  EG: "مصر",
  GCC: "الخليج",
  MENA: "الشرق الأوسط",
  GLOBAL: "عالمي"
};

function formatCountryTagLabel(tok) {
  const lang = typeof window !== "undefined" && window.atmadLang ? window.atmadLang : "en";
  const u = String(tok).toUpperCase();
  if (u === "ALL COUNTRIES") return lang === "ar" ? "كل الدول" : "All countries";
  if (lang === "ar" && COUNTRY_TAG_LABEL_AR[u]) return COUNTRY_TAG_LABEL_AR[u];
  if (u === "EGYPT") return lang === "ar" ? "مصر" : "Egypt";
  return tok;
}

function isComingSoonCoupon(c) {
  const hay = [
    c.titleEn,
    c.titleAr,
    c.descEn,
    c.descAr,
    c.discountEn,
    c.discountAr
  ]
    .join(" ")
    .toLowerCase();
  return /\bcoming\s+soon\b/i.test(hay);
}

function buildAllCoupons() {
  const sheets =
    typeof window !== "undefined" && window.COUPON_SHEETS
      ? window.COUPON_SHEETS
      : typeof COUPON_SHEETS !== "undefined"
        ? COUPON_SHEETS
        : null;
  if (!sheets || !sheets.length) {
    if (typeof console !== "undefined" && console.error) {
      console.error("Atmad: COUPON_SHEETS is missing or empty (is coupons-data.js loaded?).");
    }
    return [];
  }
  const list = [];
  sheets.forEach((sheet) => {
    sheet.items.forEach((raw) => {
      const c = {
        badgeEn: raw.badgeEn,
        badgeAr: raw.badgeAr,
        titleEn: polishText(raw.titleEn),
        titleAr: polishText(raw.titleAr),
        descEn: polishText(raw.descEn),
        descAr: polishText(raw.descAr),
        discountEn: polishText(raw.discountEn),
        discountAr: polishText(raw.discountAr),
        metaEn: polishText(raw.metaEn),
        metaAr: polishText(raw.metaAr),
        code: polishText(raw.code).replace(/\s*\/\s*/g, " / ")
      };
      const j = findMergeableCouponIndex(list, c);
      if (j < 0) list.push(c);
      else list[j] = mergeTwoCoupons(list[j], c);
    });
  });
  const merged = list.filter((c) => !isComingSoonCoupon(c));
  merged.forEach((coupon) => {
    coupon._category = inferCategory(coupon);
    coupon._countryTags = countryTagsForCoupon(coupon);
  });
  return expandCouponsOneCodePerCard(merged);
}

function expandCouponsOneCodePerCard(merged) {
  const out = [];
  for (let i = 0; i < merged.length; i++) {
    const c = merged[i];
    const parts = displayCodeParts(c.code);
    if (parts.length <= 1) {
      out.push(c);
      continue;
    }
    for (let j = 0; j < parts.length; j++) {
      const row = Object.assign({}, c, { code: parts[j] });
      row._category = inferCategory(row);
      row._countryTags = countryTagsForCoupon(row);
      out.push(row);
    }
  }
  return out;
}

function slugifyBrand(title) {
  let s = normalizeBrandKey(title)
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "brand";
}

/** Fallback when brand-logos.js is absent; keeps pretty URLs like /doctor-nutrition resolving. */
const INTERNAL_LEGACY_BRAND_SLUG = {
  "doctor-nutrition": "dr-nutrition",
  vogacloet: "vogacloset",
  almaithly: "almaithali"
};

function canonicalBrandSlugFromUrl(slug) {
  const s = String(slug || "").toLowerCase();
  const ext =
    typeof window !== "undefined" && window.ATMAD_LEGACY_BRAND_SLUG
      ? window.ATMAD_LEGACY_BRAND_SLUG
      : {};
  return ext[s] || INTERNAL_LEGACY_BRAND_SLUG[s] || s;
}

/** URL segment for brand pages and /brand/code offer links (canonical spelling). */
function brandSlugForCoupon(c) {
  const raw = (c && c.titleEn) || "";
  const slug = slugifyBrand(brandTitleForDisplay(raw, "en"));
  return canonicalBrandSlugFromUrl(slug);
}

/** URL segment for a single offer (legacy /brand/code URLs and ?code= parsing). */
function slugifyCouponCode(code) {
  let s = String(code || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "code";
}

/** Public URL for coupon cards and SEO: brand page only (/brand-slug). */
function couponOfferDetailPath(c) {
  return "/" + brandSlugForCoupon(c);
}

function findCouponByOfferSlugs(brandSlug, codeSlug) {
  const all = buildAllCoupons();
  const bs = canonicalBrandSlugFromUrl(String(brandSlug || "").toLowerCase());
  const cs = String(codeSlug || "").toLowerCase();
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    if (brandSlugForCoupon(c) === bs && slugifyCouponCode(c.code) === cs) return c;
  }
  return null;
}

/** Pretty path /brand-slug/offer-slug or ?brand=&code= for local /coupon.html. */
function couponDetailSlugsFromPageUrl() {
  if (typeof location === "undefined") return null;
  const params = new URLSearchParams(location.search || "");
  const qb = params.get("brand");
  const qc = params.get("code");
  if (qb && qc) {
    return {
      brandSlug: String(qb).trim().toLowerCase(),
      codeSlug: slugifyCouponCode(qc)
    };
  }
  const parts = String(location.pathname || "/")
    .split("/")
    .filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  if (/\.html?$/i.test(last)) return null;
  return {
    brandSlug: parts[parts.length - 2].toLowerCase(),
    codeSlug: parts[parts.length - 1].toLowerCase()
  };
}

/** Slug for brand detail: ?brand= (dev / legacy) or last path segment (e.g. /800-flowers). */
function brandSlugFromPageUrl() {
  if (typeof location === "undefined") return "";
  const params = new URLSearchParams(location.search || "");
  const fromQuery = params.get("brand");
  if (fromQuery && String(fromQuery).trim()) return String(fromQuery).trim().toLowerCase();
  const parts = String(location.pathname || "")
    .split("/")
    .filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : "";
  if (!last || /\.html?$/i.test(last)) return "";
  return last.toLowerCase();
}

function groupCouponsByBrandSlug(allCoupons) {
  const map = new Map();
  for (let i = 0; i < allCoupons.length; i++) {
    const c = allCoupons[i];
    const slug = brandSlugForCoupon(c);
    if (!map.has(slug)) {
      map.set(slug, {
        slug: slug,
        titleEn: brandTitleForDisplay(c.titleEn, "en"),
        titleAr: brandTitleForDisplay(c.titleAr, "ar"),
        items: []
      });
    }
    const g = map.get(slug);
    g.items.push(c);
    const dispEn = brandTitleForDisplay(c.titleEn, "en");
    const dispAr = brandTitleForDisplay(c.titleAr, "ar");
    if ((dispEn || "").length > (g.titleEn || "").length) g.titleEn = dispEn;
    if ((dispAr || "").length > (g.titleAr || "").length) g.titleAr = dispAr;
  }
  return Array.from(map.values());
}

function mergedCountryTagsForGroup(items) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const tags = items[i]._countryTags || [];
    for (let j = 0; j < tags.length; j++) {
      const t = tags[j];
      const k = String(t).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

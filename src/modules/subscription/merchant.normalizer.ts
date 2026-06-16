/**
 * Normalizes raw statement descriptions so recurring charges from the same
 * vendor group together (e.g. "NETFLIX.COM 866-716-0414 CA" → "Netflix").
 * Real statements use varying formats; this improves subscription detection.
 */

type MerchantPattern = {
  pattern: RegExp | string;
  name: string;
  singleChargeLikely?: boolean;
};

// Known merchants: description pattern (case-insensitive) → display name.
// Broad retailer patterns are useful for recurrence grouping but are not enough
// to classify a single transaction as a subscription.
const KNOWN_MERCHANT_PATTERNS: MerchantPattern[] = [
  { pattern: /netflix/i, name: "Netflix", singleChargeLikely: true },
  { pattern: /spotify/i, name: "Spotify", singleChargeLikely: true },
  { pattern: /amazon\s*prime|prime\s*membership|prime\s*video/i, name: "Amazon Prime", singleChargeLikely: true },
  { pattern: /amazon\.?com|amazon\s+mkts|amazon\s+pay/i, name: "Amazon" },
  { pattern: /youtube\s*premium|youtube\s*music/i, name: "YouTube Premium", singleChargeLikely: true },
  { pattern: /icloud|apple\s*icloud/i, name: "Apple iCloud", singleChargeLikely: true },
  { pattern: /apple\s*com|apple\.com|app\s*store|itunes/i, name: "Apple" },
  { pattern: /google\s*one|google\s*drive|google\s*storage|g\s*suite/i, name: "Google", singleChargeLikely: true },
  { pattern: /microsoft\s*365|office\s*365/i, name: "Microsoft", singleChargeLikely: true },
  { pattern: /xbox|msft\s*bill/i, name: "Microsoft" },
  { pattern: /adobe\.?com|adobe\s*creative|creative\s*cloud/i, name: "Adobe", singleChargeLikely: true },
  { pattern: /steam|steampowered/i, name: "Steam" },
  { pattern: /disney\s*plus|disneyplus|hotstar/i, name: "Disney+", singleChargeLikely: true },
  { pattern: /hbo\s*max|max\s*streaming/i, name: "Max", singleChargeLikely: true },
  { pattern: /dropbox/i, name: "Dropbox", singleChargeLikely: true },
  { pattern: /notion|notion\.so/i, name: "Notion", singleChargeLikely: true },
  { pattern: /slack/i, name: "Slack", singleChargeLikely: true },
  { pattern: /zoom\.us|zoom\s*video/i, name: "Zoom", singleChargeLikely: true },
  { pattern: /linkedin\s*premium/i, name: "LinkedIn", singleChargeLikely: true },
  { pattern: /linkedin\.com/i, name: "LinkedIn" },
  { pattern: /canva/i, name: "Canva" },
  { pattern: /flipkart/i, name: "Flipkart" },
];

function matchesPattern(pattern: RegExp | string, raw: string): boolean {
  return typeof pattern === "string"
    ? raw.toLowerCase().includes(pattern.toLowerCase())
    : pattern.test(raw);
}

/**
 * Normalize a raw transaction description to a stable name for grouping.
 * - Tries known subscription patterns first.
 * - Otherwise strips phone numbers, refs, and extra punctuation; title-cases.
 */
export function normalizeMerchant(description: string): string {
  const raw = (description || "").trim();
  if (!raw) return "Unknown";

  for (const { pattern, name } of KNOWN_MERCHANT_PATTERNS) {
    if (matchesPattern(pattern, raw)) {
      return name;
    }
  }

  // Fallback: remove common noise (phone numbers, IDs, locations) and clean
  let cleaned = raw
    .replace(/\s*\d{10,}\s*/g, " ")       // long number strings (phones, refs)
    .replace(/\s*[A-Z0-9]{4,}\s*(?:CA|NY|IN|USA)?\s*$/i, " ")  // trailing codes
    .replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*/g, " ")          // embedded dates
    .replace(/\*+|\s*#\d+\s*/g, " ")       // asterisks and ref numbers
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return raw;
  // Title-case first word / known acronyms stay upper
  const first = cleaned.split(/\s/)[0] ?? cleaned;
  if (first.length <= 3 && first === first.toUpperCase()) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

const NON_SUBSCRIPTION_PATTERNS = [
  /mutual\s*fund|\bsip\b/i,
  /electricity|internet\s*bill|water\s*bill/i,
  /salary|freelance|dividend|atm|cash\s*withdrawal/i,
  /swiggy|zomato|uber\s*ride|amazon\s*purchase/i,
  /upi\s*transfer|opening balance|closing balance/i,
];

const SUBSCRIPTION_DESCRIPTION_KEYWORDS =
  /\b(subscription|premium|membership)\b/i;

/**
 * True when a single statement line looks like a subscription charge
 * (e.g. one month of Netflix on a bank export).
 */
export function isLikelySubscriptionCharge(description: string): boolean {
  const raw = (description || "").trim();
  if (!raw) return false;
  if (NON_SUBSCRIPTION_PATTERNS.some((pattern) => pattern.test(raw))) {
    return false;
  }

  for (const { pattern, singleChargeLikely } of KNOWN_MERCHANT_PATTERNS) {
    if (singleChargeLikely && matchesPattern(pattern, raw)) {
      return true;
    }
  }

  return SUBSCRIPTION_DESCRIPTION_KEYWORDS.test(raw);
}

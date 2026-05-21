/**
 * Normalizes raw statement descriptions so recurring charges from the same
 * vendor group together (e.g. "NETFLIX.COM 866-716-0414 CA" → "Netflix").
 * Real statements use varying formats; this improves subscription detection.
 */

// Known subscription merchants: description pattern (case-insensitive) → display name
const KNOWN_MERCHANT_PATTERNS: Array<{ pattern: RegExp | string; name: string }> = [
  { pattern: /netflix/i, name: "Netflix" },
  { pattern: /spotify/i, name: "Spotify" },
  { pattern: /amazon\s*prime|prime\s*membership|prime\s*video/i, name: "Amazon Prime" },
  { pattern: /amazon\.?com|amazon\s+mkts|amazon\s+pay/i, name: "Amazon" },
  { pattern: /youtube\s*premium|youtube\s*music/i, name: "YouTube Premium" },
  { pattern: /apple\s*com|apple\.com|app\s*store|itunes/i, name: "Apple" },
  { pattern: /google\s*one|google\s*drive|google\s*storage|g\s*suite/i, name: "Google" },
  { pattern: /microsoft\s*365|office\s*365|xbox|msft\s*bill/i, name: "Microsoft" },
  { pattern: /adobe\.?com|adobe\s*creative|creative\s*cloud/i, name: "Adobe" },
  { pattern: /steam|steampowered/i, name: "Steam" },
  { pattern: /disney\s*plus|disneyplus|hotstar/i, name: "Disney+" },
  { pattern: /hbo\s*max|max\s*streaming/i, name: "Max" },
  { pattern: /dropbox/i, name: "Dropbox" },
  { pattern: /notion|notion\.so/i, name: "Notion" },
  { pattern: /slack/i, name: "Slack" },
  { pattern: /zoom\.us|zoom\s*video/i, name: "Zoom" },
  { pattern: /linkedin\s*premium|linkedin\.com/i, name: "LinkedIn" },
  { pattern: /canva/i, name: "Canva" },
  { pattern: /flipkart/i, name: "Flipkart" },
];

/**
 * Normalize a raw transaction description to a stable name for grouping.
 * - Tries known subscription patterns first.
 * - Otherwise strips phone numbers, refs, and extra punctuation; title-cases.
 */
export function normalizeMerchant(description: string): string {
  const raw = (description || "").trim();
  if (!raw) return "Unknown";

  for (const { pattern, name } of KNOWN_MERCHANT_PATTERNS) {
    if (typeof pattern === "string" ? raw.toLowerCase().includes(pattern.toLowerCase()) : pattern.test(raw)) {
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

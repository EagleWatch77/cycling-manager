/** Flag emoji from an ISO-3166 alpha-2 code ("SK" -> flag). Returns null for a missing/invalid code - never a guessed flag. */
export function flagFromIso2(iso2: string | null | undefined): string | null {
  if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return null;
  return String.fromCodePoint(...iso2.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

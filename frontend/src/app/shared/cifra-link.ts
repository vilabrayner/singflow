/** Cifra Club pitch index starts at A; keyShape is an absolute pitch, not an offset. */
export function cifraLink(
  value: string | null | undefined,
  originalKey?: string | null,
  semitones?: number,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['www.cifraclub.com.br', 'cifraclub.com.br'].includes(url.hostname)
    )
      return null;
    // Saved links can already contain a transposition. Only this presentation determines it.
    url.searchParams.delete('keyShape');
    const key = originalKey?.trim().replace('♯', '#').replace('♭', 'b');
    if (key && /^[A-G](#|b)?m?$/.test(key) && Number.isInteger(semitones) && semitones !== 0) {
      const pitch: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
      const accidental = key.includes('#') ? 1 : key.includes('b') ? -1 : 0;
      const index = (((pitch[key[0]] + accidental + semitones! - 9) % 12) + 12) % 12;
      url.searchParams.set('keyShape', String(index));
    }
    return url.href;
  } catch {
    return null;
  }
}

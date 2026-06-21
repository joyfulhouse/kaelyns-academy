import { describe, expect, it } from "vitest";
import { plausibleOverride } from "./phonemeCheck";

// Real misaki phoneme strings from Kokoro's /dev/phonemize (language "a"):
//   table → tˈAbᵊl   cat → kˈæt   city → sˈɪTi   cake → kˈAk   ship → ʃˈɪp
//   cheese → ʧˈiz   jump → ʤˈʌmp   sing → sˈɪŋ
describe("plausibleOverride", () => {
  it('keeps a syllable override whose consonants are a subsequence of the word', () => {
    expect(plausibleOverride("teɪ", "tˈAbᵊl")).toBe(true); // "ta" /teɪ/ → t ⊑ t,b,l
    expect(plausibleOverride("bəl", "tˈAbᵊl")).toBe(true); // "ble" /bəl/ → b,l ⊑ t,b,l
  });

  it("rejects an override whose consonants the word doesn't contain", () => {
    expect(plausibleOverride("zoo", "tˈAbᵊl")).toBe(false); // z not in table
  });

  it("accepts the soft-c /s/ override for a word with /s/", () => {
    expect(plausibleOverride("s", "sˈɪti")).toBe(true);
  });

  it("treats a pure-vowel override as always plausible (vowels shift by word)", () => {
    expect(plausibleOverride("æ", "kˈæt")).toBe(true);
    expect(plausibleOverride("eɪ", "kˈAk")).toBe(true);
    expect(plausibleOverride("", "kˈæt")).toBe(true); // no consonants at all
  });

  it("requires consonant ORDER (out-of-order consonants fail)", () => {
    // override "lb" (l before b) is NOT a subsequence of table's b,l order.
    expect(plausibleOverride("ləb", "tˈAbᵊl")).toBe(false);
    // but in-order b...l passes.
    expect(plausibleOverride("bəl", "tˈAbᵊl")).toBe(true);
  });

  it("matches single-char consonant overrides", () => {
    expect(plausibleOverride("k", "kˈæt")).toBe(true); // c /k/ in cat
    expect(plausibleOverride("t", "kˈæt")).toBe(true); // t in cat
    expect(plausibleOverride("k", "sˈɪTi")).toBe(false); // hard-c /k/ wrong for "city"
  });

  it("folds misaki's flap T (uppercase) to /t/ so it counts as a consonant", () => {
    // butter → bˈʌTəɹ : the medial T is /t/. An override "t" must be plausible.
    expect(plausibleOverride("t", "bˈʌTəɹ")).toBe(true);
    expect(plausibleOverride("tə", "sˈɪTi")).toBe(true); // "ty" /ti/ → t ⊑ s,t
  });

  it("treats the affricate digraph tʃ as the single misaki char ʧ", () => {
    // override written as IPA digraph "tʃiz" must match misaki's "ʧˈiz" (cheese).
    expect(plausibleOverride("tʃ", "ʧˈiz")).toBe(true);
    expect(plausibleOverride("dʒ", "ʤˈʌmp")).toBe(true); // jump
  });

  it("matches digraph/cluster overrides in order", () => {
    expect(plausibleOverride("ʃ", "ʃˈɪp")).toBe(true); // sh in ship
    expect(plausibleOverride("ŋ", "sˈɪŋ")).toBe(true); // ng in sing
    expect(plausibleOverride("p", "ʃˈɪp")).toBe(true);
  });
});

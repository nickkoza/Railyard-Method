// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [LeX]: no minted ID reads as an objectionable word, in any case, through a digit standing for
// a letter, or through a misspelling, an abbreviation or a dropped vowel that still reads as it.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { READINGS, objectionable } from "./objectionable.ts";

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Every ID a draw can make. */
function space(): string[] {
  const all: string[] = [];
  for (const a of ALPHABET) for (const b of ALPHABET) for (const c of ALPHABET) all.push(a + b + c);
  return all;
}

/** The digits commonly written for each letter. */
const LEET: Readonly<Record<string, readonly string[]>> = { o: ["0"], i: ["1"], l: ["1"], e: ["3"], a: ["4"], s: ["5"], t: ["7"], b: ["8", "6"], g: ["9", "6"], z: ["2"] };

/** Every spelling of `form` in any case, with any of its letters written as a digit that stands for it. */
function spellings(form: string): string[] {
  let out = [""];
  for (const c of form) {
    const ways = [c.toLowerCase(), c.toUpperCase(), ...(LEET[c.toLowerCase()] ?? [])];
    out = out.flatMap((head) => ways.map((w) => head + w));
  }
  return [...new Set(out)];
}

/** The forms of three characters the list holds, and the three-character IDs containing each two-character one. */
function threeCharacterForms(): string[] {
  const out = new Set<string>();
  for (const forms of Object.values(READINGS)) {
    for (const form of forms) {
      if (form.length === 3) out.add(form);
      else for (const c of "abcxyz019") { out.add(form + c); out.add(c + form); }
    }
  }
  return [...out];
}

/** A word's consonant skeleton: its first letter, then every letter after it but the vowels. */
function skeleton(word: string): string {
  return word.charAt(0) + word.slice(1).replace(/[aeiou]/g, "");
}

describe("objectionable ([LeX])", () => {
  it("refuses every listed form, in every case and every digit-for-letter spelling of it", () => {
    const missed: string[] = [];
    for (const form of threeCharacterForms()) for (const spelling of spellings(form)) if (!objectionable(spelling)) missed.push(spelling);
    assert.deepEqual(missed, [], "each of these reads as a listed word and was not refused");
  });

  it("refuses the forms the owner named, however they are spelled", () => {
    const named = [
      "fuk", "FUK", "fUk", "f0k", "fuc", "fck", "fcu", "fux", "fuq", "fvk", "sht", "sh1", "SH7", "bch", "cnt", "knt", "kun",
      "dik", "d1k", "dck", "dic", "dyk", "cok", "c0k", "cck", "kok", "pus", "fgt", "fag", "f4g", "nig", "n1g", "NIG", "ngr",
      "nga", "cum", "kum", "cvm", "CUM", "jiz", "j1z", "jzz", "tit", "t1t", "TIT", "azz", "a55", "455", "A55", "ass", "wtf",
      "stf", "omf", "0mf", "gtf", "nsf", "kkk", "KKK", "jew", "j3w", "sex", "s3x", "xxx",
    ];
    assert.deepEqual(named.filter((id) => !objectionable(id)), [], "each of these reads as an objectionable word");
  });

  it("refuses each listed word of three letters, and each longer one's consonant skeleton", () => {
    const missing: string[] = [];
    for (const [word, forms] of Object.entries(READINGS)) {
      const wanted = word.length === 3 ? [word] : [skeleton(word).slice(0, 3)].filter((f) => f.length === 3);
      for (const form of wanted) if (!objectionable(form)) missing.push(`${word}: ${form}`);
      assert.ok(forms.length > 0, `${word} lists no form`);
    }
    assert.deepEqual(missing, [], "a word of three letters reads as itself, and a longer one's opening with the vowels dropped reads as it");
  });

  it("refuses everything the ready-made filter flags at three characters, so the list never refuses less", () => {
    const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
    const missed = space().filter((id) => matcher.hasMatch(id) && !objectionable(id));
    assert.deepEqual(missed, [], "obscenity flags these and the list does not");
  });

  it("refuses a small share of the space, so a refusal stays a cheap re-roll", () => {
    const all = space();
    const refused = all.filter(objectionable).length;
    const share = refused / all.length;
    // Measured 2026-09-27: printed so the figure in the report is the one this run saw.
    process.stdout.write(`# objectionable: ${String(refused)} of ${String(all.length)} IDs refused (${(share * 100).toFixed(2)}%)\n`);
    assert.ok(share < 0.03, `${String(refused)} refused is ${(share * 100).toFixed(2)}% of the space, more than a few percent`);
  });

  it("does not refuse IDs that read as nothing", () => {
    for (const id of ["Ay4", "q7Z", "0kR", "zzz", "XLT", "9pu", "8g5", "bit", "Bsh"]) assert.equal(objectionable(id), false, `${id} reads as no listed word`);
  });
});

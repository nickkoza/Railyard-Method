// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `objectionable` ([LeX]): whether a candidate ID reads as a profanity, a slur, a sexual term or
// a hostile acronym, so minting refuses it and draws again. It is asked of a candidate only, never
// of an ID already carried: an ID is set once and never changed ([8g5]).
//
// The list is this package's own ([m3i]): the ready-made filter evaluated reads whole words in
// running text, and missed most of what reads as a word at three characters. Each word is listed
// with the three-character forms it is read in, spelled plainly; a two-character form is refused
// wherever it appears in an ID. A candidate is refused when any reading of it is listed: its
// letters lowercased, each digit read as each letter it commonly stands for, and the letters that
// sound alike folded together, on the list and the candidate alike, so `f0k`, `FUK`, `fuq` and
// `fvk` all read as `fuk`. It errs towards refusing, since a refusal costs one re-roll and an ID
// is read for as long as it lives.

/**
 * Each word, and the forms of it an ID could read as: its own spelling where it has three
 * letters, its opening with the vowels dropped (its consonant skeleton) where it has more, and
 * the misspellings, abbreviations and shortenings that still read as it. Forms that differ only
 * by a folded letter (`c` for `k`, `z` for `s`) are listed where they read differently to the
 * eye; the fold would refuse them anyway.
 */
export const READINGS: Readonly<Record<string, readonly string[]>> = {
  // Profanity, and the acronyms built on it.
  fuck: ["fk", "fuk", "fuc", "fok", "fak", "fck", "fcu", "fux", "fuu", "ffu"],
  ffs: ["ffs"],
  fml: ["fml"],
  wtf: ["wtf"],
  stfu: ["stf"],
  gtfo: ["gtf"],
  omfg: ["omf"],
  mofo: ["mof"],
  shit: ["sht", "shi"],
  bitch: ["btc", "bch"],
  cunt: ["cnt", "knt", "cun"],
  twat: ["twt", "twa"],
  piss: ["pss", "pis"],
  arse: ["ars"],
  ass: ["ass", "azz"],
  wank: ["wnk"],
  smd: ["smd"],
  // Sexual terms.
  dick: ["dck", "dik", "dic", "dix"],
  cock: ["cck", "cok", "coc", "kok"],
  cuck: ["cuk"],
  pussy: ["pss", "pus"],
  cum: ["cum", "cvm"],
  jizz: ["jzz", "jiz"],
  tits: ["tts", "tit"],
  clit: ["clt"],
  dildo: ["dld"],
  anal: ["anl"],
  porn: ["prn"],
  sex: ["sex"],
  sexy: ["sxy"],
  xxx: ["xxx"],
  milf: ["mlf"],
  bbw: ["bbw"],
  fap: ["fap"],
  vag: ["vag"],
  slut: ["slt"],
  whore: ["whr", "hoe"],
  rape: ["rpe"],
  nsfw: ["nsf"],
  // Slurs, and words commonly thrown as one. Refused conservatively: an ID that reads as one
  // invites a reading nobody meant, and refusing it costs a re-roll.
  nigger: ["ngg", "ngr", "nig"],
  nigga: ["ngg", "nga"],
  faggot: ["fgg", "fgt", "fag"],
  fag: ["fag"],
  dyke: ["dyk"],
  lez: ["lez"],
  gay: ["gay"],
  kike: ["kik", "kyk"],
  jew: ["jew"],
  spic: ["spc"],
  gook: ["gok"],
  paki: ["pak"],
  wop: ["wop"],
  wog: ["wog"],
  gyp: ["gyp"],
  abo: ["abo"],
  retard: ["rtr", "rtd"],
  // A hate group, and hostile acronyms aimed at a person.
  kkk: ["kkk"],
  nazi: ["nzi"],
  kys: ["kys"],
  kms: ["kms"],
};

/** The letters each digit commonly stands for. */
const DIGITS: Readonly<Record<string, readonly string[]>> = {
  "0": ["o"],
  "1": ["i", "l"],
  "2": ["z"],
  "3": ["e"],
  "4": ["a"],
  "5": ["s"],
  "6": ["g", "b"],
  "7": ["t"],
  "8": ["b"],
  "9": ["g"],
};

/** Letters that sound alike, or are written for each other, folded to one. */
const FOLD: Readonly<Record<string, string>> = { c: "k", q: "k", z: "s", v: "u", y: "i" };

/** Every reading of `text`: lowercased, each digit read as each letter it stands for, and alike letters folded. */
function readings(text: string): string[] {
  let out = [""];
  for (const c of text.toLowerCase()) {
    const letters = (DIGITS[c] ?? [c]).map((l) => FOLD[l] ?? l);
    out = out.flatMap((head) => letters.map((l) => head + l));
  }
  return out;
}

/** Every listed form, read as a candidate is read. */
const FORMS: readonly string[] = [...new Set(Object.values(READINGS).flat().flatMap(readings))];
const WHOLE: ReadonlySet<string> = new Set(FORMS.filter((f) => f.length >= 3));
const INFIXES: readonly string[] = FORMS.filter((f) => f.length < 3);

/** Whether `id` reads as an objectionable word, by any reading of it ([LeX]). */
export function objectionable(id: string): boolean {
  return readings(id).some((r) => WHOLE.has(r) || INFIXES.some((infix) => r.includes(infix)));
}

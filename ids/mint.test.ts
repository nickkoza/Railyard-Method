// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `mentionsIn`, `mentionsSince` and `mintIds` ([9pu]): the rule `ids-take` runs, exported so
// whatever else mints an ID reads this answer instead of a second implementation of it. The
// full read is exercised through `ids/cli.test.ts`, which already covers a tracked file's
// edit, a deleted file's history and a commit message; this file's job is what `cli.test.ts`
// cannot show: the incremental read, and that it reads less than a full one.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mentionsIn, mentionsSince, mintIds, Unreadable } from "./mint.ts";
import { objectionable } from "./objectionable.ts";

/** A scratch repository with real git, removed after `body` runs. */
async function scratch(body: (root: string, git: (...args: readonly string[]) => void) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "ids-mint-"));
  const git = (...args: readonly string[]): void => {
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: root, stdio: "ignore" });
  };
  try {
    git("init", "-q");
    await body(root, git);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The blob git holds `path` as at `revision`, so a test can name an object without guessing its hash. */
function blobAt(root: string, revision: string, path: string): string {
  return execFileSync("git", ["rev-parse", `${revision}:${path}`], { cwd: root, encoding: "utf8" }).trim();
}

describe("mentionsIn", () => {
  it("reads a tracked file, deleted history and a commit message, as ids-take does ([9pu])", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "gone.md"), "1. [Qz9] A criterion since deleted.\n");
      git("add", "gone.md");
      git("commit", "-q", "-m", "Implements [Zq8]");
      execFileSync("git", ["rm", "-q", "gone.md"], { cwd: root });
      writeFileSync(join(root, "kept.md"), "nothing here\n");
      git("add", "kept.md");
      git("commit", "-q", "-m", "Remove it");
      writeFileSync(join(root, "kept.md"), "1. [Ed5] Written, not committed.\n");
      const mentions = await mentionsIn(root);
      assert.equal(mentions.has("Qz9"), true, "a deleted file's history still mentions it");
      assert.equal(mentions.has("Zq8"), true, "a commit message mentions it");
      assert.equal(mentions.has("Ed5"), true, "the tracked file as it stands mentions it");
      assert.equal(mentions.has("Wv7"), false, "nothing here mentions it");
    });
  });

  it("carries the ref tips it was read at, for an incremental read next time", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "a.md"), "plain\n");
      git("add", "a.md");
      git("commit", "-q", "-m", "start");
      const mentions = await mentionsIn(root);
      const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
      assert.ok(mentions.tips.has(head), "the tip it read is the branch it read from");
    });
  });

  it("reads a bare clone's history and commit messages, and says it read no tracked tree ([9pu])", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "gone.md"), "1. [Qz9] A criterion since deleted.\n");
      git("add", "gone.md");
      git("commit", "-q", "-m", "Implements [Zq8]");
      const bare = mkdtempSync(join(tmpdir(), "ids-mint-bare-"));
      try {
        execFileSync("git", ["clone", "-q", "--bare", root, bare], { stdio: "ignore" });
        const mentions = await mentionsIn(bare);
        assert.equal(mentions.has("Qz9"), true, "a bare clone's history mentions it");
        assert.equal(mentions.has("Zq8"), true, "a bare clone's commit message mentions it");
        assert.equal(mentions.has("Wv7"), false, "nothing here mentions it");
        assert.equal(mentions.trackedTree, false, "a bare repository has no tracked tree, and the answer says so");
        assert.equal((await mentionsIn(root)).trackedTree, true, "a work tree's tracked files are read");
      } finally {
        rmSync(bare, { recursive: true, force: true });
      }
    });
  });

  it("throws Unreadable, saying so in one line, outside a repository", async () => {
    const outside = mkdtempSync(join(tmpdir(), "ids-mint-outside-"));
    try {
      await assert.rejects(mentionsIn(outside), (e) => e instanceof Unreadable && /git repository/.test(e.message));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("mintIds", () => {
  it("draws IDs mentionsIn says are free, none the same within a batch", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "a.md"), "plain\n");
      git("add", "a.md");
      git("commit", "-q", "-m", "start");
      const mentions = await mentionsIn(root);
      const ids = await mintIds(mentions, 5);
      assert.equal(ids.length, 5);
      for (const id of ids) {
        assert.match(id, /^[A-Za-z0-9]{3}$/);
        assert.equal(mentions.has(id), false, `${id} was drawn though mentionsIn already holds it`);
      }
      assert.equal(new Set(ids).size, 5, "an ID drawn earlier in the batch is taken, though nothing is written yet");
    });
  });
});

describe("mintIds refusing what reads as an objectionable word ([LeX])", () => {
  it("never offers one, nor asks a consumer's rule about one, and still gives the count asked for", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "a.md"), "plain\n");
      git("add", "a.md");
      git("commit", "-q", "-m", "start");
      const mentions = await mentionsIn(root);
      const asked: string[] = [];
      // Three thousand IDs: at the share of the space the filter refuses, a mint this size
      // draws dozens of flagged candidates, so one reaching the consumer would be seen.
      const ids = await mintIds(mentions, 3000, (id) => {
        asked.push(id);
        return false;
      });
      assert.equal(ids.length, 3000, "the count asked for, whatever was refused along the way");
      assert.deepEqual(ids.filter(objectionable), [], "no minted ID reads as an objectionable word");
      assert.deepEqual(asked.filter(objectionable), [], "a flagged candidate is refused before the consumer's rule is asked");
    });
  });
});

describe("mintIds with a consumer's own rule ([9pu])", () => {
  it("never offers an ID the consumer's rule says is taken, whether it answers at once or later", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "a.md"), "plain\n");
      git("add", "a.md");
      git("commit", "-q", "-m", "start");
      const mentions = await mentionsIn(root);
      // A rule that takes every ID opening in a lower-case letter, 26 in 62 of the space, so a
      // batch that did not consult it would offer one in all but a sliver of runs.
      const takes = (id: string): boolean => /^[a-z]/.test(id);
      const asked: string[] = [];
      const sync = await mintIds(mentions, 20, (id) => {
        asked.push(id);
        return takes(id);
      });
      for (const id of sync) assert.ok(!takes(id), `${id} was offered though the consumer's rule took it`);
      assert.ok(asked.length >= 20, "the rule was asked of each candidate");
      const later = await mintIds(mentions, 20, async (id) => {
        await new Promise((resolve) => setImmediate(resolve));
        return takes(id);
      });
      for (const id of later) assert.ok(!takes(id), `${id} was offered though the consumer's asynchronous rule took it`);
      assert.equal(new Set(later).size, 20, "none the same within a batch");
    });
  });

  it("offers nothing when the consumer's rule cannot answer", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "a.md"), "plain\n");
      git("add", "a.md");
      git("commit", "-q", "-m", "start");
      const mentions = await mentionsIn(root);
      await assert.rejects(mintIds(mentions, 1, () => Promise.reject(new Error("records unreadable"))), /records unreadable/);
    });
  });
});

describe("mentionsSince ([9pu]'s incremental read)", () => {
  it("sees a new commit's ID without a fresh full read", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "a.md"), "1. [Aa1] First.\n");
      git("add", "a.md");
      git("commit", "-q", "-m", "start");
      const first = await mentionsIn(root);
      assert.equal(first.has("Bb2"), false);

      writeFileSync(join(root, "b.md"), "1. [Bb2] Second.\n");
      git("add", "b.md");
      git("commit", "-q", "-m", "second");
      const second = await mentionsSince(root, first);
      assert.equal(second.has("Bb2"), true, "the new commit's ID is seen");
      assert.equal(second.has("Aa1"), true, "what the first read found is not forgotten");
    });
  });

  it("reads only the commits and blobs reachable from a tip that moved, not the ones the previous read already held", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "a.md"), "1. [Aa1] First, with its own blob.\n");
      git("add", "a.md");
      git("commit", "-q", "-m", "start");
      const firstBlob = blobAt(root, "HEAD", "a.md");
      const first = await mentionsIn(root);
      const firstTip = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

      writeFileSync(join(root, "c.md"), "1. [Cc3] Second, a new blob.\n");
      git("add", "c.md");
      git("commit", "-q", "-m", "second");
      const secondBlob = blobAt(root, "HEAD", "c.md");

      // A fake git ahead on PATH logs both the stdin and the stdout of every `rev-list` it is
      // asked to run, then hands the call on to the real git (found through the PATH as it
      // stood before, so the fake never calls itself), so the test can read exactly which
      // revisions the incremental call named and which objects it walked as a result — not
      // just what mentionsSince answers.
      const fakeBin = mkdtempSync(join(tmpdir(), "ids-mint-fakegit-"));
      const revisionsLog = join(fakeBin, "revisions.log");
      const objectsLog = join(fakeBin, "objects.log");
      const previousPath = process.env["PATH"] ?? "";
      const shQuoted = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;
      writeFileSync(
        join(fakeBin, "git"),
        [
          "#!/bin/sh",
          `REAL_PATH=${shQuoted(previousPath)}`,
          // git() sends its isolation flags ("-c", ...) ahead of the subcommand, so the
          // subcommand is not necessarily $1; every argument is checked instead.
          "is_rev_list=0",
          'for a in "$@"; do if [ "$a" = "rev-list" ]; then is_rev_list=1; fi; done',
          'if [ "$is_rev_list" = "1" ]; then',
          `  tee -a ${shQuoted(revisionsLog)} | PATH="$REAL_PATH" git "$@" | tee -a ${shQuoted(objectsLog)}`,
          "else",
          '  PATH="$REAL_PATH" exec git "$@"',
          "fi",
        ].join("\n"),
        { mode: 0o755 },
      );

      process.env["PATH"] = `${fakeBin}:${previousPath}`;
      let second: Awaited<ReturnType<typeof mentionsSince>>;
      try {
        second = await mentionsSince(root, first);
      } finally {
        process.env["PATH"] = previousPath;
      }

      assert.equal(second.has("Cc3"), true, "the new blob's ID is seen");
      const revisionsSent = execFileSync("cat", [revisionsLog], { encoding: "utf8" });
      assert.ok(revisionsSent.includes(`^${firstTip}`), `the incremental read excludes the previous tip:\n${revisionsSent}`);
      const objectsWalked = execFileSync("cat", [objectsLog], { encoding: "utf8" });
      assert.ok(objectsWalked.includes(secondBlob), `the new commit's own blob is walked:\n${objectsWalked}`);
      assert.ok(!objectsWalked.includes(firstBlob), `the previous read's own blob is not walked again:\n${objectsWalked}`);
      rmSync(fakeBin, { recursive: true, force: true });
    });
  });
});

/**
 * A repository of `versions` distinct file versions of `size` bytes each, one commit per version,
 * built through `git fast-import` so a large history costs the test seconds rather than minutes.
 * Each version is random words of the ID alphabet, so a read has real runs of three to scan.
 */
function generated(versions: number, size: number): string {
  const root = mkdtempSync(join(tmpdir(), "ids-mint-large-"));
  execFileSync("git", ["init", "-q", "--bare"], { cwd: root });
  const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789       ";
  const parts: Buffer[] = [];
  for (let v = 0; v < versions; v += 1) {
    const raw = randomBytes(size);
    for (let i = 0; i < size; i += 1) raw[i] = ALPHA.charCodeAt((raw[i] ?? 0) % ALPHA.length);
    const message = `version ${String(v)}\n`;
    parts.push(Buffer.from(`commit refs/heads/main\ncommitter t <t@example.com> ${String(1700000000 + v)} +0000\ndata ${String(message.length)}\n${message}`));
    parts.push(Buffer.from(`M 100644 inline f${String(v)}.txt\ndata ${String(size)}\n`), raw, Buffer.from("\n\n"));
  }
  execFileSync("git", ["fast-import", "--quiet"], { cwd: root, input: Buffer.concat(parts), maxBuffer: 1 << 30 });
  return root;
}

describe("the exported read never holds the event loop ([9pu]'s non-functional requirement)", () => {
  it("lets a 5 ms timer tick throughout a read of 48 MB of file versions, never more than 100 ms apart", async () => {
    const root = generated(48, 1024 * 1024);
    try {
      let last = performance.now();
      let longest = 0;
      let ticks = 0;
      const timer = setInterval(() => {
        const now = performance.now();
        longest = Math.max(longest, now - last);
        last = now;
        ticks += 1;
      }, 5);
      const started = performance.now();
      const reading = mentionsIn(root);
      last = performance.now();
      await reading;
      const took = performance.now() - started;
      clearInterval(timer);
      longest = Math.max(longest, performance.now() - last);
      assert.ok(took > 300, `the read took ${took.toFixed(0)} ms, too short to show anything; the repository must grow`);
      assert.ok(ticks > 0, `the timer never ticked during a read of ${took.toFixed(0)} ms`);
      assert.ok(longest < 100, `the event loop was held for ${longest.toFixed(0)} ms at once during a read of ${took.toFixed(0)} ms`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("a large tracked file never holds the event loop ([9pu]'s non-functional requirement)", () => {
  it("lets a 5 ms timer tick throughout a read of one 48 MB tracked file, never more than 100 ms apart", async () => {
    await scratch(async (root, git) => {
      const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789       ";
      const raw = randomBytes(48 * 1024 * 1024);
      for (let i = 0; i < raw.length; i += 1) raw[i] = ALPHA.charCodeAt((raw[i] ?? 0) % ALPHA.length);
      writeFileSync(join(root, "big.txt"), raw);
      // Tracked and never committed, so the tracked tree is the whole of the read.
      git("add", "big.txt");
      let last = performance.now();
      let longest = 0;
      const timer = setInterval(() => {
        const now = performance.now();
        longest = Math.max(longest, now - last);
        last = now;
      }, 5);
      const started = performance.now();
      const reading = mentionsIn(root);
      last = performance.now();
      await reading;
      const took = performance.now() - started;
      clearInterval(timer);
      longest = Math.max(longest, performance.now() - last);
      assert.ok(took > 150, `the read took ${took.toFixed(0)} ms, too short to show anything; the file must grow`);
      assert.ok(longest < 100, `the event loop was held for ${longest.toFixed(0)} ms at once during a read of ${took.toFixed(0)} ms`);
    });
  });
});

describe("an answer's size ([9pu]'s non-functional requirement)", () => {
  it("holds at most 4 MiB an answer, eight answers held at once", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "a.md"), "plain\n");
      git("add", "a.md");
      git("commit", "-q", "-m", "start");
      await mentionsIn(root);
      const before = process.memoryUsage().arrayBuffers;
      const held = [];
      for (let i = 0; i < 8; i += 1) held.push(await mentionsIn(root));
      const grew = process.memoryUsage().arrayBuffers - before;
      assert.equal(held.length, 8);
      assert.ok(grew <= 8 * 4 * 1024 * 1024, `eight answers grew ArrayBuffer memory by ${(grew / 1024 / 1024).toFixed(1)} MiB`);
    });
  });

  it("says exactly which of a sample of the whole ID space a repository mentions, and no other", async () => {
    await scratch(async (root, git) => {
      const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const every: string[] = [];
      for (const a of ALPHA) for (const b of ALPHA) for (const c of ALPHA) every.push(a + b + c);
      // Every seventh ID, and the space's two ends, each on its own between spaces.
      const sample = new Set(every.filter((_, i) => i % 7 === 3));
      sample.add("aaa");
      sample.add("999");
      writeFileSync(join(root, "sample.txt"), [...sample].join(" "));
      git("add", "sample.txt");
      git("commit", "-q", "-m", "-");
      const mentions = await mentionsIn(root);
      const wrong = every.filter((id) => mentions.has(id) !== sample.has(id));
      assert.deepEqual(wrong.slice(0, 10), [], `${String(wrong.length)} IDs answered wrongly`);
    });
  });
});

// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The build hash ([DHL]):
// one thing rides in a built artifact, the hash of the build's own content,
// under Railyard's own name. Tier 1: files in a temporary directory, no git and
// no build.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BUILD_HASH, buildHash, FORMAT_VERSION, SYMBOLS_VERSION, stampBuild, stampInto, stampOf, TraceRefusal, versionOf } from "./index.ts";

const HASH = "a".repeat(64);

const PAGE = "<!doctype html>\n<html>\n<head>\n  <title>A page</title>\n</head>\n<body>Hello</body>\n</html>\n";
const SCRIPT = "export const spin = () => 3;\n//# sourceMappingURL=app.js.map\n";
const MAP = `{"version":3,"file":"app.js","sources":["../src/spin.ts"],"sourcesContent":["export const spin = () => 3;\\n"],"names":[],"mappings":"AAAA"}`;
const STYLE = "body { color: red }\n";

function build(files: Readonly<Record<string, string>> = { "index.html": PAGE, "app.js": SCRIPT, "app.js.map": MAP, "app.css": STYLE }): string {
  const dir = mkdtempSync(join(tmpdir(), "build-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function read(dir: string, path: string): string {
  return readFileSync(join(dir, path), "utf8");
}

function stampIn(dir: string, path: string): string | null {
  return stampOf(path, readFileSync(join(dir, path)));
}

describe("the build hash", () => {
  it("is 64 hex characters over the build's own content, wherever the build sits", () => {
    const one = build();
    const two = build();
    try {
      const first = stampBuild([one]);
      const second = stampBuild([two]);
      assert.match(first.hash, /^[0-9a-f]{64}$/);
      assert.equal(first.hash, second.hash);
      // The files are hashed sorted by their path, so the order they are given in changes nothing.
      const files = [{ path: "b.js", bytes: Buffer.from(SCRIPT) }, { path: "a.html", bytes: Buffer.from(PAGE) }];
      assert.equal(buildHash(files), buildHash([...files].reverse()));
    } finally {
      rmSync(one, { recursive: true, force: true });
      rmSync(two, { recursive: true, force: true });
    }
  });

  it("differs when what was built differs, so two builds of one commit made with different settings get their own symbols", () => {
    const one = build();
    const two = build({ "index.html": PAGE, "app.js": SCRIPT.replace("3", "4"), "app.js.map": MAP, "app.css": STYLE });
    const three = build({ "index.html": PAGE, "app.js": SCRIPT, "app.js.map": MAP });
    try {
      const hash = stampBuild([one]).hash;
      assert.notEqual(hash, stampBuild([two]).hash);
      assert.notEqual(hash, stampBuild([three]).hash);
    } finally {
      for (const dir of [one, two, three]) rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can be recomputed from the stamped build: stamping again gives the same hash and stamps once", () => {
    const dir = build();
    try {
      const first = stampBuild([dir]);
      const stamped = read(dir, "index.html");
      const again = stampBuild([dir]);
      assert.equal(again.hash, first.hash);
      assert.equal(read(dir, "index.html"), stamped);
      assert.equal(read(dir, "index.html").split(BUILD_HASH).length - 1, 1);
      assert.equal(read(dir, "app.js").split(BUILD_HASH).length - 1, 1);
      assert.equal(read(dir, "app.js.map").split(BUILD_HASH).length - 1, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes it where each kind of artifact already keeps one, under Railyard's own name, and reads it back", () => {
    const dir = build();
    try {
      const { hash } = stampBuild([dir]);
      const page = read(dir, "index.html");
      assert.ok(page.includes(`<meta name="${BUILD_HASH}" content="${hash}">`), page);
      assert.ok(page.indexOf(BUILD_HASH) < page.indexOf("</head>"), "the page carries it in its head");
      const script = read(dir, "app.js");
      assert.ok(script.includes(`//# ${BUILD_HASH}=${hash}`), script);
      assert.ok(script.indexOf(BUILD_HASH) < script.indexOf("sourceMappingURL"), "the bundle keeps sourceMappingURL last");
      const map: unknown = JSON.parse(read(dir, "app.js.map"));
      assert.ok(map !== null && typeof map === "object" && BUILD_HASH in map);
      for (const path of ["index.html", "app.js", "app.js.map"]) assert.equal(stampIn(dir, path), hash, path);
      assert.equal(stampIn(dir, "app.css"), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // [DHL] carried the hash alone until 2026-09-20, when it gained the format's version beside
  // it: a reader has to know the schema before it reads the symbols the hash looks up, and a
  // build naming only its hash leaves that to be guessed. Those two, and still nothing else.
  it("carries the hash and the format's version, and nothing else; the rest of the file is untouched", () => {
    const dir = build();
    try {
      const { hash } = stampBuild([dir]);
      const page = read(dir, "index.html")
        .replace(new RegExp(`[ \\t]*<meta name="${BUILD_HASH}" content="${hash}">\\n?`), "")
        .replace(new RegExp(`[ \\t]*<meta name="${SYMBOLS_VERSION}" content="${FORMAT_VERSION}">\\n?`), "");
      assert.equal(page, PAGE);
      const script = read(dir, "app.js")
        .replace(new RegExp(`//# ${BUILD_HASH}=${hash}\\n`), "")
        .replace(new RegExp(`//# ${SYMBOLS_VERSION}=${FORMAT_VERSION}\\n`), "");
      assert.equal(script, SCRIPT);
      const map: unknown = JSON.parse(read(dir, "app.js.map"));
      assert.ok(map !== null && typeof map === "object");
      const carried: Record<string, unknown> = { ...map };
      assert.equal(carried[BUILD_HASH], hash);
      assert.equal(carried[SYMBOLS_VERSION], FORMAT_VERSION);
      assert.deepEqual(Object.fromEntries(Object.entries(carried).filter(([key]) => key !== BUILD_HASH && key !== SYMBOLS_VERSION)), JSON.parse(MAP));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("names a file whose kind has no place for the stamp, and still counts it in the hash", () => {
    const dir = build();
    try {
      const answer = stampBuild([dir]);
      const css = answer.files.find((f) => f.path === "app.css");
      assert.deepEqual(css, { path: "app.css", kind: "none", stamped: false });
      assert.equal(answer.carried, 3);
      assert.equal(read(dir, "app.css"), STYLE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a build no file of which can carry the hash, rather than stamping nothing quietly", () => {
    const dir = build({ "app.css": STYLE, "logo.svg": "<svg/>\n" });
    try {
      assert.throws(() => stampBuild([dir]), (e: unknown) => e instanceof TraceRefusal && e.message.includes(BUILD_HASH));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hashes a file by its path in the build, so moving a file changes the hash", () => {
    const one = build({ "a/app.js": SCRIPT });
    const two = build({ "b/app.js": SCRIPT });
    try {
      assert.notEqual(stampBuild([one]).hash, stampBuild([two]).hash);
    } finally {
      rmSync(one, { recursive: true, force: true });
      rmSync(two, { recursive: true, force: true });
    }
  });
});

// [DHL]: a built artifact carries the version of this format beside its build hash. The hash
// alone cannot be used safely — a reader that finds a symbols directory has to know what schema
// it is about to read before it reads it, and a build naming only its hash leaves that to be
// guessed from whichever directory the reader happened to be pointed at.
describe("the format's version rides with the build hash", () => {
  it("stamps both into a page, and reads both back", () => {
    const page = Buffer.from("<html><head><title>x</title></head><body></body></html>", "utf8");
    const stamped = stampInto("index.html", page, HASH);
    assert.ok(stamped);
    assert.equal(stampOf("index.html", stamped), HASH);
    assert.equal(versionOf("index.html", stamped), FORMAT_VERSION);
  });

  it("stamps both into a script and a source map", () => {
    const script = stampInto("app.js", Buffer.from("const a = 1;\n", "utf8"), HASH);
    assert.ok(script);
    assert.equal(versionOf("app.js", script), FORMAT_VERSION);
    const map = stampInto("app.js.map", Buffer.from('{"version":3,"sources":[]}', "utf8"), HASH);
    assert.ok(map);
    assert.equal(versionOf("app.js.map", map), FORMAT_VERSION);
    const reparsed: unknown = JSON.parse(map.toString("utf8"));
    assert.ok(reparsed !== null && typeof reparsed === "object");
    const members: Record<string, unknown> = { ...reparsed };
    assert.equal(members["version"], 3, "the map is still the JSON it was");
  });

  it("stays idempotent: stamping a stamped file gives the same bytes", () => {
    const once = stampInto("index.html", Buffer.from("<html><head></head></html>", "utf8"), HASH);
    assert.ok(once);
    const twice = stampInto("index.html", once, HASH);
    assert.ok(twice);
    assert.equal(twice.toString("utf8"), once.toString("utf8"));
  });

  it("does not change the build hash, which is over content and not over its own stamp", () => {
    const files = [{ path: "index.html", bytes: Buffer.from("<html><head></head></html>", "utf8") }];
    const plain = buildHash(files);
    const stamped = stampInto("index.html", files[0]?.bytes ?? Buffer.alloc(0), plain);
    assert.ok(stamped);
    assert.equal(buildHash([{ path: "index.html", bytes: stamped }]), plain, "a stamp must not change what it names");
  });

  it("answers null for a file whose kind has no place for either", () => {
    assert.equal(versionOf("logo.png", Buffer.from("\x89PNG", "binary")), null);
  });
});

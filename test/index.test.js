// test/index.test.js
"use strict";

const fs   = require("fs");
const path = require("path");
const {
  KQParser,
  KQError,
  KQValidationError,
  KQFileNotFoundError,
  KQEnvError,
} = require("../dist/index");

// ─────────────────────────────────────────────
// Tiny test runner
// ─────────────────────────────────────────────

let passed = 0, failed = 0, skipped = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ status: "pass", name });
    passed++;
  } catch (e) {
    results.push({ status: "fail", name, error: e.message });
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

function assertThrows(fn, errorName) {
  let threw = false, name = null;
  try { fn(); } catch (e) { threw = true; name = e.name; }
  if (!threw) throw new Error(`Expected an error to be thrown`);
  if (errorName && name !== errorName)
    throw new Error(`Expected ${errorName} but got ${name}`);
}

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const TMP     = path.join(__dirname, ".tmp");
const BASE    = path.join(TMP, "config.kq");
const PROD    = path.join(TMP, "config.prod.kq");
const BAD     = path.join(TMP, "bad.kq");
const CRLF    = path.join(TMP, "crlf.kq");
const QUOTED  = path.join(TMP, "quoted.kq");

if (!fs.existsSync(TMP)) fs.mkdirSync(TMP);

fs.writeFileSync(BASE, `
# Base config
@version = 1.0

::shared
  app_name = TestApp
  version  = 2.5
::end

::server
  host       = localhost
  port       = 3000
  debug      = true
  score      = 9.5
  db_pass    = $ENV:KQ_TEST_DB_PASS
  nullable   = null
::end

::client
  api_url = http://localhost:3000
  theme   = dark
  timeout = 5000
  retry   = 3
::end
`);

fs.writeFileSync(PROD, `
::shared
  env = production
::end

::server
  host  = 0.0.0.0
  port  = 8080
  debug = false
::end

::client
  api_url = https://api.example.com
  debug   = false
::end
`);

fs.writeFileSync(BAD, `
::server
  broken line without equals sign
::end
`);

// Windows-style CRLF line endings
fs.writeFileSync(CRLF, `::server\r\n  port = 4000\r\n::end\r\n`);

// Quoted string values
fs.writeFileSync(QUOTED, `
::server
  greeting = "hello world"
  name     = 'my app'
::end
`);

process.env.KQ_TEST_DB_PASS = "supersecret";

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

console.log("\n  kq-config test suite\n");
console.log("  ── Parsing ──────────────────────────────────");

test("parses string values", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.get("host") === "localhost", "host mismatch");
});

test("parses integer values", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.get("port") === 3000, "port should be int 3000");
  assert(typeof s.get("port") === "number", "port should be typeof number");
});

test("parses float values", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.get("score") === 9.5, "score should be float 9.5");
});

test("parses boolean true", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.get("debug") === true, "debug should be boolean true");
  assert(typeof s.get("debug") === "boolean", "debug should be typeof boolean");
});

test("parses null values", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.get("nullable") === null, "nullable should be null");
});

test("parses quoted strings (double quotes)", () => {
  const s = new KQParser(QUOTED, "server").load();
  assert(s.get("greeting") === "hello world", "quotes should be stripped");
});

test("parses quoted strings (single quotes)", () => {
  const s = new KQParser(QUOTED, "server").load();
  assert(s.get("name") === "my app", "single quotes should be stripped");
});

test("handles Windows CRLF line endings", () => {
  const s = new KQParser(CRLF, "server").load();
  assert(s.get("port") === 4000, "CRLF file port should be 4000");
});

test("strips inline comments", () => {
  const tmp = path.join(TMP, "inline.kq");
  fs.writeFileSync(tmp, `::server\n  port = 9000 # this is ignored\n::end\n`);
  const s = new KQParser(tmp, "server").load();
  assert(s.get("port") === 9000, "inline comment not stripped");
});

test("keys are lowercased", () => {
  const tmp = path.join(TMP, "case.kq");
  fs.writeFileSync(tmp, `::server\n  MyPort = 1234\n::end\n`);
  const s = new KQParser(tmp, "server").load();
  assert(s.get("myport") === 1234, "key should be lowercased");
});

test("role name is case-insensitive", () => {
  const s1 = new KQParser(BASE, "SERVER").load();
  const s2 = new KQParser(BASE, "server").load();
  assert(s1.get("port") === s2.get("port"), "role case should not matter");
});

console.log("\n  ── Blocks ───────────────────────────────────");

test("::shared values merged into server", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.get("app_name") === "TestApp", "server missing shared key");
  assert(s.get("version")  === 2.5,       "server missing shared version");
});

test("::shared values merged into client", () => {
  const c = new KQParser(BASE, "client").load();
  assert(c.get("app_name") === "TestApp", "client missing shared key");
});

test("server block not visible to client", () => {
  const c = new KQParser(BASE, "client").load();
  assert(c.get("db_pass") === undefined, "client should not see db_pass");
  assert(c.get("host")    === undefined, "client should not see host");
});

test("client block not visible to server", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.get("theme")   === undefined, "server should not see theme");
  assert(s.get("api_url") === undefined, "server should not see api_url");
});

test("role-specific values override shared values", () => {
  const tmp = path.join(TMP, "override-shared.kq");
  fs.writeFileSync(tmp, `
::shared
  debug = false
::end
::server
  debug = true
::end
  `);
  const s = new KQParser(tmp, "server").load();
  assert(s.get("debug") === true, "role value should override shared");
});

console.log("\n  ── Environment variables ────────────────────");

test("resolves $ENV: variables", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.get("db_pass") === "supersecret", "$ENV: not resolved");
});

test("throws KQEnvError for unset $ENV: variable", () => {
  const tmp = path.join(TMP, "missing-env.kq");
  fs.writeFileSync(tmp, `::server\n  key = $ENV:KQ_DEFINITELY_NOT_SET_XYZ\n::end\n`);
  assertThrows(() => new KQParser(tmp, "server").load(), "KQEnvError");
});

test("KQ_<ROLE>_<KEY> env var overrides config value", () => {
  process.env.KQ_SERVER_PORT = "7777";
  const s = new KQParser(BASE, "server").load();
  assert(s.get("port") === 7777, "env override not applied");
  delete process.env.KQ_SERVER_PORT;
});

test("KQ_<ROLE>_<KEY> env var is type-cast", () => {
  process.env.KQ_SERVER_DEBUG = "false";
  const s = new KQParser(BASE, "server").load();
  assert(s.get("debug") === false, "env override should be cast to boolean");
  delete process.env.KQ_SERVER_DEBUG;
});

console.log("\n  ── Override files ────────────────────────────");

test("override file replaces base values", () => {
  const s = new KQParser(BASE, "server", PROD).load();
  assert(s.get("port")  === 8080,  "prod port should be 8080");
  assert(s.get("host")  === "0.0.0.0", "prod host mismatch");
  assert(s.get("debug") === false, "prod debug should be false");
});

test("override file shared block merged", () => {
  const s = new KQParser(BASE, "server", PROD).load();
  assert(s.get("env") === "production", "override shared not merged");
});

test("base values preserved when not overridden", () => {
  const s = new KQParser(BASE, "server", PROD).load();
  assert(s.get("score") === 9.5, "score should survive override");
});

console.log("\n  ── Validation ───────────────────────────────");

test("validation passes for correct schema", () => {
  const s = new KQParser(BASE, "server").load();
  s.validate({ port: { type: "number", required: true }, debug: { type: "boolean" } });
});

test("throws KQValidationError for missing required key", () => {
  const s = new KQParser(BASE, "server").load();
  assertThrows(
    () => s.validate({ missing_key: { required: true } }),
    "KQValidationError"
  );
});

test("applies default for optional missing key", () => {
  const s = new KQParser(BASE, "server").load();
  s.validate({ log_level: { type: "string", required: false, default: "info" } });
  assert(s.get("log_level") === "info", "default not applied");
});

test("throws KQValidationError for type mismatch", () => {
  const s = new KQParser(BASE, "server").load();
  assertThrows(
    () => s.validate({ port: { type: "string" } }),  // port is number, not string
    "KQValidationError"
  );
});

test("reports all errors at once (not just first)", () => {
  const s = new KQParser(BASE, "server").load();
  let msg = "";
  try {
    s.validate({
      missing_a: { required: true },
      missing_b: { required: true },
    });
  } catch (e) { msg = e.message; }
  assert(msg.includes("missing_a") && msg.includes("missing_b"), "should report all errors");
});

console.log("\n  ── API methods ──────────────────────────────");

test(".has() returns true for existing key", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.has("port") === true, "has() should return true");
});

test(".has() returns false for missing key", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.has("nonexistent") === false, "has() should return false");
});

test(".get() returns fallback for missing key", () => {
  const s = new KQParser(BASE, "server").load();
  assert(s.get("nonexistent", 42) === 42, "fallback not returned");
});

test(".all() returns a plain object copy", () => {
  const s   = new KQParser(BASE, "server").load();
  const all = s.all();
  all.port  = 0;  // mutate copy
  assert(s.get("port") === 3000, "all() should return a copy");
});

test(".keys() returns array of all keys", () => {
  const s = new KQParser(BASE, "server").load();
  const k = s.keys();
  assert(Array.isArray(k), "keys() should return an array");
  assert(k.includes("port"), "keys() should include 'port'");
});

test("methods throw KQError if called before .load()", () => {
  const s = new KQParser(BASE, "server");
  assertThrows(() => s.get("port"),    "KQError");
  assertThrows(() => s.has("port"),    "KQError");
  assertThrows(() => s.all(),          "KQError");
  assertThrows(() => s.keys(),         "KQError");
  assertThrows(() => s.validate({}),   "KQError");
});

console.log("\n  ── Error handling ───────────────────────────");

test("throws KQFileNotFoundError for missing file", () => {
  assertThrows(
    () => new KQParser("does-not-exist.kq", "server").load(),
    "KQFileNotFoundError"
  );
});

test("throws KQError for invalid syntax", () => {
  assertThrows(() => new KQParser(BAD, "server").load(), "KQError");
});

test("throws KQError for invalid constructor args", () => {
  assertThrows(() => new KQParser("",      "server"), "KQError");
  assertThrows(() => new KQParser("a.kq",  ""),       "KQError");
});

// ─────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────

// Cleanup
fs.rmSync(TMP, { recursive: true, force: true });

console.log("\n" + "─".repeat(50));
results.forEach(r => {
  if (r.status === "pass") {
    console.log(`  ✅  ${r.name}`);
  } else {
    console.log(`  ❌  ${r.name}`);
    console.log(`       → ${r.error}`);
  }
});

console.log("─".repeat(50));
console.log(`\n  ${passed} passed  |  ${failed} failed  |  ${skipped} skipped\n`);

if (failed > 0) process.exit(1);

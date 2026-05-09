// test/index.test.js
const path = require("path");
const fs = require("fs");
const { KQParser, KQError, KQValidationError } = require("../src/index");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

// Create a temp config file for testing
const tmpConfig = path.join(__dirname, "tmp.kq");
const tmpProd   = path.join(__dirname, "tmp.prod.kq");

fs.writeFileSync(tmpConfig, `
@version = 1.0

::shared
  app_name = TestApp
  version = 2.0
::end

::server
  port = 3000
  debug = true
  score = 9.5
  db_pass = $ENV:TEST_DB_PASS
::end

::client
  api_url = http://localhost:3000
  theme = dark
  timeout = 5000
::end
`);

fs.writeFileSync(tmpProd, `
::server
  port = 8080
  debug = false
::end

::client
  api_url = https://api.example.com
::end
`);

process.env.TEST_DB_PASS = "secret123";

console.log("\n  kq-config test suite\n");

test("parses server block correctly", () => {
  const s = new KQParser(tmpConfig, "server").load();
  assert(s.get("port") === 3000,          "port should be int 3000");
  assert(s.get("debug") === true,         "debug should be bool true");
  assert(s.get("score") === 9.5,          "score should be float 9.5");
});

test("parses client block correctly", () => {
  const c = new KQParser(tmpConfig, "client").load();
  assert(c.get("api_url") === "http://localhost:3000", "api_url mismatch");
  assert(c.get("theme")   === "dark",                  "theme should be dark");
  assert(c.get("timeout") === 5000,                    "timeout should be int 5000");
});

test("merges shared block into both roles", () => {
  const s = new KQParser(tmpConfig, "server").load();
  const c = new KQParser(tmpConfig, "client").load();
  assert(s.get("app_name") === "TestApp", "server missing shared key");
  assert(c.get("app_name") === "TestApp", "client missing shared key");
});

test("resolves $ENV: variables", () => {
  const s = new KQParser(tmpConfig, "server").load();
  assert(s.get("db_pass") === "secret123", "env var not resolved");
});

test("applies prod override file", () => {
  const s = new KQParser(tmpConfig, "server", tmpProd).load();
  assert(s.get("port")  === 8080,  "prod port should be 8080");
  assert(s.get("debug") === false, "prod debug should be false");
});

test("runtime env var overrides everything (KQ_SERVER_PORT)", () => {
  process.env.KQ_SERVER_PORT = "9999";
  const s = new KQParser(tmpConfig, "server").load();
  assert(s.get("port") === 9999, "runtime override not applied");
  delete process.env.KQ_SERVER_PORT;
});

test("validates required fields", () => {
  const s = new KQParser(tmpConfig, "server").load();
  let threw = false;
  try {
    s.validate({ missing_key: { type: "string", required: true } });
  } catch (e) {
    threw = e.name === "KQValidationError";
  }
  assert(threw, "should throw KQValidationError for missing required key");
});

test("applies default values for optional missing keys", () => {
  const s = new KQParser(tmpConfig, "server").load();
  s.validate({ log_level: { type: "string", required: false, default: "info" } });
  assert(s.get("log_level") === "info", "default not applied");
});

test("all() returns a copy of config", () => {
  const s = new KQParser(tmpConfig, "server").load();
  const all = s.all();
  all.port = 0;
  assert(s.get("port") === 3000, "all() should return a copy, not a reference");
});

test("throws KQError for missing file", () => {
  let threw = false;
  try { new KQParser("nonexistent.kq", "server").load(); }
  catch (e) { threw = e.name === "KQError"; }
  assert(threw, "should throw KQError for missing file");
});

test("throws KQError for missing env variable", () => {
  delete process.env.TEST_DB_PASS;
  let threw = false;
  try { new KQParser(tmpConfig, "server").load(); }
  catch (e) { threw = e.name === "KQError"; }
  assert(threw, "should throw KQError for unset env var");
  process.env.TEST_DB_PASS = "secret123";
});

// Cleanup temp files
fs.unlinkSync(tmpConfig);
fs.unlinkSync(tmpProd);

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

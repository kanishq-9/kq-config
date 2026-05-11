# kq-config

[![npm version](https://img.shields.io/npm/v/kq-config.svg)](https://www.npmjs.com/package/kq-config)
[![CI](https://github.com/kanishq-9/kq-config/actions/workflows/ci.yml/badge.svg)](https://github.com/kanishq-9/kq-config/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/kq-config)](package.json)

A professional `.kq` config file parser for Node.js with server/client block separation, built-in `.env` support, environment-specific overrides, runtime overrides, and schema validation — with **zero external dependencies**.

---

## What does kq mean?

**kq** stands for **Konfig Query** — and is also formed from the first and last letters of the author's name, **Kanishq**.

The `.kq` extension is a custom config format built from the ground up — purpose-built for projects that need clean separation between server and client configuration, with professional-grade features baked in.

---

## Why kq-config?

Most config solutions give everyone access to everything. `kq-config` lets you define **server** and **client** blocks in a single file — your server only reads server values, your client only reads client values. Secrets never leak to the frontend.

```
config.kq
├── ::shared     → merged into both server and client
├── ::server     → server only (db passwords, jwt secrets, ports)
└── ::client     → client only (api urls, themes, timeouts)
```

---

## Features

- **Block separation** — `::server` and `::client` in one file; each side reads only its own
- **Shared values** — `::shared` block merged into both automatically
- **Built-in `.env` support** — no `dotenv` needed; loads your `.env` file automatically
- **Environment variable injection** — `$ENV:VAR_NAME` syntax; secrets never hardcoded
- **Layered overrides** — base config + environment-specific override (dev → prod)
- **Runtime overrides** — `KQ_SERVER_PORT=9999` beats everything
- **Schema validation** — required keys, type checking, and default values
- **Auto type casting** — `"3000"` becomes `3000`, `"true"` becomes `true`, automatically
- **TypeScript support** — full type definitions included
- **ESM + CJS** — works with both `import` and `require`
- **Zero dependencies** — no external packages needed

---

## Install

```bash
npm install kq-config
```

---

## Quick Start

**1. Create your config file:**

```
# config.kq

::shared
  app_name = MyApp
  version  = 1.0
::end

::server
  host       = localhost
  port       = 3000
  db_pass    = $ENV:DB_PASS
  secret_key = $ENV:SECRET_KEY
  debug      = true
::end

::client
  api_url = http://localhost:3000
  theme   = dark
  timeout = 5000
::end
```

**2. Create your `.env` file:**

```
DB_PASS=supersecret
SECRET_KEY=myjwtsecret
```

**3. Use it in your code:**

```js
const { KQParser } = require("kq-config");
const path = require("path");

// Server — reads ::shared + ::server, resolves $ENV: from .env automatically
const server = new KQParser(path.join(__dirname, "config.kq"), "server").load();
console.log(server.get("port"));    // 3000
console.log(server.get("db_pass")); // "supersecret"

// Client — reads ::shared + ::client only (never sees server secrets)
const client = new KQParser(path.join(__dirname, "config.kq"), "client").load();
console.log(client.get("api_url")); // "http://localhost:3000"
console.log(client.get("db_pass")); // undefined — client can never see this
```

---

## Import Styles

### CommonJS
```js
const { KQParser } = require("kq-config");
```

### ES Module
```js
import { KQParser } from "kq-config";
```

### TypeScript
```ts
import { KQParser, KQSchema, KQOptions } from "kq-config";
```

---

## Recommended Project Setup

```
your-project/
├── config.kq               ← base config        (commit to git)
├── config.prod.kq          ← production values  (DO NOT commit — add to .gitignore)
├── config.prod.kq.example  ← prod template      (commit to git)
├── .env                    ← your secrets       (DO NOT commit — add to .gitignore)
├── .env.example            ← secrets template   (commit to git)
└── server.js
```

**.gitignore:**
```
.env
config.prod.kq
config.staging.kq
```

**.env.example** (commit this — dummy values only):
```
DB_USER=your_db_username
DB_PASS=your_db_password
SECRET_KEY=your_jwt_secret
```

---

## Built-in .env Support

No need to install `dotenv`. `kq-config` automatically finds and loads `.env` from the same folder as your `config.kq` file.

```
your-project/
├── config.kq   ← parser looks here
└── .env        ← automatically loaded from same folder
```

```js
// .env is loaded automatically — nothing extra needed
const server = new KQParser("config.kq", "server").load();
```

### Custom .env path
```js
new KQParser("config.kq", "server", null, { envFile: ".env.production" })
```

### Disable .env loading
```js
new KQParser("config.kq", "server", null, { envFile: false })
```

### Shell always wins over .env file
```
.env file      ← loaded first (lower priority)
shell env var  ← wins if same key set in shell (higher priority)
```

Production systems that inject secrets via the shell are never accidentally overridden by a `.env` file.

---

## Environment-specific Overrides

Create a `config.prod.kq` with **only what changes** in production. Everything else stays from `config.kq`:

```
# config.prod.kq

::server
  host      = 0.0.0.0
  port      = 8080
  db_host   = prod-db.example.com
  db_name   = mydb_prod
  debug     = false
  log_level = warn
::end

::client
  api_url = https://api.example.com
  timeout = 10000
::end
```

Load it based on `APP_ENV`:

```js
const env = process.env.APP_ENV || "development";

const overrides = {
  production: "config.prod.kq",
  staging:    "config.staging.kq",
};

const overrideFile = overrides[env]
  ? path.join(__dirname, overrides[env])
  : null;

const server = new KQParser(
  path.join(__dirname, "config.kq"),
  "server",
  overrideFile
).load();
```

**Run commands:**

```bash
# Mac / Linux
node server.js                      # development
APP_ENV=staging node server.js      # staging
APP_ENV=production node server.js   # production

# Windows Command Prompt
set APP_ENV=production && node server.js

# Windows PowerShell
$env:APP_ENV="production"; node server.js
```

**package.json scripts:**
```json
{
  "scripts": {
    "start":         "node server.js",
    "start:staging": "APP_ENV=staging node server.js",
    "start:prod":    "APP_ENV=production node server.js"
  }
}
```

---

## Schema Validation

Validate your config at startup — fail immediately with clear errors:

```js
const server = new KQParser("config.kq", "server")
  .load()
  .validate({
    host:       { type: "string",  required: true },
    port:       { type: "number",  required: true },
    secret_key: { type: "string",  required: true },
    debug:      { type: "boolean", required: false, default: false },
    log_level:  { type: "string",  required: false, default: "info" },
  });
```

If anything is wrong you get all errors listed at once:

```
KQValidationError: Config validation failed for role 'server':
  ✗ Required key 'secret_key' is missing in [server] config.
  ✗ 'port' — expected number, got string (value: "3000")
```

---

## Runtime Overrides

Override any config value without touching any file:

```bash
# Pattern: KQ_<ROLE>_<KEY>=value
KQ_SERVER_PORT=9999 node server.js
KQ_CLIENT_THEME=light node server.js
KQ_SERVER_DEBUG=false node server.js
```

Values are automatically type-cast — `"false"` becomes `false`, `"9999"` becomes `9999`.

---

## Override Priority

```
.env file
      ↓
config.kq (::shared)
      ↓
config.kq (::server or ::client)
      ↓
config.prod.kq (::shared)
      ↓
config.prod.kq (::server or ::client)
      ↓
shell environment variables
      ↓
KQ_SERVER_PORT=9999   ← always wins — highest priority
```

---

## .kq File Syntax

```
# Full-line comment (ignored)
@version = 1.0          ← meta directive (ignored by parser, just for humans)

::shared                ← open shared block (merged into both server and client)
  app_name = MyApp
::end                   ← close block

::server
  port     = 3000               integer — auto cast
  debug    = true               boolean — auto cast
  score    = 9.5                float   — auto cast
  nullable = null               null    — auto cast
  greeting = "hello world"      quoted string (quotes stripped)
  name     = 'my app'           single quotes also work
  db_pass  = $ENV:DB_PASS       injected from environment variable
  timeout  = 5000 # ms          inline comment (ignored after space #)
::end

::client
  api_url = http://localhost:3000
::end
```

### Auto Type Casting

| Value in file    | Parsed as                            |
|------------------|--------------------------------------|
| `3000`           | `3000` (integer)                     |
| `3.14`           | `3.14` (float)                       |
| `true`/`false`   | `true`/`false` (boolean)             |
| `null`           | `null`                               |
| `"hello world"`  | `"hello world"` (quotes stripped)    |
| `'hello world'`  | `"hello world"` (quotes stripped)    |
| anything else    | string                               |

### Rules
- Keys are **case-insensitive** — `PORT` and `port` are the same key
- Role names are **case-insensitive** — `::SERVER` and `::server` are the same
- `::shared` values are merged into both server and client
- Role-specific values override shared values if the same key exists
- Lines starting with `#` are ignored entirely
- Anything after ` #` on a value line is an inline comment

---

## API Reference

### `new KQParser(filepath, role, overrideFile?, options?)`

| Parameter      | Type            | Default | Description |
|----------------|-----------------|---------|-------------|
| `filepath`     | `string`        | —       | Path to your `.kq` file |
| `role`         | `string`        | —       | `"server"`, `"client"`, or any custom block name |
| `overrideFile` | `string\|null`  | `null`  | Optional environment override file |
| `options`      | `KQOptions`     | `{}`    | Optional settings |

**KQOptions:**

| Option    | Type            | Default                        | Description |
|-----------|-----------------|--------------------------------|-------------|
| `envFile` | `string\|false` | `.env` next to your config file | Custom `.env` path, or `false` to disable |

---

### `.load()` → `this`

Loads and merges all config layers. Must be called before any other method. Returns `this` for chaining.

---

### `.validate(schema)` → `this`

Validates config against a schema. Applies defaults for optional missing keys. Throws `KQValidationError` listing all errors at once. Returns `this` for chaining.

---

### `.get(key, fallback?)` → `value`

Returns a single config value. Returns `fallback` if the key doesn't exist.

```js
server.get("port")         // 3000
server.get("missing")      // undefined
server.get("missing", 80)  // 80
```

---

### `.has(key)` → `boolean`

```js
server.has("port")    // true
server.has("missing") // false
```

---

### `.all()` → `object`

Returns a shallow copy of all config values.

```js
server.all()
// { app_name: "MyApp", port: 3000, host: "localhost", debug: true, ... }
```

---

### `.keys()` → `string[]`

```js
server.keys()
// [ "app_name", "version", "port", "host", "debug", ... ]
```

---

## Error Handling

```js
const {
  KQParser,
  KQFileNotFoundError,
  KQEnvError,
  KQValidationError,
} = require("kq-config");

try {
  const server = new KQParser("config.kq", "server")
    .load()
    .validate({
      port:       { type: "number", required: true },
      secret_key: { type: "string", required: true },
    });

} catch (e) {
  if (e.name === "KQFileNotFoundError") {
    console.error("Config file not found:", e.filepath);

  } else if (e.name === "KQEnvError") {
    console.error(`Missing env var '${e.varName}' — add it to your .env file`);

  } else if (e.name === "KQValidationError") {
    console.error("Config invalid:\n", e.message);
  }

  process.exit(1);
}
```

### Error Types

| Error                 | When thrown                        | Extra properties |
|-----------------------|------------------------------------|------------------|
| `KQError`             | Base class for all kq-config errors | —               |
| `KQFileNotFoundError` | Config file not found              | `.filepath`      |
| `KQEnvError`          | `$ENV:VAR` not set anywhere        | `.varName`       |
| `KQValidationError`   | Schema validation fails            | —                |

---

## Full Example — Express Server

```js
// server.js
const express = require("express");
const path    = require("path");
const {
  KQParser,
  KQFileNotFoundError,
  KQEnvError,
  KQValidationError,
} = require("kq-config");

// ── Load config ──────────────────────────────────────
const env = process.env.APP_ENV || "development";

const overrides = {
  production: "config.prod.kq",
  staging:    "config.staging.kq",
};

const overrideFile = overrides[env]
  ? path.join(__dirname, overrides[env])
  : null;

let config;
try {
  config = new KQParser(
    path.join(__dirname, "config.kq"),
    "server",
    overrideFile
  )
  .load()
  .validate({
    host:       { type: "string",  required: true },
    port:       { type: "number",  required: true },
    secret_key: { type: "string",  required: true },
    debug:      { type: "boolean", required: false, default: false },
  });
} catch (e) {
  if (e.name === "KQFileNotFoundError") console.error("Config not found:", e.filepath);
  else if (e.name === "KQEnvError")     console.error("Missing env var:", e.varName);
  else                                  console.error("Config error:", e.message);
  process.exit(1);
}

// ── Start server ─────────────────────────────────────
const app = express();

app.get("/", (req, res) => {
  res.json({
    app: config.get("app_name"),
    env,
    version: config.get("version"),
  });
});

app.listen(config.get("port"), config.get("host"), () => {
  console.log(`${config.get("app_name")} running in ${env} mode`);
  console.log(`Listening on http://${config.get("host")}:${config.get("port")}`);
});
```

---

## TypeScript Example

```ts
import { KQParser, KQSchema, KQOptions } from "kq-config";
import path from "path";

const schema: KQSchema = {
  host:       { type: "string",  required: true },
  port:       { type: "number",  required: true },
  secret_key: { type: "string",  required: true },
  debug:      { type: "boolean", required: false, default: false },
};

const server = new KQParser(
  path.join(__dirname, "config.kq"),
  "server",
  "config.prod.kq",
  { envFile: ".env.production" }
)
.load()
.validate(schema);

const port = server.get("port") as number;
console.log(`Port: ${port}`);
```

---

## License

[MIT](LICENSE) — © 2026 kanishq-9

---

## Security Features

kq-config has professional-grade security built in — no extra packages needed.

---

### 1. Encrypted values (`ENC:` syntax)

Store encrypted secrets directly in your `.kq` file using AES-256-GCM encryption. Even if someone gets your config file, they cannot read the secrets without the master key.

**Step 1 — Generate a master key (run once):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: 3a7bd3e2360a3d29eea436fcfb7e44c735d117c7888a8660b1e5c8c51b9ff59f
```

**Step 2 — Add it to your `.env`:**
```
KQ_MASTER_KEY=3a7bd3e2360a3d29eea436fcfb7e44c735d117c7888a8660b1e5c8c51b9ff59f
```

**Step 3 — Encrypt your secrets:**
```js
const { KQParser } = require("kq-config");

// Set KQ_MASTER_KEY in your shell or .env first
const encrypted = KQParser.encrypt("mysupersecretpassword");
console.log(encrypted);
// ENC:aGVsbG8gd29ybGQ=:abc123:xyz456
```

**Step 4 — Paste the ENC: value into your `config.kq`:**
```
::server
  host       = localhost
  port       = 3000
  db_pass    = ENC:aGVsbG8gd29ybGQ=:abc123:xyz456
  secret_key = ENC:dGhpcyBpcyBhIHNlY3JldA==:def456:uvw789
::end
```

**Step 5 — Load as normal — decryption is automatic:**
```js
const { KQParser } = require("kq-config");

// KQ_MASTER_KEY loaded from .env automatically
const server = new KQParser("config.kq", "server").load();

console.log(server.get("db_pass"));    // "mysupersecretpassword" ✅
console.log(server.get("secret_key")); // "myjwtsecretkey" ✅
```

**Decrypt a value manually:**
```js
const decrypted = KQParser.decrypt("ENC:aGVsbG8gd29ybGQ=:abc123:xyz456");
console.log(decrypted); // "mysupersecretpassword"
```

---

### 2. Secret masking

Prevent secrets from appearing in logs or debug output:

```js
const server = new KQParser("config.kq", "server").load();

// Without masking — shows real values (default)
console.log(server.all());
// { port: 3000, db_pass: "mysupersecretpassword", secret_key: "jwt123" }

// With masking — secrets hidden
console.log(server.all(true));
// { port: 3000, db_pass: "***MASKED***", secret_key: "***MASKED***" }

// Always mask — set once in constructor
const server = new KQParser("config.kq", "server", null, { mask: true }).load();
server.all(); // always returns masked values
```

Keys that are automatically masked: anything matching `password`, `secret`, `token`, `api_key`, `private_key`, `auth`, `credential`, `jwt`.

---

### 3. Raw secret detection

If you accidentally put a raw secret directly in your `.kq` file, kq-config warns you:

```
# config.kq — WARNING triggered
::server
  db_pass = ghp_abc123XYZ789realtoken   ← looks like a GitHub token
::end
```

```
Warning: kq-config: Key 'db_pass' looks like a secret but has a raw value.
         Consider using '$ENV:DB_PASS' or 'ENC:' encryption instead.
```

---

### 4. `$ENV:` vs `ENC:` — when to use which

| | `$ENV:VAR` | `ENC:ciphertext` |
|---|---|---|
| Secret lives in | `.env` file or shell | inside `config.kq` |
| Readable in config | no — just a reference | no — encrypted |
| Needs master key | no | yes — `KQ_MASTER_KEY` |
| Best for | local dev, CI/CD | committing config to git safely |
| Can commit to git | no — keep `.env` out of git | yes — encrypted values are safe |

**Recommendation:**
```
Local development    → $ENV:   (secrets in .env, never committed)
Commit config to git → ENC:    (encrypted in config.kq, safe to commit)
CI/CD pipelines      → $ENV:   (inject via environment secrets)
Ultra sensitive      → ENC: + $ENV:KQ_MASTER_KEY  (best of both)
```

---

### 5. All security protections

| Protection | What it blocks |
|---|---|
| Path traversal | `../../etc/passwd` style attacks |
| Prototype pollution | `__proto__`, `constructor`, `prototype` keys |
| ReDoS | Values over 10,000 characters |
| Memory exhaustion | Files over 1MB |
| Key length | Keys over 256 characters |
| Null bytes | Null bytes in values |
| Control characters | Control characters in values |
| Env hijacking | `.env` cannot overwrite `NODE_OPTIONS`, `PATH` etc. |
| Circular override | Base and override cannot be the same file |
| Supply chain | Zero external dependencies |
| Tampering | npm provenance — every release cryptographically signed |

---

### 6. Reporting a vulnerability

Please do not open a public GitHub issue for security vulnerabilities.
See [SECURITY.md](SECURITY.md) for how to report privately.
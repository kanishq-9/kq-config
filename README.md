# kq-config

[![npm version](https://img.shields.io/npm/v/kq-config.svg)](https://www.npmjs.com/package/kq-config)
[![CI](https://github.com/yourusername/kq-config/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/kq-config/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/kq-config)](package.json)

A professional `.kq` config file parser with:

- **Block separation** — `::server` and `::client` blocks in one file; each side only reads its own
- **Shared values** — `::shared` block merged into both automatically
- **Environment variable injection** — `$ENV:VAR_NAME` syntax; secrets never hardcoded
- **Layered overrides** — base config + environment-specific override (dev → prod)
- **Runtime overrides** — `KQ_SERVER_PORT=9999` beats everything
- **Schema validation** — required keys, type checking, default values
- **TypeScript support** — full type definitions included
- **ESM + CJS** — works with both `import` and `require`

---

## Install

```bash
npm install kq-config
```

---

## Your config.kq file

```
# config.kq

@version = 1.0

::shared
  app_name = MyApp
  version  = 1.0
::end

::server
  host       = localhost
  port       = 3000
  db_host    = localhost
  db_name    = mydb
  db_user    = $ENV:DB_USER
  db_pass    = $ENV:DB_PASS
  secret_key = $ENV:SECRET_KEY
  debug      = true
  log_level  = info
::end

::client
  api_url = http://localhost:3000
  theme   = dark
  timeout = 5000
  retry   = 3
::end
```

---

## Usage

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
import { KQParser, KQSchema } from "kq-config";
```

---

### Basic usage

```js
import { KQParser } from "kq-config";

// Server
const server = new KQParser("config.kq", "server")
  .load()
  .validate({
    host:       { type: "string",  required: true },
    port:       { type: "number",  required: true },
    secret_key: { type: "string",  required: true },
    debug:      { type: "boolean", required: false, default: false },
  });

console.log(server.get("port"));   // 3000
console.log(server.get("host"));   // "localhost"

// Client
const client = new KQParser("config.kq", "client")
  .load()
  .validate({
    api_url: { type: "string", required: true },
    timeout: { type: "number", required: true },
    theme:   { type: "string", required: false, default: "light" },
  });

console.log(client.get("api_url")); // "http://localhost:3000"
```

---

### Production overrides

Create a `config.prod.kq` with only the values that change:

```
# config.prod.kq

::server
  host      = 0.0.0.0
  port      = 8080
  db_host   = prod-db.example.com
  debug     = false
  log_level = warn
::end

::client
  api_url = https://api.example.com
  debug   = false
::end
```

Load the override based on `APP_ENV`:

```js
const env          = process.env.APP_ENV || "development";
const overrideFile = env === "production" ? "config.prod.kq" : null;

const server = new KQParser("config.kq", "server", overrideFile).load();
```

---

### Runtime override via environment variables

Any value can be overridden at runtime with `KQ_<ROLE>_<KEY>`:

```bash
# Override port for server
KQ_SERVER_PORT=9999 node app.js

# Override theme for client
KQ_CLIENT_THEME=light node app.js
```

---

## .kq Syntax Reference

| Syntax                    | Meaning                                    |
|---------------------------|--------------------------------------------|
| `::server`                | Open server block                          |
| `::client`                | Open client block                          |
| `::shared`                | Open shared block (merged into both)       |
| `::end`                   | Close the current block                    |
| `key = value`             | Key-value pair                             |
| `$ENV:VARIABLE_NAME`      | Inject from environment variable           |
| `# comment`               | Full-line comment (ignored)                |
| `key = value # comment`   | Inline comment (ignored after `space #`)   |
| `@version = 1.0`          | Meta directive (not parsed, for humans)    |
| `"value"` or `'value'`    | Quoted strings (quotes are stripped)       |

### Auto type casting

| Raw string in file | Parsed as     |
|--------------------|---------------|
| `3000`             | `3000` (int)  |
| `3.14`             | `3.14` (float)|
| `true` / `false`   | boolean       |
| `null`             | `null`        |
| `"hello world"`    | `"hello world"` (string, quotes stripped) |
| anything else      | string        |

---

## API

### `new KQParser(filepath, role, overrideFile?)`

| Parameter      | Type            | Description                                    |
|----------------|-----------------|------------------------------------------------|
| `filepath`     | `string`        | Path to your `.kq` file                        |
| `role`         | `string`        | `"server"`, `"client"`, or any custom block name |
| `overrideFile` | `string\|null`  | Optional path to an override file              |

---

### `.load()` → `this`

Loads and merges all layers. Must be called before any other method.

**Priority order (lowest → highest):**
1. `::shared` in base file
2. `::<role>` in base file
3. `::shared` in override file
4. `::<role>` in override file
5. `KQ_<ROLE>_<KEY>` environment variables

---

### `.validate(schema)` → `this`

Validates the loaded config against a schema. Applies defaults for optional keys.

```js
server.validate({
  port:      { type: "number",  required: true },
  debug:     { type: "boolean", required: false, default: false },
  log_level: { type: "string",  required: false, default: "info" },
});
```

Throws `KQValidationError` listing **all** validation errors at once.

---

### `.get(key, fallback?)` → `value`

Returns a single config value. Optionally returns `fallback` if the key doesn't exist.

```js
server.get("port")        // 3000
server.get("missing", 80) // 80
```

---

### `.has(key)` → `boolean`

```js
server.has("port")     // true
server.has("missing")  // false
```

---

### `.all()` → `object`

Returns a shallow copy of all config values.

---

### `.keys()` → `string[]`

Returns all config keys.

---

## Error types

| Error                  | When it's thrown                               |
|------------------------|------------------------------------------------|
| `KQError`              | Base class for all kq-config errors            |
| `KQValidationError`    | Schema validation fails                        |
| `KQFileNotFoundError`  | Config file not found (has `.filepath` prop)   |
| `KQEnvError`           | `$ENV:VAR` variable not set (has `.varName` prop) |

```js
import { KQParser, KQValidationError, KQEnvError } from "kq-config";

try {
  const server = new KQParser("config.kq", "server").load().validate(schema);
} catch (e) {
  if (e.name === "KQEnvError") {
    console.error(`Missing env var: ${e.varName}`);
  } else if (e.name === "KQValidationError") {
    console.error("Config invalid:\n", e.message);
  }
}
```

---

## Override priority diagram

```
config.kq (::shared)
      ↓  merged first
config.kq (::server or ::client)
      ↓  role-specific values win over shared
config.prod.kq (::shared)
      ↓  override shared on top
config.prod.kq (::server or ::client)
      ↓  override role values on top
KQ_SERVER_PORT=9999 (env var)
      ↓  always wins — highest priority
```

---

## License

[MIT](LICENSE)

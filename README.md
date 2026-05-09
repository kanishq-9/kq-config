# kq-config

A professional config parser for `.kq` files with server/client block separation,
environment variable injection, layered overrides, and schema validation.

## Install

```bash
npm install kq-config
```

## Your config.kq file

```
::shared
  app_name = MyApp
  version  = 1.0
::end

::server
  port       = 3000
  db_pass    = $ENV:DB_PASS
  secret_key = $ENV:SECRET_KEY
::end

::client
  api_url = http://localhost:3000
  theme   = dark
  timeout = 5000
::end
```

## Usage

```js
const { KQParser } = require("kq-config");

// Server
const server = new KQParser("config.kq", "server")
  .load()
  .validate({
    port:       { type: "number", required: true },
    secret_key: { type: "string", required: true },
  });

console.log(server.get("port")); // 3000

// Client
const client = new KQParser("config.kq", "client")
  .load()
  .validate({
    api_url: { type: "string", required: true },
    timeout: { type: "number", required: true },
  });

console.log(client.get("api_url")); // http://localhost:3000
```

## Production overrides

```js
const env = process.env.APP_ENV || "development";
const overrideFile = env === "production" ? "config.prod.kq" : null;

const server = new KQParser("config.kq", "server", overrideFile).load();
```

## Runtime override via environment variable

Any value can be overridden at runtime using `KQ_<ROLE>_<KEY>`:

```bash
KQ_SERVER_PORT=9999 node app.js
KQ_CLIENT_THEME=light node app.js
```

## Syntax

| Syntax         | Meaning                              |
|----------------|--------------------------------------|
| `::server`     | Start server block                   |
| `::client`     | Start client block                   |
| `::shared`     | Start shared block (merged into both)|
| `::end`        | End any block                        |
| `$ENV:VAR`     | Inject from environment variable     |
| `# comment`    | Full-line or inline comment          |
| `@version`     | Meta directive (not parsed)          |

## API

### `new KQParser(filepath, role, overrideFile?)`
### `.load()` → loads and merges all layers, returns `this`
### `.validate(schema)` → validates config, returns `this`
### `.get(key, default?)` → returns a single value
### `.all()` → returns all values as a plain object

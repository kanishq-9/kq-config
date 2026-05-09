"use strict";

const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────
// Custom error classes
// ─────────────────────────────────────────────

class KQError extends Error {
  constructor(message) {
    super(message);
    this.name = "KQError";
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

class KQValidationError extends KQError {
  constructor(message) {
    super(message);
    this.name = "KQValidationError";
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

class KQFileNotFoundError extends KQError {
  constructor(filepath) {
    super(`Config file not found: '${filepath}'`);
    this.name = "KQFileNotFoundError";
    this.filepath = filepath;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

class KQEnvError extends KQError {
  constructor(varName) {
    super(
      `Environment variable '${varName}' is not set.\n` +
      `  Add it to your shell or a .env loader before running.`
    );
    this.name = "KQEnvError";
    this.varName = varName;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

// ─────────────────────────────────────────────
// Type helpers
// ─────────────────────────────────────────────

function castValue(raw) {
  if (typeof raw !== "string") return raw;
  const lower = raw.toLowerCase();
  if (lower === "true")  return true;
  if (lower === "false") return false;
  if (lower === "null")  return null;
  if (raw.trim() !== "" && !isNaN(raw)) {
    return raw.includes(".") ? parseFloat(raw) : parseInt(raw, 10);
  }
  // Strip surrounding quotes: "hello" or 'hello' → hello
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

function resolveEnv(value) {
  return value.replace(/\$ENV:([A-Z_][A-Z0-9_]*)/g, (_, varName) => {
    const val = process.env[varName];
    if (val === undefined) throw new KQEnvError(varName);
    return val;
  });
}

// ─────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────

function parseFile(filepath) {
  const resolved = path.resolve(filepath);
  if (!fs.existsSync(resolved)) throw new KQFileNotFoundError(resolved);

  const content = fs.readFileSync(resolved, "utf-8");
  const lines   = content.split(/\r?\n/);  // handles Windows (CRLF) and Unix (LF)
  const blocks  = {};
  let currentBlock = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let line = lines[i].trim();

    // Skip blank lines and full-line comments
    if (!line || line.startsWith("#")) continue;

    // Strip inline comments — anything after  <space>#
    const inlineComment = line.indexOf(" #");
    if (inlineComment !== -1) line = line.slice(0, inlineComment).trim();

    // Skip meta directives (@version, @env, ...)
    if (line.startsWith("@")) continue;

    // Block open — ::server  ::client  ::shared  ::anything
    if (line.startsWith("::") && line !== "::end") {
      const name = line.slice(2).trim().toLowerCase();
      if (!name) throw new KQError(`Line ${lineNum}: Empty block name '::' is invalid.`);
      currentBlock = name;
      if (!blocks[currentBlock]) blocks[currentBlock] = {};
      continue;
    }

    // Block close
    if (line === "::end") {
      if (currentBlock === null)
        throw new KQError(`Line ${lineNum}: '::end' without an opening block.`);
      currentBlock = null;
      continue;
    }

    // Key = value pair
    if (currentBlock !== null) {
      if (!line.includes("="))
        throw new KQError(`Line ${lineNum}: Expected 'key = value', got '${line}'.`);

      const eqIdx = line.indexOf("=");
      const key   = line.slice(0, eqIdx).trim().toLowerCase();
      const raw   = line.slice(eqIdx + 1).trim();

      if (!key) throw new KQError(`Line ${lineNum}: Key cannot be empty.`);

      blocks[currentBlock][key] = castValue(resolveEnv(raw));
    }
  }

  // Warn about unclosed blocks (non-fatal, best-effort)
  if (currentBlock !== null) {
    process.emitWarning(
      `kq-config: Block '::${currentBlock}' was never closed with '::end' in '${filepath}'.`,
      "KQWarning"
    );
  }

  return blocks;
}

// ─────────────────────────────────────────────
// KQParser class
// ─────────────────────────────────────────────

class KQParser {
  /**
   * Create a new KQParser.
   * @param {string}      filepath     - Path to your config.kq file
   * @param {string}      role         - Which block to read: "server" | "client" | any custom name
   * @param {string|null} [overrideFile] - Optional override file (e.g. config.prod.kq)
   */
  constructor(filepath, role, overrideFile = null) {
    if (!filepath || typeof filepath !== "string")
      throw new KQError("filepath must be a non-empty string.");
    if (!role || typeof role !== "string")
      throw new KQError("role must be a non-empty string (e.g. 'server' or 'client').");

    this._filepath     = filepath;
    this._role         = role.toLowerCase();
    this._overrideFile = overrideFile || null;
    this._config       = {};
    this._loaded       = false;
  }

  // ── getters ────────────────────────────────

  get role()     { return this._role; }
  get filepath() { return this._filepath; }
  get loaded()   { return this._loaded; }

  // ── public API ─────────────────────────────

  /**
   * Load and merge all config layers in priority order:
   *   1. base file — ::shared block
   *   2. base file — ::<role> block
   *   3. override file — ::shared block  (if provided)
   *   4. override file — ::<role> block  (if provided)
   *   5. env vars — KQ_<ROLE>_<KEY>=value  (highest priority)
   *
   * @returns {this} for chaining
   */
  load() {
    const base = parseFile(this._filepath);
    const out  = {};

    // Layer 1 + 2: base file
    if (base["shared"])      Object.assign(out, base["shared"]);
    if (base[this._role])    Object.assign(out, base[this._role]);

    // Layer 3 + 4: override file
    if (this._overrideFile) {
      const over = parseFile(this._overrideFile);
      if (over["shared"])    Object.assign(out, over["shared"]);
      if (over[this._role])  Object.assign(out, over[this._role]);
    }

    // Layer 5: KQ_<ROLE>_<KEY>=value env vars
    const prefix = `KQ_${this._role.toUpperCase()}_`;
    for (const [k, v] of Object.entries(process.env)) {
      if (k.startsWith(prefix)) {
        const key = k.slice(prefix.length).toLowerCase();
        out[key]  = castValue(v);
      }
    }

    this._config = out;
    this._loaded = true;
    return this;
  }

  /**
   * Validate loaded config against a schema.
   *
   * Schema shape:
   * ```js
   * {
   *   port:    { type: "number",  required: true },
   *   debug:   { type: "boolean", required: false, default: false },
   *   host:    { type: "string",  required: true },
   * }
   * ```
   *
   * @param {Record<string, { type?: string, required?: boolean, default?: any }>} schema
   * @returns {this} for chaining
   * @throws {KQValidationError}
   */
  validate(schema) {
    if (!this._loaded)
      throw new KQError("Call .load() before .validate().");

    const errors = [];

    for (const [key, rules] of Object.entries(schema)) {
      const { required = false, type, default: def } = rules;

      if (!(key in this._config)) {
        if (required) {
          errors.push(`  ✗ Required key '${key}' is missing in [${this._role}] config.`);
        } else if (def !== undefined) {
          this._config[key] = def;
        }
        continue;
      }

      const actual = typeof this._config[key];
      if (type && actual !== type) {
        errors.push(
          `  ✗ '${key}' — expected ${type}, got ${actual} (value: ${JSON.stringify(this._config[key])})`
        );
      }
    }

    if (errors.length) {
      throw new KQValidationError(
        `Config validation failed for role '${this._role}':\n` + errors.join("\n")
      );
    }

    return this;
  }

  /**
   * Get a single config value.
   * @param {string} key
   * @param {*}      [fallback] - returned if key doesn't exist
   */
  get(key, fallback = undefined) {
    if (!this._loaded) throw new KQError("Call .load() before .get().");
    const k = key.toLowerCase();
    return k in this._config ? this._config[k] : fallback;
  }

  /**
   * Check if a key exists.
   * @param {string} key
   */
  has(key) {
    if (!this._loaded) throw new KQError("Call .load() before .has().");
    return key.toLowerCase() in this._config;
  }

  /**
   * Return all config values as a plain object (shallow copy).
   */
  all() {
    if (!this._loaded) throw new KQError("Call .load() before .all().");
    return Object.assign(Object.create(null), this._config);
  }

  /**
   * Return all config keys.
   */
  keys() {
    if (!this._loaded) throw new KQError("Call .load() before .keys().");
    return Object.keys(this._config);
  }

  toString() {
    return `KQParser(role="${this._role}", loaded=${this._loaded}, keys=${this.keys().length})`;
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `KQParser { role: '${this._role}', keys: [${this.keys().join(", ")}] }`;
  }
}

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

module.exports = {
  KQParser,
  KQError,
  KQValidationError,
  KQFileNotFoundError,
  KQEnvError,
};

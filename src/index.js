"use strict";

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

// ─────────────────────────────────────────────
// Security constants
// ─────────────────────────────────────────────

const BLOCKED_KEYS = new Set([
  "__proto__", "constructor", "prototype",
  "toString", "valueOf", "hasOwnProperty",
  "isPrototypeOf", "propertyIsEnumerable",
  "toLocaleString", "__defineGetter__",
  "__defineSetter__", "__lookupGetter__",
  "__lookupSetter__",
]);

const BLOCKED_ENV_KEYS = new Set([
  "NODE_OPTIONS", "NODE_PATH", "NODE_ENV",
  "PATH", "HOME", "USER", "SHELL", "USERNAME",
  "LD_PRELOAD", "LD_LIBRARY_PATH",
  "DYLD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES",
]);

const MAX_VALUE_LENGTH = 10000;
const MAX_FILE_SIZE    = 1024 * 1024;
const MAX_KEY_LENGTH   = 256;

// Keys that look like secrets — warn if raw value found
const SECRET_KEY_PATTERNS = [
  /pass(word)?/i, /secret/i, /token/i, /api_?key/i,
  /private_?key/i, /auth/i, /credential/i, /jwt/i,
];

// Patterns that suggest a value is a raw secret
const RAW_SECRET_PATTERNS = [
  /^[A-Za-z0-9+/]{32,}={0,2}$/,  // base64 looking
  /^[a-f0-9]{32,}$/,              // hex looking (md5/sha etc.)
  /^sk_/,                          // stripe style
  /^pk_/,
  /^ghp_/,                         // github token
  /^xoxb-/,                        // slack token
  /^ey[A-Za-z0-9]/,               // JWT
];

// ─────────────────────────────────────────────
// Encryption helpers (AES-256-GCM)
// ─────────────────────────────────────────────
// Syntax in .kq file:  key = ENC:<base64ciphertext>:<base64iv>:<base64tag>
// Master key set via:  KQ_MASTER_KEY environment variable
// Generate a key:      node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const ENC_PREFIX  = "ENC:";
const ENC_ALGO    = "aes-256-gcm";
const ENC_VERSION = "v1";

function getMasterKey() {
  const raw = process.env.KQ_MASTER_KEY;
  if (!raw) return null;
  // Accept hex (64 chars) or base64 (44 chars) — derive 32-byte key
  try {
    if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
    return Buffer.from(raw, "base64").slice(0, 32);
  } catch {
    return null;
  }
}

function encryptValue(plaintext, masterKey) {
  const iv  = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ENC_ALGO, masterKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: ENC:<ciphertext_b64>:<iv_b64>:<tag_b64>
  return (
    ENC_PREFIX +
    encrypted.toString("base64") + ":" +
    iv.toString("base64")        + ":" +
    tag.toString("base64")
  );
}

function decryptValue(encValue, masterKey) {
  // Strip ENC: prefix
  const parts = encValue.slice(ENC_PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new KQError(
      "Invalid ENC: format. Expected ENC:<ciphertext>:<iv>:<tag>"
    );
  }
  const [ciphertextB64, ivB64, tagB64] = parts;
  try {
    const ciphertext = Buffer.from(ciphertextB64, "base64");
    const iv         = Buffer.from(ivB64,         "base64");
    const tag        = Buffer.from(tagB64,        "base64");
    const decipher   = crypto.createDecipheriv(ENC_ALGO, masterKey, iv);
    decipher.setAuthTag(tag);
    const decrypted  = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf-8");
  } catch {
    throw new KQError(
      "Failed to decrypt ENC: value. " +
      "Check that KQ_MASTER_KEY is correct and the value has not been tampered with."
    );
  }
}

function resolveEncrypted(value, lineNum) {
  if (!value.startsWith(ENC_PREFIX)) return value;
  const masterKey = getMasterKey();
  if (!masterKey) {
    throw new KQError(
      `Line ${lineNum}: ENC: value found but KQ_MASTER_KEY is not set. ` +
      `Set it in your environment: export KQ_MASTER_KEY=<your-key>`
    );
  }
  return decryptValue(value, masterKey);
}

// ─────────────────────────────────────────────
// Secret detection
// ─────────────────────────────────────────────

function looksLikeSecret(key) {
  return SECRET_KEY_PATTERNS.some(p => p.test(key));
}

function looksLikeRawSecret(value) {
  if (typeof value !== "string") return false;
  if (value.length < 8) return false;
  return RAW_SECRET_PATTERNS.some(p => p.test(value));
}

// ─────────────────────────────────────────────
// Secret masking
// ─────────────────────────────────────────────

const MASKED = "***MASKED***";

function maskSecrets(obj) {
  const masked = Object.create(null);
  for (const [k, v] of Object.entries(obj)) {
    masked[k] = looksLikeSecret(k) ? MASKED : v;
  }
  return masked;
}

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
    this.name     = "KQFileNotFoundError";
    this.filepath = filepath;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

class KQEnvError extends KQError {
  constructor(varName) {
    super(
      `Environment variable '${varName}' is not set.\n` +
      `  Add it to your .env file or export it in your shell.`
    );
    this.name    = "KQEnvError";
    this.varName = varName;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

// ─────────────────────────────────────────────
// Built-in .env loader
// ─────────────────────────────────────────────

function loadEnvFile(envPath) {
  const resolved = path.resolve(envPath);
  if (!fs.existsSync(resolved)) return;

  const stat = fs.statSync(resolved);
  if (stat.size > MAX_FILE_SIZE) {
    process.emitWarning(
      `kq-config: .env file exceeds 1MB and was skipped.`,
      "KQSecurityWarning"
    );
    return;
  }

  const lines = fs.readFileSync(resolved, "utf-8").split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (!line.includes("=")) continue;

    const eqIdx = line.indexOf("=");
    const key   = line.slice(0, eqIdx).trim();
    let   value = line.slice(eqIdx + 1).trim();

    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    const ci = value.indexOf(" #");
    if (ci !== -1) value = value.slice(0, ci).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (BLOCKED_ENV_KEYS.has(key)) {
      process.emitWarning(
        `kq-config: Skipping protected system key '${key}' in .env file.`,
        "KQSecurityWarning"
      );
      continue;
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ─────────────────────────────────────────────
// Type casting
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
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

// ─────────────────────────────────────────────
// $ENV: resolver
// ─────────────────────────────────────────────

function resolveEnv(value) {
  return value.replace(/\$ENV:([A-Z_][A-Z0-9_]*)/g, (_, varName) => {
    const val = process.env[varName];
    if (val === undefined) throw new KQEnvError(varName);
    return val;
  });
}

// ─────────────────────────────────────────────
// File parser
// ─────────────────────────────────────────────

function parseFile(filepath) {
  const resolved = path.resolve(filepath);

  // Path traversal check
  const cwd = process.cwd();
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    throw new KQError(
      `Access denied: '${resolved}' is outside the working directory.`
    );
  }

  if (!fs.existsSync(resolved)) throw new KQFileNotFoundError(resolved);

  const stat = fs.statSync(resolved);
  if (stat.size > MAX_FILE_SIZE) {
    throw new KQError(`File '${resolved}' exceeds the 1MB size limit.`);
  }

  const content = fs.readFileSync(resolved, "utf-8");
  const lines   = content.split(/\r?\n/);
  const blocks  = Object.create(null);
  let currentBlock = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let line = lines[i].trim();

    if (!line || line.startsWith("#")) continue;

    const inlineComment = line.indexOf(" #");
    if (inlineComment !== -1) line = line.slice(0, inlineComment).trim();

    if (line.startsWith("@")) continue;

    // Block open
    if (line.startsWith("::") && line !== "::end") {
      const name = line.slice(2).trim().toLowerCase();
      if (!name) throw new KQError(`Line ${lineNum}: Empty block name '::' is invalid.`);
      currentBlock = name;
      if (!blocks[currentBlock]) blocks[currentBlock] = Object.create(null);
      continue;
    }

    // Block close
    if (line === "::end") {
      if (currentBlock === null)
        throw new KQError(`Line ${lineNum}: '::end' without an opening block.`);
      currentBlock = null;
      continue;
    }

    // Key = value
    if (currentBlock !== null) {
      if (!line.includes("="))
        throw new KQError(`Line ${lineNum}: Expected 'key = value', got '${line}'.`);

      const eqIdx = line.indexOf("=");
      const key   = line.slice(0, eqIdx).trim().toLowerCase();
      const raw   = line.slice(eqIdx + 1).trim();

      if (!key) throw new KQError(`Line ${lineNum}: Key cannot be empty.`);

      if (key.length > MAX_KEY_LENGTH)
        throw new KQError(`Line ${lineNum}: Key exceeds ${MAX_KEY_LENGTH} character limit.`);

      if (BLOCKED_KEYS.has(key))
        throw new KQError(`Line ${lineNum}: Key '${key}' is reserved and cannot be used.`);

      if (raw.length > MAX_VALUE_LENGTH)
        throw new KQError(`Line ${lineNum}: Value for '${key}' exceeds ${MAX_VALUE_LENGTH} character limit.`);

      if (raw.includes("\0"))
        throw new KQError(`Line ${lineNum}: Null bytes are not allowed in values.`);

      if (/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(raw))
        throw new KQError(`Line ${lineNum}: Control characters are not allowed in values.`);

      // Resolve in order: $ENV: → ENC: → cast
      let resolved = resolveEnv(raw);
      resolved     = resolveEncrypted(resolved, lineNum);
      const value  = castValue(resolved);

      // Secret detection warning
      if (
        looksLikeSecret(key) &&
        typeof value === "string" &&
        !raw.startsWith("$ENV:") &&
        !raw.startsWith("ENC:") &&
        looksLikeRawSecret(value)
      ) {
        process.emitWarning(
          `kq-config: Key '${key}' looks like a secret but has a raw value. ` +
          `Consider using '$ENV:${key.toUpperCase()}' or 'ENC:' encryption instead.`,
          "KQSecurityWarning"
        );
      }

      blocks[currentBlock][key] = value;
    }
  }

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
   * @param {string}        filepath       - Path to your .kq config file
   * @param {string}        role           - "server" | "client" | any block name
   * @param {string|null}   [overrideFile] - Optional override (e.g. config.prod.kq)
   * @param {object}        [options]
   * @param {string|false}  [options.envFile]  - .env path or false to disable
   * @param {boolean}       [options.mask]     - mask secrets in .all() output (default: false)
   */
  constructor(filepath, role, overrideFile = null, options = {}) {
    if (!filepath || typeof filepath !== "string")
      throw new KQError("filepath must be a non-empty string.");
    if (!role || typeof role !== "string")
      throw new KQError("role must be a non-empty string.");

    this._filepath     = filepath;
    this._role         = role.toLowerCase();
    this._overrideFile = overrideFile || null;
    this._config       = Object.create(null);
    this._loaded       = false;
    this._mask         = options.mask === true;

    const configDir  = path.dirname(path.resolve(filepath));
    const defaultEnv = path.join(configDir, ".env");
    this._envFile    = options.envFile !== undefined ? options.envFile : defaultEnv;
  }

  get role()     { return this._role; }
  get filepath() { return this._filepath; }
  get loaded()   { return this._loaded; }

  load() {
    // Circular override check
    if (this._overrideFile) {
      const base     = path.resolve(this._filepath);
      const override = path.resolve(this._overrideFile);
      if (base === override)
        throw new KQError("Override file cannot be the same as the base config file.");
    }

    if (this._envFile) loadEnvFile(this._envFile);

    const base = parseFile(this._filepath);
    const out  = Object.create(null);

    if (base["shared"])   Object.assign(out, base["shared"]);
    if (base[this._role]) Object.assign(out, base[this._role]);

    if (this._overrideFile) {
      const over = parseFile(this._overrideFile);
      if (over["shared"])   Object.assign(out, over["shared"]);
      if (over[this._role]) Object.assign(out, over[this._role]);
    }

    const prefix = `KQ_${this._role.toUpperCase()}_`;
    for (const [k, v] of Object.entries(process.env)) {
      if (k.startsWith(prefix)) {
        const key = k.slice(prefix.length).toLowerCase();
        if (!BLOCKED_KEYS.has(key)) out[key] = castValue(v);
      }
    }

    this._config = out;
    this._loaded = true;
    return this;
  }

  validate(schema) {
    if (!this._loaded)
      throw new KQError("Call .load() before .validate().");
    if (!schema || typeof schema !== "object")
      throw new KQError("Schema must be a non-null object.");

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

      if (type && typeof this._config[key] !== type) {
        errors.push(
          `  ✗ '${key}' — expected ${type}, got ${typeof this._config[key]}` +
          ` (value: ${JSON.stringify(this._config[key])})`
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

  get(key, fallback = undefined) {
    if (!this._loaded) throw new KQError("Call .load() before .get().");
    const k = key.toLowerCase();
    return k in this._config ? this._config[k] : fallback;
  }

  has(key) {
    if (!this._loaded) throw new KQError("Call .load() before .has().");
    return key.toLowerCase() in this._config;
  }

  /**
   * Return all config values.
   * Secrets are masked when options.mask = true or when mask param is true.
   * @param {boolean} [mask] - override instance mask setting
   */
  all(mask) {
    if (!this._loaded) throw new KQError("Call .load() before .all().");
    const shouldMask = mask !== undefined ? mask : this._mask;
    const copy = Object.assign(Object.create(null), this._config);
    return shouldMask ? maskSecrets(copy) : copy;
  }

  keys() {
    if (!this._loaded) throw new KQError("Call .load() before .keys().");
    return Object.keys(this._config);
  }

  /**
   * Encrypt a plain text value using KQ_MASTER_KEY.
   * Use this to generate ENC: values for your config files.
   * @param {string} plaintext
   * @returns {string} ENC:<ciphertext>:<iv>:<tag>
   */
  static encrypt(plaintext) {
    const masterKey = getMasterKey();
    if (!masterKey) {
      throw new KQError(
        "KQ_MASTER_KEY is not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    if (typeof plaintext !== "string" || !plaintext) {
      throw new KQError("plaintext must be a non-empty string.");
    }
    return encryptValue(plaintext, masterKey);
  }

  /**
   * Decrypt an ENC: value using KQ_MASTER_KEY.
   * @param {string} encValue - ENC:<ciphertext>:<iv>:<tag>
   * @returns {string} decrypted plaintext
   */
  static decrypt(encValue) {
    const masterKey = getMasterKey();
    if (!masterKey) {
      throw new KQError("KQ_MASTER_KEY is not set.");
    }
    if (!encValue.startsWith(ENC_PREFIX)) {
      throw new KQError("Value does not start with ENC:");
    }
    return decryptValue(encValue, masterKey);
  }

  toString() {
    return `KQParser(role="${this._role}", loaded=${this._loaded}, keys=${this._loaded ? this.keys().length : 0})`;
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `KQParser { role: '${this._role}', keys: [${this._loaded ? this.keys().join(", ") : ""}] }`;
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
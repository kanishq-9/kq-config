const fs = require("fs");

class KQError extends Error {
  constructor(message) { super(message); this.name = "KQError"; }
}
class KQValidationError extends KQError {
  constructor(message) { super(message); this.name = "KQValidationError"; }
}

class KQParser {
  constructor(filepath, role, overrideFile = null) {
    this.filepath = filepath;
    this.role = role;
    this.overrideFile = overrideFile;
    this._config = {};
  }
  _cast(value) {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
    if (value !== "" && !isNaN(value)) return value.includes(".") ? parseFloat(value) : parseInt(value, 10);
    return value;
  }
  _resolveEnv(value) {
    return value.replace(/\$ENV:([A-Z_][A-Z0-9_]*)/g, (_, varName) => {
      const val = process.env[varName];
      if (val === undefined) throw new KQError(`Environment variable '${varName}' is not set.`);
      return val;
    });
  }
  _parseFile(filepath) {
    if (!fs.existsSync(filepath)) throw new KQError(`Config file not found: '${filepath}'`);
    const blocks = {};
    let currentBlock = null;
    fs.readFileSync(filepath, "utf-8").split("\n").forEach((rawLine, idx) => {
      let line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith("@")) return;
      if (line.startsWith("::") && line !== "::end") {
        currentBlock = line.slice(2).trim();
        if (!blocks[currentBlock]) blocks[currentBlock] = {};
        return;
      }
      if (line === "::end") { currentBlock = null; return; }
      if (currentBlock !== null) {
        const ci = line.indexOf(" #"); if (ci !== -1) line = line.slice(0, ci).trim();
        if (!line.includes("=")) throw new KQError(`Line ${idx+1}: Invalid syntax '${line}'.`);
        const ei = line.indexOf("=");
        blocks[currentBlock][line.slice(0,ei).trim()] = this._cast(this._resolveEnv(line.slice(ei+1).trim()));
      }
    });
    return blocks;
  }
  load() {
    const raw = this._parseFile(this.filepath);
    const result = {};
    if (raw["shared"]) Object.assign(result, raw["shared"]);
    if (raw[this.role]) Object.assign(result, raw[this.role]);
    if (this.overrideFile) {
      const o = this._parseFile(this.overrideFile);
      if (o["shared"]) Object.assign(result, o["shared"]);
      if (o[this.role]) Object.assign(result, o[this.role]);
    }
    const prefix = `KQ_${this.role.toUpperCase()}_`;
    for (const [k, v] of Object.entries(process.env))
      if (k.startsWith(prefix)) result[k.slice(prefix.length).toLowerCase()] = this._cast(v);
    this._config = result;
    return this;
  }
  validate(schema) {
    const errors = [];
    for (const [key, rules] of Object.entries(schema)) {
      const { required = false, type, default: def } = rules;
      if (!(key in this._config)) {
        if (required) errors.push(`  ✗ Required key '${key}' is missing in [${this.role}] config.`);
        else if (def !== undefined) this._config[key] = def;
        continue;
      }
      if (type && typeof this._config[key] !== type)
        errors.push(`  ✗ Key '${key}' expected '${type}', got '${typeof this._config[key]}'`);
    }
    if (errors.length) throw new KQValidationError(`Config validation failed for role '${this.role}':\n` + errors.join("\n"));
    return this;
  }
  get(key, defaultVal = undefined) { return key in this._config ? this._config[key] : defaultVal; }
  all() { return { ...this._config }; }
  toString() { return `KQConfig(role='${this.role}', keys=[${Object.keys(this._config).join(", ")}])`; }
}

module.exports = { KQParser, KQError, KQValidationError };

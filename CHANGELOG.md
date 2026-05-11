# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---
## [1.0.4] — 2026-05-11

### Docs
- Updated README with full security features documentation
- Added encryption (ENC:) usage guide
- Added secret masking documentation
- Added $ENV: vs ENC: comparison
- Added security protections table
- Added SECURITY.md for private vulnerability reporting

---
## [1.0.3] — 2026-05-10

### Security
- Fixed path traversal vulnerability
- Fixed prototype pollution via blocked keys
- Fixed env variable injection from .env files
- Added value length limit (10,000 chars) to prevent ReDoS
- Added file size limit (1MB) to prevent memory exhaustion
- Blocked same-file circular override attack

---
## [1.0.2] — 2026-05-10

### Fixed
- Updated README with kq name origin
- Fixed repository URL in package.json

---
## [1.0.1] — 2026-05-09

### Fixed
- Built-in .env file loader (no dotenv dependency needed)
- Added KQOptions type to TypeScript definitions
- Fixed build script backtick issue

---

## [1.0.0] — 2026-05-09

### Added
- Initial release
- Block-based `.kq` file parsing (`::server`, `::client`, `::shared`, `::end`)
- Environment variable injection via `$ENV:VAR_NAME` syntax
- Auto type casting — integers, floats, booleans, null, and strings
- Quoted string support — `"hello world"` and `'hello world'`
- Inline and full-line comment support (`# comment`)
- Meta directive support (`@version`, `@env` — ignored by parser)
- Layered config overrides — base file + environment-specific override file
- Runtime env var overrides via `KQ_<ROLE>_<KEY>=value`
- Schema validation with required fields, type checking, and defaults
- `.has()` method to check key existence
- `.keys()` method to list all config keys
- Named error classes: `KQError`, `KQValidationError`, `KQFileNotFoundError`, `KQEnvError`
- TypeScript type definitions (`dist/index.d.ts`)
- ES Module support (`dist/index.mjs`)
- CommonJS support (`dist/index.js`)
- Windows CRLF line ending support
- Case-insensitive keys and role names
- Warning emitted for unclosed blocks (non-fatal)
- GitHub Actions CI — runs tests on every push and pull request
- GitHub Actions publish — auto-publishes to npm on version tag push
- 37 tests covering parsing, blocks, env vars, overrides, validation, and errors

---

## Versioning Guide

Given a version `MAJOR.MINOR.PATCH`:

| Change type                          | Version bump |
|--------------------------------------|--------------|
| Bug fix, no API change               | PATCH — `1.0.1` |
| New feature, backward compatible     | MINOR — `1.1.0` |
| Breaking change (renamed API, etc.)  | MAJOR — `2.0.0` |

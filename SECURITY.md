# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x.x   | ✅ Yes             |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it privately so we can fix it before it is publicly disclosed.

### How to report

Email: **kanishq9.security@gmail.com**

Please include:
- A clear description of the vulnerability
- Steps to reproduce it
- The potential impact
- A suggested fix if you have one

### What happens next

1. You will receive acknowledgement within **48 hours**
2. We will investigate and confirm the vulnerability
3. A fix will be developed and tested privately
4. A new version will be released with the fix
5. You will be credited in the `CHANGELOG.md` unless you prefer to remain anonymous

---

## Security features in kq-config

kq-config is built with security as a first priority:

- **Zero external dependencies** — no supply chain attack surface
- **Path traversal prevention** — config files outside the working directory are blocked
- **Prototype pollution prevention** — dangerous keys (`__proto__`, `constructor` etc.) are blocked
- **Value length limits** — values over 10,000 characters are rejected (prevents ReDoS)
- **File size limits** — files over 1MB are rejected (prevents memory exhaustion)
- **Null byte protection** — null bytes in values are blocked
- **Control character protection** — control characters in values are blocked
- **Environment variable protection** — `.env` files cannot overwrite system variables (`NODE_OPTIONS`, `PATH` etc.)
- **Circular override protection** — base and override files cannot be the same file
- **No `eval()` or dynamic code execution** — ever
- **No network calls** — the package never touches the internet
- **npm provenance** — every release is cryptographically signed and verifiable

---

## Known security considerations

### `.env` file location
kq-config auto-loads `.env` from the same folder as your config file. Ensure your `.env` file has proper file system permissions (`chmod 600 .env` on Unix).

### Config file permissions
Ensure your `.kq` files containing sensitive paths or settings have appropriate read permissions on your server.

### Secret values
Never put raw secret values directly in `.kq` files. Always use `$ENV:VAR_NAME` syntax and keep secrets in `.env` files or your deployment environment's secret manager.
---
name: security-scan
description: Run OWASP LLM Top 10, dependency CVE, SAST pattern, and secrets scanning against any codebase
version: 1.0.0
---

# Security Scan Tools Skill

Use this skill when the user wants to check a codebase for security vulnerabilities, including OWASP LLM risks, dependency CVEs, static analysis issues, and leaked secrets.

## When to use
- User asks to "scan for vulnerabilities" or "security audit"
- User mentions OWASP, CVE, CERT, SAST, or secrets detection
- User wants to check if their AI/LLM project has security issues
- User is preparing security evidence for compliance

## How to use

Full scan:
```bash
security-scan <repo-path> --json
```

Individual scanners:
```bash
security-scan <repo-path> --owasp-only    # OWASP LLM Top 10
security-scan <repo-path> --deps-only     # Dependency CVEs
security-scan <repo-path> --sast-only     # SAST patterns (CWE/CERT)
security-scan <repo-path> --secrets-only  # Secrets/credential detection
```

Compliance integration:
```bash
security-scan <repo-path> --json --compliance
```

## Scanners

### OWASP LLM Top 10 (2025)
Checks for: prompt injection, sensitive info disclosure, supply chain vulnerabilities, data poisoning, improper output handling, excessive agency, system prompt leakage, vector/embedding weaknesses, misinformation, unbounded consumption.

### Dependency Audit
Wraps npm audit, pip-audit, and osv-scanner. Detects ecosystems automatically.

### SAST Patterns
CWE/CERT-referenced rules for: SQL injection (CWE-89), command injection (CWE-78), XSS (CWE-79), path traversal (CWE-22), weak crypto (CWE-327), hardcoded secrets (CWE-798), missing auth (CWE-306), error info exposure (CWE-209), unsafe deserialization (CWE-502), sensitive logging (CWE-532).

### Secrets Detection
Detects: AWS keys, GitHub tokens, OpenAI/Anthropic API keys, Stripe keys, Slack tokens, private keys, JWTs, Google API keys, npm/PyPI tokens, database connection strings.

## Key behaviors
- Zero npm dependencies — all scanners use Node.js built-ins
- Comment-aware: findings in code comments are flagged separately
- Secrets are masked in output
- --compliance flag formats output for compliance-config.json pipeline

# Security Rules

- Never hardcode secrets, API keys, or passwords
- Always validate user input at API boundaries
- Use parameterized queries - never string concatenation for SQL
- Sanitize output to prevent XSS
- Use HTTPS for all external API calls
- Never log sensitive data (passwords, tokens, PII)
- Check file permissions before reading/writing

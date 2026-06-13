/**
 * sqlmap tool prompt — injected when agent uses sqlmap for SQL injection testing.
 */

export const SQLMAP_TOOL_PROMPT = `### sqlmap (SQL injection)
Syntax: \`sqlmap -u "https://TARGET/page?param=1" --level=1 --risk=1 --batch\`
- Always include --batch (non-interactive)
- Quote the URL
- Use --dbs to enumerate databases, --tables for tables, --columns for columns
- Use --dump to extract data when appropriate`;

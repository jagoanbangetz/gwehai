/**
 * nuclei tool prompt — injected when agent uses nuclei for vulnerability scanning.
 */

export const NUCLEI_TOOL_PROMPT = `### nuclei (vulnerability scanning)
Syntax: \`nuclei -t /opt/nuclei-templates -u https://TARGET\`
Or with URL list: \`nuclei -t /opt/nuclei-templates -l urls.txt\`
- Templates path is **/opt/nuclei-templates**
- Use -severity to filter: \`-severity critical,high\`
- Use -tags for specific vuln types: \`-tags sqli,xss\``;

/**
 * curl tool prompt — injected when agent uses curl for HTTP requests.
 */

export const CURL_TOOL_PROMPT = `### curl (HTTP requests)
Syntax: \`curl -sI https://TARGET/\` (headers) or \`curl -s "https://TARGET/path"\` (body)
- Use -s for silent mode
- Use -I for headers only
- Use -X METHOD for specific HTTP methods
- Use -H "Header: value" for custom headers
- Use -d "data" for POST body`;

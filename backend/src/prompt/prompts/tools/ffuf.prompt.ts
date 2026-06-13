/**
 * ffuf tool prompt — injected when agent uses ffuf for directory/path fuzzing.
 */

export const FFUF_TOOL_PROMPT = `### ffuf (directory/path fuzzing)
Syntax: \`ffuf -u https://TARGET/FUZZ -w /opt/wordlists/common.txt -mc 200,301,302 -fc 404\`
- Replace TARGET with actual target URL; FUZZ is the placeholder
- **Wordlists:** /opt/wordlists/common.txt, /opt/wordlists/raft-small-directories.txt, /opt/wordlists/raft-small-files.txt
- **State wordlist location** in your reply (e.g. "Using wordlist: /opt/wordlists/common.txt")
- Do NOT use wfuzz or dirsearch (not in image)`;

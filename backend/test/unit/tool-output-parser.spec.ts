import { ToolOutputParserService } from '../../src/hacktivity/tool-output-parser.service';

describe('ToolOutputParserService', () => {
  let parser: ToolOutputParserService;

  beforeEach(() => {
    parser = new ToolOutputParserService();
  });

  // ─── SQLMap ────────────────────────────────────────────────────────────

  describe('sqlmap', () => {
    it('should parse sqlmap output with injection found', () => {
      const output = `
[INFO] testing connection to the target URL
[INFO] testing if the target URL content is stable
[INFO] target URL content is stable
[INFO] testing parameter 'id'
Parameter: id (GET)
    Type: boolean-based blind
    Title: AND boolean-based blind - WHERE or HAVING clause
    Payload: id=1 AND 1=1

    Type: time-based blind
    Title: MySQL >= 5.0.12 AND time-based blind
    Payload: id=1 AND SLEEP(5)

back-end DBMS: MySQL >= 5.0.12
[INFO] fetching database names
available databases [3]:
[*] information_schema
[*] mysql
[*] testdb
      `;
      const result = parser.parse(output, 'sqlmap');

      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('sqlmap');
      expect((result as any).injectable).toBe(true);
      expect((result as any).dbms).toBe('MySQL >= 5.0.12');
      expect((result as any).parameters).toContain('id');
      expect((result as any).injectionTypes.length).toBeGreaterThan(0);
      expect((result as any).databases).toContain('information_schema');
      expect((result as any).databases).toContain('testdb');
    });

    it('should handle non-injectable sqlmap output', () => {
      const output = `
[INFO] testing connection to the target URL
[INFO] testing parameter 'id'
[WARNING] GET parameter 'id' is not injectable
      `;
      const result = parser.parse(output, 'sqlmap');

      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('sqlmap');
      expect((result as any).injectable).toBe(false);
    });
  });

  // ─── Nmap ─────────────────────────────────────────────────────────────

  describe('nmap', () => {
    it('should parse nmap scan output', () => {
      const output = `
Nmap scan report for 192.168.1.1
Host is up (0.0023s latency).

PORT     STATE SERVICE     VERSION
22/tcp   open  ssh         OpenSSH 8.9p1
80/tcp   open  http        Apache httpd 2.4.52
443/tcp  open  https       Apache httpd 2.4.52
3306/tcp open  mysql       MySQL 8.0.31

OS details: Linux 5.4 - 5.6
      `;
      const result = parser.parse(output, 'nmap');

      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('nmap');
      expect((result as any).target).toBe('192.168.1.1');
      expect((result as any).ports.length).toBe(4);
      expect((result as any).ports[0].port).toBe(22);
      expect((result as any).ports[0].service).toBe('ssh');
      expect((result as any).osGuess).toContain('Linux');
    });

    it('should handle nmap with no open ports', () => {
      const output = `
Nmap scan report for 10.0.0.1
Host is up.
All 1000 scanned ports are closed
      `;
      const result = parser.parse(output, 'nmap');

      expect(result).not.toBeNull();
      expect((result as any).target).toBe('10.0.0.1');
      expect((result as any).ports.length).toBe(0);
    });
  });

  // ─── Ffuf ─────────────────────────────────────────────────────────────

  describe('ffuf', () => {
    it('should parse ffuf JSON output', () => {
      const output = JSON.stringify({
        commandline: 'ffuf -u https://example.com/FUSS -w wordlist.txt',
        results: [
          { url: 'https://example.com/admin', status: 200, length: 1234, words: 56, lines: 78, 'content-type': 'text/html' },
          { url: 'https://example.com/api', status: 200, length: 5678, words: 123, lines: 45, 'content-type': 'application/json' },
        ],
      });
      const result = parser.parse(output, 'ffuf');

      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('ffuf');
      expect((result as any).totalResults).toBe(2);
      expect((result as any).results[0].url).toBe('https://example.com/admin');
      expect((result as any).results[0].status).toBe(200);
      expect((result as any).results[1].contentType).toBe('application/json');
    });

    it('should parse ffuf text output', () => {
      const output = `
- FUZZ: admin
admin                   [Status: 200, Size: 1234, Words: 56, Lines: 78]
api/v1                  [Status: 200, Size: 5678, Words: 123, Lines: 45]
      `;
      const result = parser.parse(output, 'ffuf');

      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('ffuf');
      expect((result as any).results.length).toBe(2);
    });
  });

  // ─── Nuclei ───────────────────────────────────────────────────────────

  describe('nuclei', () => {
    it('should parse nuclei JSON lines output', () => {
      const lines = [
        JSON.stringify({
          'template-id': 'cve-2021-44228',
          info: { name: 'Log4j RCE', severity: 'critical' },
          type: 'http',
          host: 'https://vulnerable.com',
          'matched-at': 'https://vulnerable.com/api/search',
        }),
        JSON.stringify({
          'template-id': 'tech-detect',
          info: { name: 'Tech Detection', severity: 'info' },
          type: 'http',
          host: 'https://example.com',
          'matched-at': 'https://example.com/',
        }),
      ].join('\n');

      const result = parser.parse(lines, 'nuclei');

      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('nuclei');
      expect((result as any).findings.length).toBe(2);
      expect((result as any).findings[0].templateId).toBe('cve-2021-44228');
      expect((result as any).findings[0].severity).toBe('critical');
      expect((result as any).findings[1].severity).toBe('info');
    });

    it('should parse nuclei text output', () => {
      const output = `
[critical] [cve-2021-44228] [http] [https://vulnerable.com] https://vulnerable.com/api
[medium] [xss-detect] [http] [https://example.com] https://example.com/search
      `;
      const result = parser.parse(output, 'nuclei');

      expect(result).not.toBeNull();
      expect((result as any).findings.length).toBe(2);
      expect((result as any).findings[0].severity).toBe('critical');
    });
  });

  // ─── Gobuster ─────────────────────────────────────────────────────────

  describe('gobuster', () => {
    it('should parse gobuster dir output', () => {
      const output = `
/admin (Status: 200) [Size: 1234]
/api (Status: 200) [Size: 5678]
/.git (Status: 403) [Size: 123]
/login (Status: 302) [Size: 0]
      `;
      const result = parser.parse(output, 'gobuster');

      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('gobuster');
      expect((result as any).found.length).toBe(4);
      expect((result as any).found[0].path).toBe('/admin');
      expect((result as any).found[0].status).toBe(200);
      expect((result as any).found[2].status).toBe(403);
    });

    it('should parse gobuster dns output', () => {
      const output = `
Found: admin.example.com
Found: api.example.com
Found: dev.example.com
      `;
      const result = parser.parse(output, 'gobuster');

      expect(result).not.toBeNull();
      expect((result as any).mode).toBe('dns');
      expect((result as any).found.length).toBe(3);
    });
  });

  // ─── Nikto ────────────────────────────────────────────────────────────

  describe('nikto', () => {
    it('should parse nikto output', () => {
      const output = `
- Nikto v2.5.0
+ Target IP: 192.168.1.100
+ Target Hostname: example.com
+ OSVDB-3092: /admin/: This might be interesting
+ OSVDB-3268: /icons/: Directory indexing found
+ /phpinfo.php: PHP info file found
      `;
      const result = parser.parse(output, 'nikto');

      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('nikto');
      expect((result as any).target).not.toBeNull();
      expect((result as any).findings.length).toBeGreaterThan(0);
      expect((result as any).findings[0].osvdbId).toBe('OSVDB-3092');
    });
  });

  // ─── Auto-detection ──────────────────────────────────────────────────

  describe('auto-detection', () => {
    it('should detect sqlmap from content', () => {
      const output = '[INFO] starting the blah blah\nback-end DBMS: MySQL';
      const result = parser.parse(output);
      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('sqlmap');
    });

    it('should detect nmap from content', () => {
      const output = 'Nmap scan report for 10.0.0.1\n22/tcp open ssh';
      const result = parser.parse(output);
      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('nmap');
    });

    it('should use toolName hint when provided', () => {
      const output = 'Nmap scan report for 10.0.0.1\n22/tcp open ssh OpenSSH 8.9';
      const result = parser.parse(output, 'nmap');
      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('nmap');
    });

    it('should return null for empty output', () => {
      expect(parser.parse('')).toBeNull();
      expect(parser.parse('   ')).toBeNull();
    });

    it('should return null for unrecognized tool', () => {
      const output = 'Some random output that does not match any tool pattern';
      expect(parser.parse(output)).toBeNull();
    });

    it('should use toolArgs.command for detection', () => {
      const output = `
[INFO] testing connection to the target URL
back-end DBMS: MySQL
      `;
      const result = parser.parse(output, null, { command: 'sqlmap -u http://target' });
      expect(result).not.toBeNull();
      expect((result as any).tool).toBe('sqlmap');
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle very short output gracefully', () => {
      expect(parser.parse('abc')).toBeNull();
    });

    it('should cap raw field at 2000 chars', () => {
      const longOutput = 'Nmap scan report for 10.0.0.1\n' + 'x'.repeat(5000);
      const result = parser.parse(longOutput, 'nmap');
      expect(result).not.toBeNull();
      expect((result as any).raw.length).toBeLessThanOrEqual(2000);
    });

    it('should handle nuclei with mixed shell noise', () => {
      const output = `$ nuclei -u target.com
${JSON.stringify({
  'template-id': 'test-xss',
  info: { name: 'XSS Detection', severity: 'medium' },
  type: 'http',
  host: 'http://target.com',
  'matched-at': 'http://target.com/search',
})}
[INF] Scan completed
      `;
      const result = parser.parse(output, 'nuclei');
      expect(result).not.toBeNull();
      expect((result as any).findings.length).toBe(1);
    });
  });
});

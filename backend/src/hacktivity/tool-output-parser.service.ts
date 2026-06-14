/**
 * Tool Output Parser Service
 *
 * Parses raw tool output (sqlmap, nmap, ffuf, nuclei, gobuster, nikto)
 * into structured JSON for frontend rendering.
 *
 * Each parser returns a typed result or null if parsing fails.
 * The service auto-detects which tool produced the output.
 */

import { Injectable } from '@nestjs/common';

// ─── Result Types ───────────────────────────────────────────────────────────

export interface SqlmapResult {
  tool: 'sqlmap';
  target: string | null;
  injectable: boolean;
  parameters: string[];
  injectionTypes: string[];  // e.g. ["boolean-based blind", "time-based blind"]
  dbms: string | null;       // e.g. "MySQL"
  databases: string[];
  tables: Record<string, string[]>;  // db → table[]
  raw: string;
}

export interface NmapResult {
  tool: 'nmap';
  target: string | null;
  hostsUp: number;
  hostsDown: number;
  ports: Array<{
    port: number;
    protocol: string;
    state: string;
    service: string;
    version: string | null;
  }>;
  osGuess: string | null;
  raw: string;
}

export interface FfufResult {
  tool: 'ffuf';
  target: string | null;
  totalResults: number;
  results: Array<{
    url: string;
    status: number;
    length: number;
    words: number;
    lines: number;
    contentType: string | null;
  }>;
  raw: string;
}

export interface NucleiResult {
  tool: 'nuclei';
  target: string | null;
  findings: Array<{
    templateId: string;
    name: string;
    severity: string;      // critical, high, medium, low, info
    type: string;
    host: string;
    matchedAt: string;
    extractedInfo: string | null;
  }>;
  raw: string;
}

export interface GobusterResult {
  tool: 'gobuster';
  target: string | null;
  mode: string;  // dir, dns, vhost
  found: Array<{
    path: string;
    status: number;
    size: number | null;
  }>;
  raw: string;
}

export interface NiktoResult {
  tool: 'nikto';
  target: string | null;
  findings: Array<{
    id: string;
    osvdbId: string | null;
    method: string;
    url: string;
    message: string;
  }>;
  raw: string;
}

export type ParsedToolResult =
  | SqlmapResult
  | NmapResult
  | FfufResult
  | NucleiResult
  | GobusterResult
  | NiktoResult
  | null;

// ─── Parser Service ─────────────────────────────────────────────────────────

@Injectable()
export class ToolOutputParserService {
  /**
   * Main entry point. Auto-detects tool and parses output.
   * Returns null if output can't be parsed or tool is unrecognized.
   */
  parse(rawOutput: string, toolName?: string | null, toolArgs?: Record<string, any> | null): ParsedToolResult {
    if (!rawOutput || rawOutput.trim().length < 10) return null;

    const output = rawOutput.trim();
    const detected = toolName?.toLowerCase() ?? this.detectTool(output, toolArgs);

    switch (detected) {
      case 'sqlmap':
        return this.parseSqlmap(output);
      case 'nmap':
        return this.parseNmap(output);
      case 'ffuf':
        return this.parseFfuf(output);
      case 'nuclei':
        return this.parseNuclei(output);
      case 'gobuster':
        return this.parseGobuster(output);
      case 'nikto':
        return this.parseNikto(output);
      default:
        return null;
    }
  }

  /**
   * Auto-detect which tool produced the output based on content heuristics.
   */
  private detectTool(output: string, toolArgs?: Record<string, any> | null): string | null {
    const lower = output.toLowerCase();

    // Tool args hints (command field)
    const cmd = toolArgs?.command?.toLowerCase() ?? '';

    if (cmd.includes('sqlmap') || lower.includes('sqlmap') || lower.includes('[info] starting the')) return 'sqlmap';
    if (cmd.includes('nmap') || lower.includes('nmap scan report')) return 'nmap';
    if (cmd.includes('ffuf') || lower.includes('[status:') || lower.includes(':: progress')) return 'ffuf';
    if (cmd.includes('nuclei') || lower.includes('[critical]') || lower.includes('[high]') || lower.includes('[medium]') || lower.includes('[info]') && lower.includes('template-id')) return 'nuclei';
    if (cmd.includes('gobuster') || lower.includes('gobuster') || (lower.includes('/.git') && lower.includes('status:'))) return 'gobuster';
    if (cmd.includes('nikto') || lower.includes('nikto') || lower.includes('+ osvdb')) return 'nikto';

    return null;
  }

  // ─── SQLMap Parser ──────────────────────────────────────────────────────

  private parseSqlmap(output: string): SqlmapResult {
    const result: SqlmapResult = {
      tool: 'sqlmap',
      target: null,
      injectable: false,
      parameters: [],
      injectionTypes: [],
      dbms: null,
      databases: [],
      tables: {},
      raw: output.slice(0, 2000),
    };

    // Target URL
    const urlMatch = output.match(/URL:\s*(\S+)/i) || output.match(/testing connection to the target URL\s*[:']?\s*(\S+)/i);
    if (urlMatch) result.target = urlMatch[1];

    // Injectable? Check for "not injectable" first to avoid false positives
    result.injectable = /not injectable/i.test(output)
      ? false
      : /injectable|is vulnerable|sqlmap identified|Type:\s*\S+/i.test(output);

    // Parameters
    const paramMatches = output.matchAll(/Parameter:\s*(\S+)\s*\((\w+)\)/gi);
    for (const m of paramMatches) {
      result.parameters.push(m[1]);
    }

    // Injection types
    const typeMatches = output.matchAll(/Type:\s*(.+?)(?:\n|$)/gm);
    for (const m of typeMatches) {
      const t = m[1].trim();
      if (t.length > 3 && t.length < 100) result.injectionTypes.push(t);
    }

    // DBMS
    const dbmsMatch = output.match(/back-end DBMS:\s*(.+?)(?:\n|$)/i);
    if (dbmsMatch) result.dbms = dbmsMatch[1].trim();

    // Databases
    const dbMatch = output.match(/available databases\s*\[(\d+)\]:\s*\n((?:\[\*\]\s*\S+\s*\n?)*)/i);
    if (dbMatch) {
      result.databases = dbMatch[2].split('\n')
        .map(l => l.replace(/^\[\*\]\s*/, '').trim())
        .filter(l => l.length > 0);
    }

    // Tables
    const tableMatch = output.match(/Database:\s*(\S+)\s*\n.*?Tables:\s*\n([\s\S]*?)(?:\n\n|Database:|$)/gi);
    if (tableMatch) {
      for (const block of tableMatch) {
        const db = block.match(/Database:\s*(\S+)/i);
        if (!db) continue;
        const dbName = db[1];
        const tables = block.split('\n')
          .map(l => l.replace(/^\|\s*/, '').replace(/\s*\|$/, '').trim())
          .filter(l => l.length > 0 && l !== dbName && !l.startsWith('Database') && !l.includes('---'));
        result.tables[dbName] = tables;
      }
    }

    return result;
  }

  // ─── Nmap Parser ────────────────────────────────────────────────────────

  private parseNmap(output: string): NmapResult {
    const result: NmapResult = {
      tool: 'nmap',
      target: null,
      hostsUp: 0,
      hostsDown: 0,
      ports: [],
      osGuess: null,
      raw: output.slice(0, 2000),
    };

    // Target
    const targetMatch = output.match(/Nmap scan report for\s+(\S+)/i);
    if (targetMatch) result.target = targetMatch[1];

    // Host counts
    const hostsUpMatch = output.match(/(\d+)\s+hosts?\s+up/i);
    if (hostsUpMatch) result.hostsUp = parseInt(hostsUpMatch[1], 10);
    const hostsDownMatch = output.match(/(\d+)\s+hosts?\s+down/i);
    if (hostsDownMatch) result.hostsDown = parseInt(hostsDownMatch[1], 10);

    // Ports: "22/tcp   open  ssh     OpenSSH 8.9"
    const portMatches = output.matchAll(/(\d+)\/(\w+)\s+(\w+)\s+(\S+)\s*(.*)/g);
    for (const m of portMatches) {
      result.ports.push({
        port: parseInt(m[1], 10),
        protocol: m[2],
        state: m[3],
        service: m[4],
        version: m[5]?.trim() || null,
      });
    }

    // OS guess
    const osMatch = output.match(/OS details?:\s*(.+?)(?:\n|$)/i);
    if (osMatch) result.osGuess = osMatch[1].trim();

    return result;
  }

  // ─── Ffuf Parser ────────────────────────────────────────────────────────

  private parseFfuf(output: string): FfufResult {
    const result: FfufResult = {
      tool: 'ffuf',
      target: null,
      totalResults: 0,
      results: [],
      raw: output.slice(0, 2000),
    };

    // Target URL from command line
    const urlMatch = output.match(/-u\s+(\S+)/i) || output.match(/URL:\s*(\S+)/i);
    if (urlMatch) result.target = urlMatch[1];

    // Parse JSON output (ffuf -of json)
    try {
      const jsonData = JSON.parse(output);
      if (jsonData.results && Array.isArray(jsonData.results)) {
        result.totalResults = jsonData.results.length;
        for (const r of jsonData.results.slice(0, 100)) {  // cap at 100
          result.results.push({
            url: r.url || '',
            status: r.status || 0,
            length: r['length'] || r['res-len'] || 0,
            words: r.words || r['res-words'] || 0,
            lines: r.lines || r['res-lines'] || 0,
            contentType: r['content-type'] || r.contentType || null,
          });
        }
        return result;
      }
    } catch {
      // Not JSON, parse text output
    }

    // Text output: "path [Status: 200, Size: 1234, Words: 56, Lines: 78]"
    const lineMatches = output.matchAll(/(\S+)\s+\[Status:\s*(\d+),\s*Size:\s*(\d+),?\s*Words:\s*(\d+),?\s*Lines:\s*(\d+)/gi);
    for (const m of lineMatches) {
      result.results.push({
        url: m[1],
        status: parseInt(m[2], 10),
        length: parseInt(m[3], 10),
        words: parseInt(m[4], 10),
        lines: parseInt(m[5], 10),
        contentType: null,
      });
    }
    result.totalResults = result.results.length;

    return result;
  }

  // ─── Nuclei Parser ──────────────────────────────────────────────────────

  private parseNuclei(output: string): NucleiResult {
    const result: NucleiResult = {
      tool: 'nuclei',
      target: null,
      findings: [],
      raw: output.slice(0, 2000),
    };

    // Target
    const targetMatch = output.match(/-target\s+(\S+)/i) || output.match(/-u\s+(\S+)/i);
    if (targetMatch) result.target = targetMatch[1];

    // JSON lines output
    const lines = output.split('\n').filter(l => l.trim().startsWith('{'));
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj['template-id'] || obj.templateID) {
          result.findings.push({
            templateId: obj['template-id'] || obj.templateID || '',
            name: obj.info?.name || obj.name || '',
            severity: obj.info?.severity || obj.severity || 'info',
            type: obj.type || '',
            host: obj.host || obj['matched-at'] || '',
            matchedAt: obj['matched-at'] || obj.matchedAt || '',
            extractedInfo: obj['extracted-results']?.join(', ') || null,
          });
        }
      } catch {
        // Not JSON, try text format
      }
    }

    // Text format: [severity] [template-id] [type] host
    if (result.findings.length === 0) {
      const textMatches = output.matchAll(/\[(\w+)\]\s+\[(\S+)\]\s+\[(\S+)\]\s+\[(\S*)\]\s*(\S+)/g);
      for (const m of textMatches) {
        result.findings.push({
          templateId: m[2],
          name: m[2],
          severity: m[1],
          type: m[3],
          host: m[5],
          matchedAt: m[5],
          extractedInfo: m[4] || null,
        });
      }
    }

    return result;
  }

  // ─── Gobuster Parser ────────────────────────────────────────────────────

  private parseGobuster(output: string): GobusterResult {
    const result: GobusterResult = {
      tool: 'gobuster',
      target: null,
      mode: 'dir',
      found: [],
      raw: output.slice(0, 2000),
    };

    // Target
    const targetMatch = output.match(/-u\s+(\S+)/i) || output.match(/Url:\s*(\S+)/i);
    if (targetMatch) result.target = targetMatch[1];

    // Mode
    if (/Found:\s*\S+/i.test(output) && !/\(Status:\s*\d+\)/i.test(output)) result.mode = 'dns';
    else if (/mode:\s*dns/i.test(output) || /-m\s*dns/i.test(output)) result.mode = 'dns';
    if (/mode:\s*vhost/i.test(output) || /-m\s*vhost/i.test(output)) result.mode = 'vhost';

    // Dir mode: "/path (Status: 200) [Size: 1234]"
    const dirMatches = output.matchAll(/(\S+)\s+\(Status:\s*(\d+)\)\s*\[Size:\s*(\d+)\]/gi);
    for (const m of dirMatches) {
      result.found.push({
        path: m[1],
        status: parseInt(m[2], 10),
        size: parseInt(m[3], 10),
      });
    }

    // DNS mode: "Found: sub.domain.com"
    const dnsMatches = output.matchAll(/Found:\s*(\S+)/gi);
    for (const m of dnsMatches) {
      result.found.push({
        path: m[1],
        status: 0,
        size: null,
      });
    }

    return result;
  }

  // ─── Nikto Parser ───────────────────────────────────────────────────────

  private parseNikto(output: string): NiktoResult {
    const result: NiktoResult = {
      tool: 'nikto',
      target: null,
      findings: [],
      raw: output.slice(0, 2000),
    };

    // Target
    const targetMatch = output.match(/-h\s+(\S+)/i) || output.match(/Target IP:\s*(\S+)/i) || output.match(/Target Hostname:\s*(\S+)/i);
    if (targetMatch) result.target = targetMatch[1];

    // Findings: "+ OSVDB-xxx: /path: message" or "+ /path: message"
    const findings = output.matchAll(/\+\s+(?:OSVDB-(\d+):\s*)?(?:\((\w+)\)\s+)?(\S+):\s*(.+?)(?:\n|$)/g);
    let idCounter = 0;
    for (const m of findings) {
      const path = m[3];
      const message = m[4]?.trim();
      if (!message || path === 'Target' || path === 'Server') continue;

      idCounter++;
      result.findings.push({
        id: `nikto-${idCounter}`,
        osvdbId: m[1] ? `OSVDB-${m[1]}` : null,
        method: m[2] || 'GET',
        url: path,
        message: message,
      });
    }

    return result;
  }
}

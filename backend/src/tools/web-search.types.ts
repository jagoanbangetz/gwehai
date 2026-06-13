/**
 * Web Search Tool — Types
 *
 * Types for exploit search, technique lookup, and reference fetching.
 */

export type SearchType = 'exploit' | 'technique' | 'reference';

export interface WebSearchRequest {
  query: string;
  type: SearchType;
  url?: string; // for 'reference' type
}

export interface ExploitResult {
  title: string;
  edb_id?: string;
  cve_id?: string;
  platform?: string;
  type?: string;
  author?: string;
  date?: string;
  path?: string;
  poc_url?: string;
  source: 'exploit-db' | 'nvd' | 'cisa-kev' | 'ghsa';
}

export interface TechniqueResult {
  title: string;
  summary: string;
  references: string[];
  source: string;
  tags?: string[];
}

export interface ReferenceResult {
  url: string;
  title: string;
  content: string; // plain text, HTML stripped
  fetched_at: string;
  truncated: boolean;
}

export interface WebSearchResponse {
  type: SearchType;
  query: string;
  results: ExploitResult[] | TechniqueResult[] | ReferenceResult[];
  count: number;
  cached: boolean;
  search_time_ms: number;
}

/** Cache entry shape */
export interface CachedSearch {
  key: string; // type:query (lowercased)
  results: ExploitResult[] | TechniqueResult[] | ReferenceResult[];
  cached_at: number; // Date.now()
  ttl_ms: number;
}

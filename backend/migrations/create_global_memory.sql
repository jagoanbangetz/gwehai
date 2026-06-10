-- Migration: Create global_memory table for cross-conversation AI learning
-- Run: psql -U gwehai -d gwehai_db -f migrations/create_global_memory.sql

CREATE TABLE IF NOT EXISTS global_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(32) NOT NULL,
  key VARCHAR(255) NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence FLOAT NOT NULL DEFAULT 50,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index on (category, key) for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_global_memory_category_key
  ON global_memory (category, key);

-- Individual indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_global_memory_category
  ON global_memory (category);

CREATE INDEX IF NOT EXISTS idx_global_memory_key
  ON global_memory (key);

-- GIN index on value JSONB for full-text search across pattern data
CREATE INDEX IF NOT EXISTS idx_global_memory_value_gin
  ON global_memory USING GIN (value jsonb_path_ops);

COMMENT ON TABLE global_memory IS 'Cross-conversation AI learning: false positives, successful payloads, tech profiles shared across all scans';
COMMENT ON COLUMN global_memory.category IS 'Type: false_positive, successful_payload, tech_profile, pattern_rule';
COMMENT ON COLUMN global_memory.key IS 'Unique key convention: fp:CATEGORY:hash, payload:VULN:tech, profile:TECH_NAME';
COMMENT ON COLUMN global_memory.confidence IS 'Confidence score 0-100, increases when pattern is reused';
COMMENT ON COLUMN global_memory.hit_count IS 'Number of times this pattern has been referenced';

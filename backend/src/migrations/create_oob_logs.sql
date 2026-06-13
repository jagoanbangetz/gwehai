-- Migration: Create oob_logs table for OOB callback detection
-- Used by OobDetectorService (Burp Collaborator-style blind vuln detection)

CREATE TABLE IF NOT EXISTS oob_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id VARCHAR(64) NOT NULL,
    payload_type VARCHAR(16) NOT NULL DEFAULT 'dns',
    target_url TEXT,
    vuln_type VARCHAR(32),
    callback_domain VARCHAR(255) NOT NULL,
    payload_template TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    callbacks JSONB,
    confidence INT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    callback_received_at TIMESTAMP,
    timeout_ms INT NOT NULL DEFAULT 30000
);

-- Unique index on test_id for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_oob_logs_test_id ON oob_logs (test_id);

-- Index on status for filtering pending/received/timeout
CREATE INDEX IF NOT EXISTS idx_oob_logs_status ON oob_logs (status);

-- Index on created_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_oob_logs_created_at ON oob_logs (created_at);

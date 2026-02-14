-- Migration: Initialize complete schema matching Rails
-- This ensures all tables exist for the Node.js backend

-- Active Storage Blobs table
CREATE TABLE IF NOT EXISTS active_storage_blobs (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL UNIQUE,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(255),
  metadata TEXT,
  byte_size BIGINT NOT NULL,
  checksum VARCHAR(255),
  service_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Active Storage Attachments table
CREATE TABLE IF NOT EXISTS active_storage_attachments (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  record_type VARCHAR(255) NOT NULL,
  record_id BIGINT NOT NULL,
  blob_id BIGINT NOT NULL REFERENCES active_storage_blobs(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(record_type, record_id, name, blob_id)
);

-- Active Storage Variant Records table
CREATE TABLE IF NOT EXISTS active_storage_variant_records (
  id BIGSERIAL PRIMARY KEY,
  blob_id BIGINT NOT NULL REFERENCES active_storage_blobs(id) ON DELETE CASCADE,
  variation_digest VARCHAR(255) NOT NULL,
  UNIQUE(blob_id, variation_digest)
);

-- Create indexes for Active Storage
CREATE INDEX IF NOT EXISTS index_active_storage_blobs_on_key ON active_storage_blobs(key);
CREATE INDEX IF NOT EXISTS index_active_storage_attachments_on_blob_id ON active_storage_attachments(blob_id);
CREATE UNIQUE INDEX IF NOT EXISTS index_active_storage_variant_records_uniqueness
  ON active_storage_variant_records(blob_id, variation_digest);

-- Solid Cable for WebSocket
CREATE TABLE IF NOT EXISTS solid_cable_messages (
  id BIGSERIAL PRIMARY KEY,
  channel BYTEA NOT NULL,
  channel_hash BIGINT NOT NULL,
  payload BYTEA NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_solid_cable_messages_on_channel ON solid_cable_messages(channel);
CREATE INDEX IF NOT EXISTS index_solid_cable_messages_on_channel_hash ON solid_cable_messages(channel_hash);
CREATE INDEX IF NOT EXISTS index_solid_cable_messages_on_created_at ON solid_cable_messages(created_at);

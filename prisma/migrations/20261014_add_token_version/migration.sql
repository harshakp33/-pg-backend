-- Migration: 20261014_add_token_version
-- Description: Add persistent tokenVersion column to users table for durable access-token invalidation across Redis outages.
-- Status: PREPARED FOR REVIEW ONLY — DO NOT APPLY WITHOUT APPROVAL.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 1;

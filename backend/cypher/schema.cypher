// ==============================================================================
// Organ/Blood Donor–Recipient Matching Network - Schema, Constraints & Indexes
// Neo4j 5 Compatible DDL
// Safe to re-run: All statements use IF NOT EXISTS
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. UNIQUENESS CONSTRAINTS
// ------------------------------------------------------------------------------

// Donor uniqueness
CREATE CONSTRAINT constraint_donor_id IF NOT EXISTS
FOR (d:Donor) REQUIRE d.donor_id IS UNIQUE;

// Recipient uniqueness
CREATE CONSTRAINT constraint_recipient_id IF NOT EXISTS
FOR (r:Recipient) REQUIRE r.recipient_id IS UNIQUE;

// Hospital uniqueness
CREATE CONSTRAINT constraint_hospital_id IF NOT EXISTS
FOR (h:Hospital) REQUIRE h.hospital_id IS UNIQUE;

// BloodType uniqueness
CREATE CONSTRAINT constraint_blood_type IF NOT EXISTS
FOR (b:BloodType) REQUIRE b.blood_type IS UNIQUE;

// MatchRequest uniqueness
CREATE CONSTRAINT constraint_match_id IF NOT EXISTS
FOR (m:MatchRequest) REQUIRE m.match_id IS UNIQUE;

// Allocation uniqueness
CREATE CONSTRAINT constraint_allocation_id IF NOT EXISTS
FOR (a:Allocation) REQUIRE a.allocation_id IS UNIQUE;

// User uniqueness (user_id and username)
CREATE CONSTRAINT constraint_user_id IF NOT EXISTS
FOR (u:User) REQUIRE u.user_id IS UNIQUE;

CREATE CONSTRAINT constraint_user_username IF NOT EXISTS
FOR (u:User) REQUIRE u.username IS UNIQUE;

// ------------------------------------------------------------------------------
// 2. QUERY PERFORMANCE INDEXES
// ------------------------------------------------------------------------------

// Donor query indexes for filtering available matching donors
CREATE INDEX index_donor_status IF NOT EXISTS
FOR (d:Donor) ON (d.status);

CREATE INDEX index_donor_organ_type IF NOT EXISTS
FOR (d:Donor) ON (d.organ_type);

CREATE INDEX index_donor_blood_type IF NOT EXISTS
FOR (d:Donor) ON (d.blood_type);

// Recipient query indexes for matching and urgency triage
CREATE INDEX index_recipient_status IF NOT EXISTS
FOR (r:Recipient) ON (r.status);

CREATE INDEX index_recipient_organ_needed IF NOT EXISTS
FOR (r:Recipient) ON (r.organ_needed);

CREATE INDEX index_recipient_urgency_score IF NOT EXISTS
FOR (r:Recipient) ON (r.urgency_score);

CREATE INDEX index_recipient_blood_type IF NOT EXISTS
FOR (r:Recipient) ON (r.blood_type);

// MatchRequest status index
CREATE INDEX index_match_status IF NOT EXISTS
FOR (m:MatchRequest) ON (m.status);

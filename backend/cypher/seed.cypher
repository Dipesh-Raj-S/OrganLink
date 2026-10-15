// ==============================================================================
// Organ/Blood Donor–Recipient Matching Network - Seed Cypher Data
// Neo4j 5 Parameterless Cypher Script for Manual Console / Cypher-Shell Seeding
// Idempotent: Uses MERGE to allow safe repeated executions
// ==============================================================================

// 1. BloodType Nodes & Compatibility
MERGE (b1:BloodType {blood_type: 'O-'}) SET b1.category = 'Blood';
MERGE (b2:BloodType {blood_type: 'O+'}) SET b2.category = 'Blood';
MERGE (b3:BloodType {blood_type: 'A-'}) SET b3.category = 'Blood';
MERGE (b4:BloodType {blood_type: 'A+'}) SET b4.category = 'Blood';
MERGE (b5:BloodType {blood_type: 'B-'}) SET b5.category = 'Blood';
MERGE (b6:BloodType {blood_type: 'B+'}) SET b6.category = 'Blood';
MERGE (b7:BloodType {blood_type: 'AB-'}) SET b7.category = 'Blood';
MERGE (b8:BloodType {blood_type: 'AB+'}) SET b8.category = 'Blood';

// Compatibility Relationships: (BloodType)-[:CAN_DONATE_TO]->(BloodType)
MATCH (o_neg:BloodType {blood_type: 'O-'}), (tgt:BloodType)
MERGE (o_neg)-[:CAN_DONATE_TO]->(tgt);

MATCH (o_pos:BloodType {blood_type: 'O-'})
MATCH (target:BloodType)
WHERE target.blood_type IN ['O+', 'A+', 'B+', 'AB+']
MERGE (o_pos)-[:CAN_DONATE_TO]->(target);

MATCH (a_neg:BloodType {blood_type: 'A-'})
MATCH (target:BloodType)
WHERE target.blood_type IN ['A-', 'A+', 'AB-', 'AB+']
MERGE (a_neg)-[:CAN_DONATE_TO]->(target);

MATCH (a_pos:BloodType {blood_type: 'A+'})
MATCH (target:BloodType)
WHERE target.blood_type IN ['A+', 'AB+']
MERGE (a_pos)-[:CAN_DONATE_TO]->(target);

MATCH (b_neg:BloodType {blood_type: 'B-'})
MATCH (target:BloodType)
WHERE target.blood_type IN ['B-', 'B+', 'AB-', 'AB+']
MERGE (b_neg)-[:CAN_DONATE_TO]->(target);

MATCH (b_pos:BloodType {blood_type: 'B+'})
MATCH (target:BloodType)
WHERE target.blood_type IN ['B+', 'AB+']
MERGE (b_pos)-[:CAN_DONATE_TO]->(target);

MATCH (ab_neg:BloodType {blood_type: 'AB-'})
MATCH (target:BloodType)
WHERE target.blood_type IN ['AB-', 'AB+']
MERGE (ab_neg)-[:CAN_DONATE_TO]->(target);

MATCH (ab_pos:BloodType {blood_type: 'AB+'})
MATCH (target:BloodType {blood_type: 'AB+'})
MERGE (ab_pos)-[:CAN_DONATE_TO]->(target);

// 2. Demonstration Hospitals
MERGE (h1:Hospital {hospital_id: 'HOSP-001'})
SET h1.name = 'Metro Apex Multi-Specialty Hospital',
    h1.location = point({latitude: 12.9716, longitude: 77.5946});

MERGE (h2:Hospital {hospital_id: 'HOSP-002'})
SET h2.name = 'St. Jude Organ Transplant Center',
    h2.location = point({latitude: 13.0827, longitude: 80.2707});

MERGE (h3:Hospital {hospital_id: 'HOSP-003'})
SET h3.name = 'National Institute of Medical Sciences',
    h3.location = point({latitude: 17.3850, longitude: 78.4867});

MERGE (h4:Hospital {hospital_id: 'HOSP-004'})
SET h4.name = 'Fortis Care Regional Trauma Center',
    h4.location = point({latitude: 19.0760, longitude: 72.8777});

MERGE (h5:Hospital {hospital_id: 'HOSP-005'})
SET h5.name = 'City Life Memorial Hospital',
    h5.location = point({latitude: 28.7041, longitude: 77.1025});

MERGE (h6:Hospital {hospital_id: 'HOSP-006'})
SET h6.name = 'Highland Comprehensive Health Institute',
    h6.location = point({latitude: 22.5726, longitude: 88.3639});

// 3. System Users with PBKDF2 Password Hashes
MERGE (u1:User {user_id: 'USR-001'})
SET u1.username = 'admin_sys',
    u1.password_hash = 'pbkdf2_sha256$100000$organ_network_seed_salt_2026$5a363293e50772f7d5cbe93950f2495b6c8ba5b035a9689e47ebef501f28b753',
    u1.role = 'ADMIN',
    u1.is_active = true
WITH u1
MATCH (h1:Hospital {hospital_id: 'HOSP-001'})
MERGE (u1)-[:WORKS_AT]->(h1);

MERGE (u2:User {user_id: 'USR-002'})
SET u2.username = 'coordinator_sarah',
    u2.password_hash = 'pbkdf2_sha256$100000$organ_network_seed_salt_2026$54dbf2c7320ee1a26d11f62c5bbf8c4d3da48467fb306e9ec19d08316c4c6a6f',
    u2.role = 'COORDINATOR',
    u2.is_active = true
WITH u2
MATCH (h2:Hospital {hospital_id: 'HOSP-002'})
MERGE (u2)-[:WORKS_AT]->(h2);

MERGE (u3:User {user_id: 'USR-003'})
SET u3.username = 'dr_chen_transplant',
    u3.password_hash = 'pbkdf2_sha256$100000$organ_network_seed_salt_2026$faae3a696fa2f1e2f073fa8c95029e84bb5f84d6dd264102d99d3ec6e2d192c7',
    u3.role = 'DOCTOR',
    u3.is_active = true
WITH u3
MATCH (h3:Hospital {hospital_id: 'HOSP-003'})
MERGE (u3)-[:WORKS_AT]->(h3);

MERGE (u4:User {user_id: 'USR-004'})
SET u4.username = 'auditor_james',
    u4.password_hash = 'pbkdf2_sha256$100000$organ_network_seed_salt_2026$92ddda2cb6b479154ffaf6484e55e09f7a7596ae33391d4e0e56598c0a5a0d33',
    u4.role = 'AUDITOR',
    u4.is_active = true
WITH u4
MATCH (h4:Hospital {hospital_id: 'HOSP-004'})
MERGE (u4)-[:WORKS_AT]->(h4);

// Note: For complete batch seeding of all 50 synthetic donors and 50 recipients with coordinates,
// execute backend/scripts/seed.py which runs parameterized asynchronous bulk inserts.

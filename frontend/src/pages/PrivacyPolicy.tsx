import React from 'react';
import { Link } from 'react-router-dom';

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <div className="text-[11px] font-medium text-brand-ink mb-1">
          <span>Governance &amp; Data Protection Protocol</span>
        </div>
        <h1 className="text-xl font-semibold text-navy">
          Organ & Blood Registry Privacy Policy
        </h1>
        <p className="text-xs text-slate-500 font-sans mt-1">
          Effective Date: October 2026 · Compliant with HIPAA, GDPR Health Data Standards, and NOTA Regulations.
        </p>
      </div>

      <div className="space-y-6 text-sm text-slate-600 font-sans leading-relaxed">
        <section className="bg-white border border-slate-200 p-5 rounded-lg space-y-3">
          <h2 className="text-sm font-semibold text-navy">
            1. Scope and Health Information Safeguards
          </h2>
          <p>
            The Organ and Blood Donor-Recipient Matching Network (ODRN) processes protected health information (PHI)
            exclusively to identify compatible biological matches, prioritize clinical waitlists, and coordinate organ
            procurement across accredited medical facilities. All data access is strictly governed by institutional
            role-based access controls (RBAC).
          </p>
        </section>

        <section className="bg-white border border-slate-200 p-5 rounded-lg space-y-3">
          <h2 className="text-sm font-semibold text-navy">
            2. Collected Clinical Data Points
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-[11px] text-slate-600">
            <li>Donor biological profiles: ABO Rh blood type, organ and tissue availability, HLA typing, and cold ischemic time.</li>
            <li>Recipient waitlist telemetry: Urgency score (MELD/PELD/CPRA), diagnosis, primary hospital node, and registration timestamp.</li>
            <li>Geographic coordinates: Institutional distance computation for transport viability window calculations.</li>
            <li>Audit trail: Immutable logs of match requests, approvals, and allocation handoffs.</li>
          </ul>
        </section>

        <section className="bg-white border border-slate-200 p-5 rounded-lg space-y-3">
          <h2 className="text-sm font-semibold text-navy">
            3. Auditor Data Masking Protocol
          </h2>
          <p>
            In accordance with compliance standards, users authenticated with the AUDITOR role are served masked
            personal identifiers (e.g., patient and donor full names and IDs are redacted) while preserving verifiable
            cryptographic integrity of historical allocation transactions.
          </p>
        </section>

        <section className="bg-white border border-slate-200 p-5 rounded-lg space-y-3">
          <h2 className="text-sm font-semibold text-navy">
            4. Data Retention and Institutional Security
          </h2>
          <p>
            Allocation records are archived permanently in append-only ledgers to guarantee traceability in post-transplant
            surveillance. In-flight API communication enforces TLS 1.3 encryption and bearer token validation on every
            REST request under the FastAPI `/api/v1` gateway.
          </p>
        </section>
      </div>

      <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-xs ">
        <Link to="/dashboard" className="text-brand-ink hover:text-navy">
          Return to Operations Dashboard
        </Link>
        <span className="text-slate-500">Institutional Document ID: ODRN-PRIV-2026-A</span>
      </div>
    </div>
  );
};

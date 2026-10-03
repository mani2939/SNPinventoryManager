# Customer data protection and deployment responsibilities

This implementation provides technical safeguards for invoicing. It is not a certification of UK GDPR or other legal compliance. The controller must assess its actual processing, publish appropriate information and operate the controls below before using real customer data. ICO guidance is under review following the Data (Use and Access) Act; check current guidance when assessing the deployment.

## Implemented controls

- Customer name, phone, address and notes are encrypted **before database/file writes** using AES-256-GCM, random 96-bit nonces and authenticated record/field context. Item descriptions, seller invoice snapshots, seller settings and delivery recipient numbers are also encrypted. Tampering, missing keys and wrong keys fail closed; there is no plaintext fallback.
- Names are searched through purpose-separated keyed HMAC prefix tokens. Search matches starts of first/last name words, not arbitrary substrings. Invoice dates, numbers, prices, quantities, product IDs/SKUs, statuses and timestamps remain readable operational metadata. Search tokens expose equality, length/frequency patterns. These records remain personal data, not anonymous data.
- APIs and PDFs require an authenticated admin session. Mutation routes reject cross-origin requests. Database tables have RLS enabled with public access revoked; the server currently connects as owner. Responses use private/no-store headers; PDFs are generated in memory and are not saved in a public bucket. Tokens are server-only. Generic invoice failures do not log raw database/provider errors or request bodies.
- WhatsApp is sent only after explicit recipient selection and confirmation of customer agreement. Send history records the confirmation timestamp, encrypted recipient and provider acceptance/failure/uncertainty. This confirmation is an admin assertion, not a complete consent evidence system or a substitute for a lawful basis. A provider acceptance is not proof of delivery.
- Save/send identifiers prevent identical request retries from creating duplicate records/messages. Sends that time out or stop recording their outcome are marked uncertain (stalled claims after five minutes); the app never automatically resends. Check WhatsApp before deliberately preparing another attempt.
- Per-invoice export and explicit customer removal are available. Removal clears customer details, notes, descriptions, name-search tokens, payload fingerprints and saved recipient/message identifiers in active records while retaining financial information. Invoices cannot be sent after removal. This is **record redaction**, not proof that every identifying trace is erased: SKU/product links, dates and amounts can still identify a transaction. Handle linked inventory data, exports, downloaded PDFs, WhatsApp/Meta copies and backups separately.

## Key management

Run `npm run encryption:key` locally and store the generated `CUSTOMER_DATA_ENCRYPTION_KEY` in the deployment's protected server environment. Never commit keys or share their values in logs/chat. Store a restricted, encrypted recovery copy separately from database backups. Losing all matching keys makes customer records irrecoverable; restoring only a database backup is insufficient.

Use distinct keys and databases for production, previews and local tests. Restrict Vercel environment access, GitHub access and database owner access; use MFA for these accounts. Audit access to keys using the platform's facilities. Encryption does not protect against a compromised running application, an authorised admin extracting data or a platform user who can obtain both database and key.

For rotation, retain the former keys in `CUSTOMER_DATA_PREVIOUS_KEYS` (a JSON array), set a new current key, then redeploy while invoice writes/sends are paused. New records use the new key; old invoices, seller settings and recipients remain readable and old name tokens remain searchable while previous keys are configured. Existing records are **not automatically re-encrypted**. Retain needed keys for existing records/backups, or plan and validate a controlled migration before retiring them. Do not rotate during in-flight sends: recipient duplicate-prevention hashes change with the key. This feature is not a managed KMS/HSM.

## Business and hosting work before production use

1. Identify the controller, purposes and lawful bases; document data flows and retention. Tell customers what is collected, why, how long it is retained, who receives it and how to exercise their rights. Only collect an address/phone when needed; avoid sensitive information in free-text descriptions/notes.
2. Review contracts/data-processing terms, access, hosting regions and applicable transfer safeguards for Vercel, Neon, PeaSoup and Meta/WhatsApp. Configure HTTPS, encrypted provider backups and restricted production/preview access. Avoid recording customer names/numbers in infrastructure tracing, request bodies or analytics. The app does not install analytics, but platform logs can record URLs. The register sends customer-name filters in private POST bodies, never query strings; keep request-body capture disabled and configure log redaction/retention. Do not use real data in public previews.
3. Assign and periodically review retention periods for invoices, contact information, send history, exports and backups; reconcile erasure requests with applicable accounting/legal obligations before redacting. No blanket automatic deletion period is imposed by this app. Record rights requests and outcomes externally, including removal from recipients/services/backups where applicable.
4. Verify the requester's identity before disclosing exports or changing/removing details. Individual exports cover a single invoice; search for and handle all the person's invoices and external copies. Financial records may still contain personal metadata after removal.
5. This app currently has **one admin identity**, not per-staff roles, per-person action auditing, MFA or approval segregation. Keep its use restricted to the authorised owner. Implement individual accounts, granular access, audit trails and MFA if staff or your risk assessment require them. Record privacy/redaction decisions outside the app until an appropriate audited identity system is added.
6. Maintain patching, access reviews, recovery tests and a breach-response process. Assess whether a DPIA or other obligations apply to the actual business. Record and test these procedures rather than assuming encryption satisfies every obligation.

## WhatsApp and exported documents

Cloud API sending uploads a readable PDF to Meta over HTTPS and uses an approved document-header template. The PDF must be readable by the customer, so it is not encrypted with the application's database key. Protect access to Meta and review its media/message retention and processing terms. Manual WhatsApp opens a link containing message text; the operator must download and attach the PDF themselves. Never infer that the manual link sent or attached the invoice.

Downloaded PDFs and JSON exports contain readable personal data. Protect the operator's device/downloads, restrict onward sharing and follow the documented retention policy. The app cannot remotely erase customer-held or downloaded copies.

## References

- [ICO: Encryption and data protection](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/security/encryption/encryption-and-data-protection/)
- [ICO: Data protection by design and by default](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/accountability-and-governance/data-protection-by-design-and-default/)
- [ICO: UK GDPR resources](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/)

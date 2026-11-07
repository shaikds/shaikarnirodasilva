> **Template, not legal advice.** Have local counsel review before use.

# Data processing agreement (DPA): outline

Structure and key terms for the agreement between each restaurant and the vendor, with country
riders. Counsel turns this into the contract. Hebrew version: `dpa-outline-he.md`.

**Roles.** The restaurant decides why and how its cameras are used: it is the **controller**
(Israel: owner of the database; CCPA: business; Australia: the APP entity, if covered). The
vendor runs the software and the cloud on the restaurant's instructions: it is the
**processor** (Israel: holder; CCPA: service provider; Australia: contracted service provider).
One global DPA plus one rider per country.

## 1. Parties, definitions and order of precedence

- Restaurant (controller), vendor (processor), effective date, link to the main subscription
  agreement. The DPA prevails on data protection matters; the country rider prevails over the
  general DPA for that country.
- Definitions: personal data, processing, sub-processor, security incident, anonymous events
  (table and zone level events defined by the `rv_contracts` schema), edge device, cloud.

## 2. Description of the processing (Annex A)

| | |
|---|---|
| Subject matter | Restaurant Vision: anonymous service analytics from the restaurant's cameras |
| Duration | Term of the subscription plus the deletion period in section 10 |
| Nature | Edge: real-time, in-memory analysis of camera video on the restaurant's premises, no storage. Cloud: storage and reporting of anonymous events; user accounts |
| Purpose | Table states, waiter alerts, queue and occupancy metrics, shift and ROI reports. Not identification, not employee monitoring, not marketing |
| Data subjects | Guests, staff and visitors in camera view (edge, transient); dashboard and waiter-app users (cloud) |
| Personal data | Transient video frames (edge only); user name, email, role, password hash; browser push subscriptions; service logs without client IPs |
| Special categories | None. No biometric identifiers are created (see the non-identification statement, which is attached as Annex D) |

## 3. Controller instructions and the restaurant's own duties

- The vendor processes only on documented instructions: this DPA, the product configuration
  chosen by the restaurant, and written requests.
- The vendor tells the restaurant if an instruction appears unlawful.
- The restaurant is responsible for: lawful use of its cameras; signs at entrances; the
  website privacy notice; staff notices and policies (Israel 5/2017 written policy; NSW/ACT
  14-day notice; CT/NY/DE notices); consultation with staff representatives; the DPIA; privacy
  masks for private areas; and not combining events with other data to identify people. The
  vendor provides templates (`docs/compliance/`).

## 4. Confidentiality and personnel

Staff with access are bound by confidentiality, trained, and given access on a need-to-know,
least-privilege basis. The vendor has **no access to video**: the product does not transmit it.

## 5. Security measures (Annex B)

Summarise and keep current: on-site processing in memory; no frame persistence (enforced by
an automated test); privacy masks before detection; random rotating track IDs; closed outbound
schema; secrets file with owner-only permissions on the edge; device tokens hashed in the
cloud and revocable; TLS in transit; tenant isolation enforced in every data-access method and
tested; argon2 password hashing; login and pairing rate limits; access logging without client
IPs; backups encrypted at rest [CONFIRM]; vulnerability patching; incident response plan
(`docs/runbooks/operations.md`).

## 6. Sub-processors (Annex C)

List with location and function: cloud hosting [PROVIDER, REGION]; database hosting [ ];
email [ ]; error monitoring [ ]. Browser push services (Google, Apple, Mozilla) receive only the
encrypted push message (alert kind and table label). Give [30] days' notice of new
sub-processors; the restaurant may object on reasonable grounds. Flow down equivalent terms.

## 7. Assistance

The vendor assists with: data subject requests (account data; video is not retained, so there
is nothing to retrieve); DPIAs and consultations with regulators (non-identification statement,
security summary); and the restaurant's notices.

## 8. Security incidents

Notify the restaurant **without undue delay, and in any case within [24] hours** of becoming
aware of an incident affecting the restaurant's personal data, with the facts known, the
likely consequences, measures taken and a contact. Keep updating as facts emerge. The timing
must let the restaurant meet the shortest applicable deadline (Israel: "immediately" for serious
incidents; Australia: assess within 30 days; US state laws).

## 9. Audits

Annual summary of security controls on request; reasonable audits (on [30] days' notice, once a
year, at the restaurant's cost) or an independent report in their place.

## 10. Return and deletion

At the end of the subscription: export of reports on request within [30] days; then deletion of
the restaurant's account data and events within [90] days, except anonymous aggregates kept
under section 11. Edge devices: the uninstall procedure removes the secrets and the outbox;
revoke the device token in the dashboard.

## 11. Anonymous and aggregated data

The vendor may use **only aggregated, anonymous statistics** (for example "average waiting time
across restaurants in a region") for product improvement and benchmarks, never data that
identifies the restaurant to third parties without consent, and never any personal data. No
sale of data. State this right explicitly; cross-customer benchmarking is not allowed without
it.

## 12. International transfers

Hosting region: [REGION]. Transfers outside the restaurant's country only under the country
rider's mechanism.

## 13. Liability, term, governing law

As in the main agreement, with any carve-outs counsel requires.

---

## Rider IL: Israel

- Roles under the Privacy Protection Law, 5741-1981, as amended by Amendment 13 (in force
  14 Aug 2025): the restaurant is the owner of the database, the vendor a holder.
- The vendor complies with the Privacy Protection (Data Security) Regulations, 5777-2017, for
  any database it holds for the restaurant, including the regulations' requirements for
  outsourcing agreements (permitted processing, data types, security duties, confidentiality,
  return or deletion, reporting) [counsel to map each requirement to a clause].
- Security incidents: notify the restaurant immediately upon discovery or reasonable
  suspicion of a serious incident, so it can notify the Privacy Protection Authority.
- Transfers abroad: if the cloud is outside Israel, the vendor gives a written undertaking to
  comply with Israeli privacy law and the Transfer of Data to Databases Abroad Regulations,
  2001, and to bind its sub-processors; hosting region [Israel / EU].
- DPO: the vendor states whether it has appointed a Data Protection Officer (Amendment 13
  requires one for holders whose core activity involves systematic monitoring at significant
  scale) [counsel to confirm the vendor's position; an external DPO is allowed].
- Workplace: the restaurant confirms it has a written camera policy for this purpose and
  signed staff acknowledgements (guidance 5/2017, *Isakov*).

## Rider US: United States

- CCPA/CPRA service-provider terms (where the restaurant is a covered business): process only
  for the business purposes in Annex A; no selling or sharing; no retaining, using or disclosing
  outside the direct business relationship; no combining with other data except as the
  regulations permit; comply with the CCPA and give the same level of protection; notify the
  restaurant if it can no longer comply; allow reasonable steps to stop unauthorised use;
  flow down to sub-processors. [Counsel to align with Cal. Code Regs. tit. 11, § 7051.]
- NYC (Admin. Code § 22-1202(b)): the vendor never sells, leases, trades or shares biometric
  identifier information. The product creates none.
- No face recognition: the vendor will not enable identification features (Portland, OR ban;
  BIPA, Texas CUBI).
- State breach notification laws: the vendor's notice under section 8 supports the restaurant's
  notifications.

## Rider AU: Australia

- APP compliance: the vendor handles personal information as an APP entity would (APP 1 and
  APP 11 security, APP 6 use and disclosure), whether or not the restaurant is a small business.
- Cross-border: hosting in [AU region]; otherwise APP 8 safeguards, with the vendor accepting
  the responsibility allocation under s.16C.
- Notifiable Data Breaches: the vendor notifies the restaurant promptly and helps it assess an
  eligible data breach within 30 days and prepare statements to the OAIC and individuals.
- Workplace surveillance: the restaurant gives the NSW/ACT 14-day written notices, displays
  entrance signs and keeps cameras visible; the vendor supplies the template.
- Automated decision-making (APP 1.7 to 1.9 from 10 Dec 2026): the product makes no decisions
  about individuals; the restaurant will not use outputs to make such decisions without
  updating its privacy policy.

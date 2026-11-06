# Privacy, Surveillance & AI Regulation for an Anonymous Edge-AI Camera Analytics Product for Restaurants (Israel, USA, Australia) — as of Nov 2026

> Research notes, not legal advice. Product assumed: connects to the restaurant's existing CCTV; person detection + tracking on an on-site edge box; no face recognition; no video stored or uploaded; only anonymous counts/events (e.g. "table 7 waiting 4 min", "34 diners now") go to a multi-tenant cloud dashboard; may measure staff response times.
>
> **Method caveat:** In this session, page fetches to several law-firm and guide sites were blocked by the sandbox network (e.g. practiceguides.chambers.com, ashurstperkinscoie.com). Findings therefore rely on web-search result extracts from law-firm alerts, regulators, and legislature pages, not on full reads of the statutes. Where sources conflict, both are given. Items marked **[background — not verified this session]** come from prior knowledge and must be checked.

---

## 1. ISRAEL — Privacy Protection Law (PPL) + Amendment 13, PPA camera/workplace/biometric/AI guidance, data security regs, AI policy

### Takeaway
Amendment 13 (in force 14 Aug 2025) defines "personal data" broadly (any identified *or identifiable* person, including via biometric, location or online identifiers). It adds "information of special sensitivity", which includes biometric data, and gives the Privacy Protection Authority (PPA) real fining powers. The anonymous counts themselves are low-risk. The live video the edge box processes, and any per-waiter metric, are personal data. The biggest Israeli risk is employee monitoring: PPA guidance 5/2017 says footage from security cameras may not be repurposed to check employee attendance or output. Measuring per-staff response times from security cameras therefore needs a new, disclosed, proportionate purpose, or should be designed out by measuring per-table metrics only.

### Cited Findings

**Amendment 13: status, definitions**
- Amendment 13 took effect on 14 August 2025, and the PPA said it would begin enforcing it from that date. — [law.co.il (13 Aug 2025)](https://www.law.co.il/news/2025/08/13/starting-tomorrow-privacy-protection-authority-will-enforce/); [IAPP](https://iapp.org/news/a/israel-marks-a-new-era-in-privacy-law-amendment-13-ushers-in-sweeping-reform)
- Before the amendment, the PPL did not define "personal data". Amendment 13 defines it as "data relating to an identified or identifiable person". Identifiability is judged by reasonable effort, and the definition lists identifiers including biometric identifiers, location data and online identifiers. — [Baker McKenzie Global Data & Cyber Handbook – Israel key definitions](https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/emea/israel/topics/key-definitions); [ILF Law](https://www.ilflaw.com/publications/israels-privacy-protection-law-amendment-a-landmark-reform-in-data-protection-and-privacy-rights/)
- "Sensitive data" was replaced by "information/data of special sensitivity". Translations differ: "Highly Sensitive Data" (Herzog) and "Especially Sensitive Data" (DLA Piper). It explicitly includes biometric identifiers, alongside medical, genetic, location and financial data. Chambers notes the Israeli definition is broader than the GDPR's special categories. — [Herzog Fox & Neeman](https://herzoglaw.co.il/en/news-and-insights/amendment-no-13-to-the-israeli-privacy-protection-law/); [DLA Piper – Definitions Israel](https://www.dlapiperdataprotection.com/index.html?t=definitions&c=IL); [Levion guide](https://levion.tech/en/guides/amendment-13/); Chambers Data Protection 2026 – Israel (via search extract; page fetch blocked)

**Database registration**
- Database registration is now largely abolished. Only data brokers (databases whose main purpose is passing data on for consideration, holding data on more than 10,000 people) and public bodies must register. — [Safetica](https://safetica.com/resources/guides/israel-s-amendment-13-what-the-new-data-protection-law-means-for-your-business); [DPO Israel guide](https://dpoisrael.com/en/amendment-13/); [BigID](https://bigid.com/blog/what-israel-amendment-13-means-for-businesses-in-2025/)
- Sources also mention a notification duty for databases with sensitive data on more than 100,000 people. This threshold conflicts across secondary sources and was not verified against the statute. — [ppc.land on PPA DPO guidance draft](https://ppc.land/israels-privacy-authority-publishes-data-protection-officer-guidance-draft/)

**DPO (s.17B1)**
- A DPO is mandatory for:
  - public bodies;
  - data brokers;
  - controllers **or holders (processors)** "whose main activities involve data processing … which due to their nature, scope, or purposes necessitate regular and systematic monitoring of individuals, including significant tracking or surveillance of behavior, location, or actions to a significant scale";
  - entities whose core activity is processing especially sensitive data on a significant scale (statutory examples: hospitals and health funds).

  An external DPO is allowed under s.17B3(b). The statutory examples given for the monitoring limb are mobile telecoms and online search providers. — [Herzog Fox & Neeman](https://herzoglaw.co.il/en/news-and-insights/amendment-no-13-to-the-israeli-privacy-protection-law/); [DPO Israel](https://dpoisrael.com/en/amendment-13/); [Levion](https://levion.tech/en/guides/amendment-13/)
- The PPA published draft DPO guidance. A DPO guide also references a final PPA "Disclosure Opinion" dated 14 July 2026, whose content was not found. — [ppc.land](https://ppc.land/israels-privacy-authority-publishes-data-protection-officer-guidance-draft/)

**Fines and enforcement** (sources conflict, so verify against the statute's Fifth Schedule)
- A per-person formula is reported from PPA guidance: NIS 4 per data subject in the database, NIS 8 if it holds specially sensitive data, with a floor of NIS 200,000. — [Globalbit summary](https://globalbit.co.il/blog/privacy-amendment-13-software-development)
- Other reported figures:
  - fines up to ILS 320,000 per violation;
  - court-imposed fines up to ILS 10,000 for some violations;
  - personal fines on office holders up to ILS 150,000 (unclear);
  - an Authority worked example of about NIS 400,000 for a public body with no DPO holding 100,000 sensitive records;
  - a 10% reduction if a DPO is already appointed.

  — [DPO Israel](https://dpoisrael.com/en/amendment-13/); [Safetica](https://safetica.com/resources/guides/israel-s-amendment-13-what-the-new-data-protection-law-means-for-your-business)
- One example of an actual fine: Meuhedet, about NIS 256,000. — [Levion](https://levion.tech/en/guides/amendment-13/)
- One blog claims fines of up to 5% of turnover. No other source corroborates this, so treat it as unreliable. — [Clym blog](https://www.clym.io/blog/amendment-13-israels-updated-privacy-protection-law-and-what-businesses-must-do-now)
- A security-vendor site claims every filmed person can sue for up to NIS 10,000 without proof of damage. This is unverified and from a commercial source. — [companics.co.il](https://companics.co.il/amendment-13-privacy-law-security-cameras/)
- After Amendment 13 the PPA updated its policy documents and published a professional guide and Q&A. — [law.co.il (14 Aug 2025)](https://www.law.co.il/news/2025/08/14/ppa-is-updating-its-guidelines-following-amendment-13/)

**Surveillance camera guidance (הנחיית מצלמות מעקב)**
- General camera guidance: PPA Guidance No. 4/2012, "Use of security and surveillance cameras and the databases captured therein", plus an opinion letter dated 3 Nov 2010. — [DLA Piper – Collection & processing Israel](https://dlapiperdataprotection.com/?c=IL&t=collection-and-processing)
- One industry site says Amendment 13 added **no camera-specific rules**. Existing guidance still says cameras must not record audio except as permitted under the Wiretap Law; violating that is a criminal offence. — [companics.co.il](https://companics.co.il/amendment-13-privacy-law-security-cameras/)
- A 30-day default retention figure for footage is circulated by security vendors. It is a professional recommendation, not a verified PPA rule. — [companics.co.il](https://companics.co.il/amendment-13-privacy-law-security-cameras/)

**Workplace cameras (Guidance 5/2017)**
- Guidance No. 5/17 (Oct 2017), "Use of surveillance cameras in the workplace and during the course of employment relationship", rests on legitimacy, transparency, proportionality, good faith and fairness. — [IAPP](https://iapp.org/news/a/israeli-dpa-guidelines-on-workplace-surveillance); [Herzog](https://herzoglaw.co.il/en/news-and-insights/privacy-rights-and-use-of-cameras-in-the-workplace-2/)
- Areas open to customers or the public (e.g. a dining room or lobby) are "public places", and employees have no expectation of privacy there. Shared workspaces fall within "personal space" to some degree. Cameras in changing rooms or restrooms are prohibited, and employee consent cannot cure this. — [IAPP](https://iapp.org/news/a/israeli-dpa-guidelines-on-workplace-surveillance); [apm.law](https://www.apm.law/israeli-dpa-guidelines-on-workplace-surveillance-2/)
- **Footage from cameras installed for security may not be used to check employee attendance or output.** Cameras near individual workstations are generally prohibited. Surveillance is allowed in common areas, for security, under a written policy. — search extract summarising [DLA Piper](https://dlapiperdataprotection.com/?c=IL&t=collection-and-processing) and Chambers 2026
- Employers must notify employees of cameras via signage, and install cameras only in public work areas, not in a personal office or toilets. — [Oz, Lotan, Einav & Norkin](https://o-n.law/privacy-protection-law-amendment-no-13/) (Hebrew, via search extract)

**Employee monitoring case law**
- *Isakov v. Panaya* (National Labor Court, Labor Appeal 90/08, 8 Feb 2011, Chief Judge Nili Arad):
  - workplace privacy is a constitutional value, balanced against the employer's property and managerial prerogative;
  - the employer must have a clear, specific policy (generic or vague policies are not allowed);
  - the employer must consider less-invasive alternatives;
  - monitoring requires informed, free, written consent;
  - evidence obtained in violation was ruled inadmissible.

  Later labor courts apply these rules to monitoring software. — [law.co.il](https://www.law.co.il/en/news/2011/02/10/monitoring-employees-email-severely-restricted/); [IAPP](https://iapp.org/news/a/2011-12-05-landmark-case-establishes-employee-monitoring-guidelines/); [InfoLawGroup](https://www.infolawgroup.com/blog/2011/02/articles/enforcement/israels-national-labor-court-imposes-strict-limits-on-employee-monitoring); [Goldfarb labor update 2019](https://www.goldfarb.com/labor-law-update-september-2019/)
- On 26 March 2025 the National Labor Court clarified when employees have a reasonable expectation of privacy at work. — [Library of Congress Global Legal Monitor](https://www.loc.gov/item/global-legal-monitor/2025-05-06/israel-court-addresses-employees-right-to-workplace-privacy)

**Biometrics at work**
- PPA guideline "Collection and Use of Biometric Information in the Workplace", 28 Feb 2024 (draft July 2023). Requirements:
  - notice and consent;
  - proportionality, transparency, purpose limitation, security and minimisation;
  - non-biometric alternatives must be offered, and employees who refuse must not be disadvantaged.

  — [DLA Piper](https://dlapiperdataprotection.com/?c=IL&t=collection-and-processing); [BiometricUpdate (Mar 2024)](https://www.biometricupdate.com/202403/israel-bosses-can-only-collect-biometrics-if-they-heed-worker-privacy); [Arnon Tadmor-Levy](https://arnontl.com/news/use-of-employee-biometrics/)

**AI**
- In April 2025 the PPA published **draft** guidance on applying the PPL to AI systems. The comment period was extended to 6 July 2025.
  - Any AI system that processes personal data at any stage of its lifecycle is subject to the PPL.
  - It recommends privacy-by-design, DPIAs and AI use policies, and defences against inference attacks.
  - One source says high-risk AI requires a DPO and a DPIA before deployment.
  - No source confirmed that the guidance has been finalised.

  — [Pearl Cohen](https://www.pearlcohen.com/israel-new-draft-guidelines-on-the-application-of-privacy-law-to-ai/); [Arnon Tadmor-Levy](https://arnontl.com/news/israeli-privacy-authority-extends-period-for-comment-on-draft-guidance-on-ai-systems/); [EBN Law](https://www.ebnlaw.co.il/media-center/draft-guidance-from-the-israeli-privacy-protection-authority/); [Barnea 2025 year-end review](https://barlaw.co.il/2025-year-end-review-privacy-protection-and-artificial-intelligence/)
- Israel's national AI policy (Ministry of Innovation, Science & Technology with the Ministry of Justice, Dec 2023) is non-binding. It favours sector-specific regulation over a horizontal AI law and sets six regulatory and six ethical principles aligned with the OECD. No binding AI-specific statute has been reported. — [Pearl Cohen](https://www.pearlcohen.com/israel-publishes-ai-regulatory-policy-document/); [Israel Tech Policy Institute primer](https://techpolicy.org.il/?p=5202); [OECD.AI](https://oecd.ai/en/dashboards/policy-initiatives/israels-policy-on-artificial-intelligece-regulation-and-ethics-9458)

**Data security**
- The Privacy Protection (Data Security) Regulations 2017 (in force 2018) set tiered security levels and the first general breach-notification duty. Medium and high-level databases must notify the regulator "immediately". In 2022 the PPA hardened this: "immediate" means upon discovery or reasonable suspicion of a serious incident. — [IAPP](https://iapp.org/news/a/israel-enacts-landmark-data-security-notification-regulations); [Pearl Cohen](https://www.pearlcohen.com/israel-privacy-protection-authority-hardens-its-policy-on-breach-notification-timescales/); [law.co.il](https://www.law.co.il/en/news/2022/09/14/policy-on-breach-notification-timescales/)

**Cross-border transfer**
- The Transfer of Data to Databases Abroad Regulations 2001 allow transfers:
  - to adequate countries;
  - by contractual undertaking to comply with Israeli law mutatis mutandis (plus 2023 EEA-data instructions where relevant);
  - with consent;
  - within a corporate group.

  The PPA has tightened its interpretation: a July 2024 draft opinion on Reg. 2(4), and an April 2026 position paper saying foreign databases may be fully subject to the PPL. Companies are told to review SaaS agreements. — [Gornitzky (Jul 2024)](https://www.gornitzky.com/cross-border-data-transfer-agreements-the-position-of-the-israeli-privacy-protection-authority/); [Barnea](https://barlaw.co.il/practice_areas/high-tech/cyber/client_updates/transfer-of-personal-data-abroad-israeli-ppa-sharpens-requirements-for-organizations/); [Pearl Cohen](https://www.pearlcohen.com/israeli-privacy-regulator-clarifies-requirements-for-cross-border-data-transfers/)

### Inferences

**Is real-time analytics without stored video personal-data processing in Israel?**
- **Probably yes at the edge, probably no in the cloud.** The camera stream shows identifiable people, and Amendment 13's "identifiable with reasonable effort" test plus the PPA's view that any AI touching personal data at any lifecycle stage is covered both point to the edge inference being processing of personal data. The restaurant is the controller; the vendor is likely a "holder" (processor).
- Aggregate counts or table-level events in the cloud with no linkage to a person are likely outside the PPL.
- **The exception is staff metrics.** A per-waiter response time is personal data about an identifiable employee.

**Biometric line**
- Detection boxes, pose and short-lived track IDs are not "biometric identifiers" as long as they are not used to identify a person.
- Person re-identification embeddings (appearance or gait vectors), especially if persisted or matched across cameras or visits, move toward "biometric identifier" or "special sensitivity" territory.
- Gait recognition is a recognised biometric modality. Avoid it, or keep embeddings in RAM, per-camera, and reset frequently.

**DPO risk**
- The "systematic monitoring … tracking of behavior, location … to a significant scale" limb applies to holders as well as controllers.
- A multi-tenant vendor tracking movement of people across many restaurants could be argued to fall within it, even though outputs are anonymous.
- Get Israeli counsel's view. Appointing an external DPO is cheap insurance and earns a reported 10% fine reduction.

**Employee monitoring**
- Guidance 5/2017's purpose limitation (no security footage for output or attendance) plus *Isakov* (specific policy, less-invasive alternatives, informed written consent) make per-employee productivity scoring from security cameras the highest-risk feature in Israel.
- Lower-risk design: report service metrics per table or zone ("table 7 waited 4 min") without attributing them to a named or identifiable waiter, and without leaderboards.
- If staff-level metrics are offered, the restaurant needs:
  - a written monitoring policy;
  - an updated employee notice, ideally with signed acknowledgment or consent;
  - a proportionality assessment;
  - consultation with the workers' committee or union where one exists;
  - assurance that results are not used for discipline without due process.

**Practical Israeli checklist**

*For the restaurant:*
- update camera signs to mention "AI analytics: anonymous counting, no facial recognition, no recording by the system";
- update the privacy notice and workplace camera policy;
- do a DPIA-style assessment (recommended by the PPA AI draft).

*For the vendor:*
- a processor (holder) agreement with each restaurant;
- data security regs compliance for any cloud database holding personal data (e.g. user accounts, staff identifiers);
- a cross-border transfer basis if the cloud is outside Israel;
- no audio, ever (Wiretap Law).

### Gaps
- Full text of PPA Guidance 4/2012 and 5/2017 as updated after Amendment 13 was not retrieved (Hebrew originals on gov.il). I could not confirm whether the PPA has issued anything specific to video analytics or "smart cameras".
- The exact fine schedule (Fifth Schedule amounts and per-data-subject multipliers) conflicts across sources and was not verified against Knesset text.
- I found no PPA statement on whether transient, unstored edge inference counts as "processing" or "collection". The inference above is reasoning, not regulator guidance.
- Whether the AI guidance was finalised after the 2025 draft is unknown.
- The content of the 14 July 2026 PPA DPO "Disclosure Opinion" was not found.
- I could not confirm whether the 2017 Data Security Regulations' outsourcing-contract provision (regarding processors/holders) was amended by Amendment 13 [background: the regs contain an outsourcing-agreement requirement — not verified this session].

---

## 2. USA — BIPA, Texas CUBI, Washington, NYC signage law, Portland FR ban, CCPA/CPRA regs, Colorado AI Act, employee-monitoring notice laws, California workplace bills, NLRB

### Takeaway
US biometric laws are triggered by data that can identify a person: face or hand geometry, and templates. Under *Zellmer v. Meta* (9th Cir. 2024), scans that cannot identify someone fall outside BIPA. NYC's law is triggered when a food or drink establishment uses characteristics "to identify, or assist in identifying". Washington excludes data generated from photos and video. A no-face-recognition, no-template, no-re-identification design is therefore largely outside the biometric statutes. The live US exposures are:
- the NYC signage exemption, which is lost if software analyses video to identify people;
- employee monitoring: NY, CT and DE notice laws, and the CCPA risk assessments for "systematic observation" of employees that apply in 2026–2027;
- Portland's ban, which only matters if face recognition is ever added.

### Cited Findings

**Illinois BIPA**
- SB 2979 was signed on 2 Aug 2024 and took effect immediately. Repeated collections from the same person are now "at the most, one recovery" per person. Damages stay at $1,000 per negligent and $5,000 per intentional or reckless violation. — [Fisher Phillips](https://www.fisherphillips.com/en/insights/insights/breaking-bipa-news-illinois-curtails-massive-damage-awards-in-biometric-cases); [DWT](https://www.dwt.com/blogs/privacy--security-law-blog/2024/08/illinois-bipa-biometrics-law-amended-for-damages)
- On 1 Apr 2026, in *Clay v. Union Pacific*, the Seventh Circuit held the amendment applies retroactively to pending cases. — [ABA Business Law Today (May 2026)](https://www.americanbar.org/groups/business_law/resources/business-law-today/2026-may/7th-circuit-holds-bipa-damages-remedy-applies-retroactively/); [Fisher Phillips](https://www.fisherphillips.com/en/insights/insights/major-biometric-win-for-business-in-illinois); [Paul Hastings](https://www.paulhastings.com/insights/ph-privacy/7th-circuit-confirms-bipa-amendment-has-retroactive-application)
- *Zellmer v. Meta* (9th Cir., 17 June 2024, 104 F.4th 1117): "scans of face geometry fall within BIPA's list, but are not covered by BIPA if they cannot identify a person". Both "biometric identifiers" and "biometric information" must be capable of identifying an individual. Meta's "face signature" could not identify or be reverse-engineered, so it was not covered. BIPA protects non-users too. — [Eric Goldman blog](https://blog.ericgoldman.org/archives/2024/06/facebook-defeats-bipa-face-scanning-lawsuit-zellmer-v-meta.htm); [Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/ninth-circuit-holds-face-signatures-used-for-photo-tag-suggestions-are-not-biometric-information)

**Texas CUBI**
- Notice and consent are required before capturing face geometry and other biometric identifiers for a "commercial purpose". Only the Attorney General can enforce, with up to $25,000 per violation.
- The AG settled with Meta for $1.4B (30 July 2024) and with Google for $1.375B (May 2025).

— [Texas AG press release](https://www.texasattorneygeneral.gov/news/releases/attorney-general-ken-paxton-secures-14-billion-settlement-meta-over-its-unauthorized-capture); [Cybersecurity Law Report](https://www.cslawreport.com/21169961/texas-ags-billiondollar-settlement-with-google-highlights-biometric-data-use-compliance-considerations.thtml)

**Washington RCW 19.375**
- "Biometric identifier" excludes "a physical or digital photograph, video or audio recording or data generated therefrom".
- The statute is triggered by "enrollment": capturing an identifier, converting it to a reference template, and storing it in a database.
- A security purpose is not a "commercial purpose". There is no private right of action.

— [RCW 19.375 (WA Legislature)](https://app.leg.wa.gov/RCW/default.aspx?cite=19.375&full=true); [Hintze Law](https://hintzelaw.com/blog/wa-my-health-my-data-act-pt7-biometrics)

**NYC biometric identifier law (Admin Code §22-1201 et seq., Local Law 2021/3)**
- In effect since 9 July 2021. It covers "commercial establishments": places of entertainment, retail stores, and **food and drink establishments**. — [Troutman](https://www.troutman.com/insights/new-york-city-enacts-biometrics-law-for-food-and-drink-establishments-entertainment-venues-and-retail-stores); [Carlton Fields](https://carltonfields.com/insights/publications/2021/new-york-city-biometric-law)
- **Definition:** "biometric identifier information" means a physiological or biological characteristic used by or on behalf of a commercial establishment "to identify, or assist in identifying" an individual (retina or iris, fingerprint, voiceprint, hand or face geometry, "or any other identifying feature"). — [Perkins Coie](https://perkinscoie.com/print/pdf/node/4451); [intro.nyc Int. 1170-A](https://intro.nyc/1170-2018)
- **Duties:**
  - a clear, conspicuous plain-language sign near all customer entrances (§22-1202(a));
  - a ban on selling, leasing, trading, sharing or otherwise profiting from biometric identifier information (§22-1202(b)).
- **Exemption from the sign requirement:** images or video are exempt if (i) they are not analysed by software or applications that identify, or assist in identifying, individuals based on physiological or biological characteristics, and (ii) they are not shared, sold or leased to third parties other than law enforcement. — [intro.nyc Int. 1170-A](https://intro.nyc/1170-2018); [Troutman](https://www.troutman.com/insights/new-york-city-enacts-biometrics-law-for-food-and-drink-establishments-entertainment-venues-and-retail-stores)
- **Enforcement:** a private right of action. Signage violations carry $500 each, after a 30-day written notice and cure period. Profit-ban violations carry $500 (negligent) or $5,000 (intentional or reckless), with no notice required. — [Carlton Fields](https://carltonfields.com/insights/publications/2021/new-york-city-biometric-law)
- **Pending proposal:** Int. No. 217 (2024) would broaden the law to "places or providers of public accommodation". Its enactment status is unknown. — [intro.nyc Int. 217-2024](https://intro.nyc/0217-2024)

**Portland, OR (City Code ch. 34.10)**
- In effect since 1 Jan 2021. It bans private entities from using face recognition technology in places of public accommodation, explicitly including establishments serving food or drink.
- Limited exceptions exist (e.g. compliance with law). There is no clear consent exception.

— [City of Portland](https://www.portland.gov/smart-city-pdx/news/2020/9/9/city-council-approves-ordinances-banning-use-face-recognition); [DWT](https://www.dwt.com/blogs/privacy--security-law-blog/2021/01/portland-facial-recognition-ban)

**CCPA / CPRA regulations (ADMT, risk assessments, cybersecurity audits)**
- The CPPA board adopted the package on 24 July 2025. The Office of Administrative Law approved it on 22 Sept 2025, and it took effect on 1 Jan 2026. — [CPPA](https://privacy.ca.gov/laws-and-regulations/ccpa-cyber-risk-admt-insurance/); [Foley](https://www.foley.com/insights/publications/2025/09/updated-ccpa-regulations-approved-by-california-office-of-administrative-law/)
- **Compliance dates:**
  - ADMT obligations for "significant decisions" apply from 1 Jan 2027.
  - Risk assessments are required before starting new in-scope processing. Processing that was already ongoing must be assessed by 31 Dec 2027.
  - Assessment information must be submitted to the CPPA by 1 Apr 2028.
  - Cybersecurity audits phase in by revenue, from 2028 to 2030.

  — [Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/newly-approved-ccpa-regulations-have-staggered-deadlines-for-compliance); [Morgan Lewis (Jul 2026)](https://www.morganlewis.com/pubs/2026/07/ccpa-risk-assessment-requirements-and-best-practices)
- **Risk-assessment trigger relevant here:** using automated processing to infer or extrapolate a consumer's (including an employee's or contractor's) "performance at work", reliability, behaviour, location or movements based on **"systematic observation"**. That term is defined as methodical and regular or continuous observation, including through "video or audio recording or live-streaming", Wi-Fi or Bluetooth tracking, RFID and similar. — [FPF Issue Brief (Oct 2025)](https://fpf.org/wp-content/uploads/2025/10/FPF_CCPA-Regulations-Issue-Brief.pdf); [Jackson Lewis Workplace Privacy Report (May 2026)](https://www.workplaceprivacyreport.com/2026/05/articles/california-consumer-privacy-act/is-a-ccpa-risk-assessment-required-when-using-productivity-management-and-monitoring-platforms/); [Skadden](https://www.skadden.com/insights/publications/2025/10/california-finalizes-cppa-regulations)

**Colorado AI Act**
- SB 24-205 was delayed to 30 June 2026 by SB 25B-004, signed 28 Aug 2025.
- xAI sued on 9 Apr 2026, and enforcement was effectively frozen on 27 Apr 2026.
- **SB 26-189**, signed 14 May 2026, repealed and replaced SB 24-205. The new law:
  - takes effect **1 Jan 2027**;
  - narrows the statute to consumer transparency and rights for consequential automated decisions;
  - drops the algorithmic-discrimination self-reporting duty;
  - adds three-year record retention.

— [Arnold & Porter (Jul 2026)](https://www.arnoldporter.com/en/perspectives/advisories/2026/07/colorado-narrows-its-ai-law-but-the-ftc-says-thats-not-enough); [Eckert Seamans](https://www.eckertseamans.com/legal-updates/colorado-repeals-and-replaces-its-landmark-ai-statute-what-businesses-need-to-know); [Tech Times](https://www.techtimes.com/articles/319420/20260701/colorado-ai-law-reset-discrimination-duty-dropped-disclosure-takes-its-place.htm)

**State employee-monitoring notice laws**
- **New York (Civ. Rights Law §52-c, effective 7 May 2022):**
  - applies to private employers that monitor telephone, email or internet access/usage;
  - written notice at hiring, with written or electronic acknowledgment;
  - a notice posted in a conspicuous place. — [MoFo](https://www.mofo.com/resources/insights/211115-new-york-enacts-employee-monitoring-notification-law); [Goldberg Segalla](https://www.goldbergsegalla.com/news-and-knowledge/knowledge/new-york-enacts-law-mandating-employee-consent-of-electronic-monitoring/); [Baker McKenzie](https://connectontech.bakermckenzie.com/new-yorks-new-electronic-monitoring-disclosure-law-requires-action-before-may/)
- **Connecticut (§31-48d):**
  - broadest scope: collecting information on the employer's premises about employees' activities or communications "by any means other than direct observation", which covers camera monitoring;
  - prior written notice and a conspicuous posting;
  - no acknowledgment required. — [Baker McKenzie](https://connectontech.bakermckenzie.com/new-yorks-new-electronic-monitoring-disclosure-law-requires-action-before-may/) (via search extract)
- **Delaware (19 Del. C. §705):**
  - covers monitoring of phone, email and internet;
  - notice may be one-time or daily electronic;
  - sources conflict on whether acknowledgment is needed (MoFo and Baker McKenzie say yes; WilmerHale says no). — [MoFo](https://www.mofo.com/resources/insights/211115-new-york-enacts-employee-monitoring-notification-law)

**California workplace surveillance**
- **AB 1331** was signed on 30 Sept 2026 (Stats. 2026, ch. 851) and takes effect 1 Jan 2027. It bars workplace surveillance tools in bathrooms and similar areas, with penalties of up to $500 per violation. — [NatLawReview](https://natlawreview.com/article/californias-new-workplace-surveillance-law-employee-bathroom); [Ogletree](https://ogletree.com/insights-resources/blog-posts/california-governor-signs-3-bills-targeting-ai-and-workplace-surveillance/); [Governor's office (30 Sep 2026)](https://www.gov.ca.gov/2026/09/30/californias-nation-leading-ai-framework-just-got-stronger-governor-newsom-signs-more-first-in-the-nation-worker-protections-and-more/)
- **AB 1883**, signed the same day as ch. 853, restricts AI tools that read emotions or collect neural data. It also takes effect 1 Jan 2027. — [Ogletree](https://ogletree.com/insights-resources/blog-posts/california-governor-signs-3-bills-targeting-ai-and-workplace-surveillance/); [EBG](https://www.ebglaw.com/insights/publications/four-new-california-laws-reshape-the-rules-for-workplace-ai)
- **AB 1221**, the broader bill requiring notice of workplace surveillance tools, died on 31 Jan 2026. — [Ruggles Law](https://ruggleslawfirm.com/california-workplace-surveillance-2027/); [GovBuddy](https://www.govbuddy.com/california/bills/ab-1331/)

**NLRB**
- GC Memo 23-02 (Abruzzo, Oct 2022) treated intrusive electronic monitoring as potentially interfering with Section 7 rights. Acting GC William Cowen rescinded it through GC 25-05 on 14 Feb 2025. The NLRB is now less likely to pursue cases where the employer shows a legitimate business purpose. — [Ogletree](https://ogletree.com/insights-resources/blog-posts/rescinded-guidance-unpacking-nlrb-acting-general-counsel-cowens-policy-overhaul); [Kilpatrick Townsend](https://ktslaw.com/insights/alert/2025/2/reshaping-federal-labor-policy-acting-nlrb-general-counsel-rescinds-numerous-biden-era-guidance-memos)

### Inferences

**Does person tracking without identification trigger the biometric laws?**
- **BIPA:** likely not, if the system never extracts face geometry or templates and its features cannot identify anyone (*Zellmer*). *Zellmer* is a 9th Circuit reading. Illinois state courts and the 7th Circuit are not bound by it, and BIPA plaintiffs have sued over "anonymous" analytics before. Litigation risk is therefore not zero in Illinois. Keep a written technical declaration, like Meta's in *Zellmer*, explaining that the features cannot identify anyone.
- **Body/gait features and cross-camera re-identification:** these are the danger zone. Gait and body-shape vectors that link a person across cameras or visits could be argued to be "biometric identifiers" or "any other identifying feature" under NYC law. Texas CUBI and BIPA list specific identifiers (face or hand geometry, retina, iris, fingerprint, voiceprint) but are interpreted expansively.
- **Recommended design:** in-memory track IDs only, single-camera or short time windows, no persistence across days, no face crops, no gait models.

**NYC**
- Restaurants in NYC must post the sign **unless** they qualify for the video exemption. That exemption fails only if the software identifies or assists in identifying people.
- An anonymous people-counter arguably keeps the exemption. Because restaurants are named in the statute and a private right of action exists, a voluntary, plain-language sign ("This venue uses AI video analytics to count customers and measure wait times. No facial recognition. No biometric data is collected or stored.") is cheap insurance.
- Never sell or share any derived biometric-adjacent data.

**Portland:** a hard prohibition only if face recognition is used. Do not offer face, VIP or blacklist features in Portland at all.

**CCPA**
- Applicability depends on each restaurant meeting CCPA thresholds; many independent restaurants will not [background: approx. $26.6M revenue threshold for 2025 — not verified this session].
- The vendor would normally be a "service provider", which requires a CCPA-compliant contract [background — not verified].
- For CCPA-covered restaurant groups, per-employee response-time scoring from video is very likely a **"systematic observation" → risk assessment** trigger, and could become ADMT if used for significant employment decisions (discipline, scheduling, pay) from 1 Jan 2027.
- Table-level metrics with no employee attribution likely avoid both.

**Employee notice:**
- In NY, CT and DE, give written notice of monitoring, and get acknowledgment in NY.
- CT's "any means other than direct observation" clearly captures camera-based staff timing.
- NY §52-c is aimed at phone, email and internet monitoring, so a camera-analytics feature may fall outside its literal scope. Giving notice anyway is best practice.

**Colorado:** from 1 Jan 2027, only if the product (or customers) use outputs to make "consequential decisions" about consumers or employees. Anonymous operations dashboards are very unlikely to be in scope.

**NLRB:** federal labour-law risk is lower after the rescission. Monitoring that chills concerted activity (e.g. tracking employees gathering together) is still risky under existing Board law.

**California AB 1331:** cameras or analytics must never cover restrooms, changing or lactation areas. Configure zone masks by default.

### Gaps
- I could not verify:
  - the Texas CUBI photograph/video exclusion text;
  - Texas TRAIGA (Responsible AI Governance Act) effective date and scope;
  - Colorado's 2024 biometric amendment to the Colorado Privacy Act (HB24-1130), effective July 2025, which reportedly includes employee-biometric provisions.
- No US court decision found specifically on body tracking or gait re-identification under BIPA or CUBI.
- The CCPA definition of "biometric information", deidentified-data standards, service-provider contract terms and current revenue threshold were not re-verified this session.
- Status of NYC Int. 217-2024 is unknown.
- Other state comprehensive privacy laws (e.g. Virginia, Connecticut CTDPA, Oregon, Texas TDPSA) and their treatment of biometric "sensitive data" and employee carve-outs were not researched due to scope.

---

## 3. AUSTRALIA — Privacy Act/APPs, small business exemption, POLA Act 2024 (tort, ADM), OAIC Bunnings and Kmart, state workplace surveillance laws

### Takeaway
Australia's Privacy Act still has the small business exemption (under A$3M turnover). The Aug 2026 tranche 2 exposure draft did not remove it, so many single-site restaurants are outside the APPs, but larger chains and possibly the vendor are not. The decisive rules for camera analytics are the **state workplace surveillance acts**:
- **NSW:** at least 14 days' prior written notice, visible cameras and signs at each entrance;
- **ACT:** 14 days' notice plus consultation;
- **Victoria:** reform promised but not enacted.

The OAIC's Bunnings and Kmart actions show that face recognition is where regulators bite: specific signage, privacy-policy disclosure and less-intrusive alternatives are expected. A no-face-recognition, aggregate-only design is the "less intrusive alternative" those decisions describe.

### Cited Findings

**Privacy Act reform status**
- The small business exemption remains. The tranche 2 exposure draft (Privacy Amendment (Personal Data Protection) Bill 2026) was released on 31 Aug 2026, with consultation closing 18 Sept 2026. It does **not** remove the small business exemption or the employee-records exemption, and its commencement table is blank.
- Vendor claims that the exemption ends on 10 Dec 2026 confuse it with the ADM transparency start date. The government had earlier agreed in principle to removal.

— [CoterieLabs](https://coterielabs.com.au/field-notes/privacy-act-small-business-exemption-not-removed-2026); [BizTech Lawyers](https://www.biztechlawyers.com.au/legal-articles/australias-privacy-reform-shaping-the-future-of-data-protection); Ashurst "Australia's 2026 privacy reforms" (via search extract; page fetch blocked)

**Privacy and Other Legislation Amendment Act 2024**
- **Statutory tort:** the tort for serious invasions of privacy (Sch. 2) commenced on **10 June 2025**. It covers intrusion upon seclusion and misuse of information, requires intentional or reckless conduct, and applies to conduct after 10 June 2025. — [MinterEllison](https://www.minterellison.com/articles/privacy-and-other-legislation-amendment-act-2024-now-in-effect); [NatLawReview](https://natlawreview.com/article/new-serious-invasion-privacy-tort-australia-privacy-comes-effect); [L&E Global](https://leglobal.law/2025/05/22/australia-a-new-statutory-tort-for-privacy-invasion-and-disclosure-of-automated-decision-making-incoming-privacy-law-reforms-in-australia/)
- **ADM transparency:** new APP 1.7–1.9 commence **10 December 2026**. Privacy policies must disclose the kinds of personal information used, and the kinds of decisions made, where a computer program uses personal information to make (or substantially assist) decisions that could significantly affect individuals' rights or interests. — [LexisNexis AU](https://www.lexisnexis.com/blogs/en-au/insights/australias-bold-leap-into-a-new-era-of-privacy-law); [Warlows Legal](https://warlowslegal.com.au/is-your-start-up-ready-for-privacy-act-amendments/)

**Bunnings**
- The OAIC's Oct 2024 determination found Bunnings' face recognition breached the APPs.
- The Administrative Review Tribunal partly overturned it in *Bunnings Group Ltd v Privacy Commissioner* [2026] ARTA 130 (Feb 2026). It set aside the APP 3.3 sensitive-information breach, accepting the APP 3.4 "permitted general situation" exception given retail crime and threats to staff and customers.
- It **upheld breaches of APP 1.2, 1.3 and 5.1**: signage saying face recognition "may" be used did not adequately inform people, and the privacy policy did not mention the technology.
- Appeal status by the Commissioner is unclear.

— [BiometricUpdate (Feb 2026)](https://www.biometricupdate.com/202602/partial-tribunal-victory-allows-bunnings-to-keep-facial-recognition-system); [Gilbert + Tobin](https://www.gtlaw.com.au/insights/administrative-review-tribunal-upholds-bunnings-use-of-facial-recognition-technology); [NatLawReview](https://natlawreview.com/article/mixed-blessings-decision-appeal-bunnings-against-privacy-commissioners); [Kennedys](https://www.kennedyslaw.com/en/thought-leadership/article/2026/facial-recognition-and-privacy-law-in-australia-lessons-from-the-bunnings-decision/); [ABC News](https://www.abc.net.au/news/2026-02-05/bunnings-wins-ai-facial-recognition-tech-fight/106309308)

**Kmart**
- *Commissioner Initiated Investigation into Kmart Australia Limited* [2025] AICmr 155 (26 Aug 2025; publicised Sept 2025). Face recognition ran in 28 stores from June 2020 to July 2022 to combat refund fraud.
- Images were collected without notice or consent. The tool was of "limited utility", and less privacy-intrusive alternatives existed.
- Kmart was ordered to stop and publish an apology. ART review is reportedly pending.

— [OAIC determination PDF](https://www.oaic.gov.au/__data/assets/pdf_file/0029/256583/Commissioner-Initiated-Investigation-into-Kmart-Australia-Limited-Privacy-2025-AICmr-155-26-August-2025.pdf); [Clayton Utz](https://www.claytonutz.com/insights/2025/november/from-cameras-to-compliance-oaics-kmart-determination-highlights-facial-recognition-technology-privacy-risks); [Bird & Bird](https://cm.twobirds.com/en/insights/2025/australia/oaic-determines-kmart-breached-the-privacy-act-1988-(cth)-over-use-of-facial-recognition-technology)
- The OAIC published updated guidance on face recognition in retail. — [OAIC media release](https://www.oaic.gov.au/news/media-centre/privacy-commissioner-publishes-updated-guidance-on-facial-recognition-in-retail-spaces)

**OAIC data analytics guidance**
- Collect only what is reasonably necessary. Analytics can **create** new personal information ("collection via creation"), which then attracts APP obligations. — [OAIC Guide to data analytics and the APPs](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/more-guidance/guide-to-data-analytics-and-the-australian-privacy-principles)
- Vendor sites claim anonymous counts with no stored video are outside the Privacy Act. These are marketing claims with no OAIC citation. — [footfall.au](https://footfall.au/gdpr-compliant-people-counters-the-2026-guide-to-privacy-first-analytics/); [bitoculus](https://www.bitoculus.com/blog/are-people-counting-cameras-legal-privacy-guide)

**Cross-border disclosure (APP 8)**
- APP 8 and s.16C create a cross-border framework. The OAIC APP Guidelines ch. 8 were updated 3 Oct 2025. Under s.16C the disclosing entity stays accountable for an overseas recipient's breaches.
- The OAIC treats storage-only cloud arrangements, with contractual protections and no provider access, as a "use" rather than a "disclosure". — [OAIC APP Guidelines ch. 8](https://www.oaic.gov.au/privacy/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information/); [Public Accountant](https://publicaccountant.com.au/features/do-the-privacy-reforms-rain-on-the-cloud-computing-parade/)

**State workplace surveillance laws**
- **NSW Workplace Surveillance Act 2005, s.10:**
  - surveillance must not commence without prior written notice to employees, at least 14 days before it starts (an employee may agree to less);
  - for camera surveillance, cameras must be clearly visible and signs must be visible at each entrance to the workplace.

  — [WSA s.10 (AustLII)](https://classic.austlii.edu.au/au/legis/nsw/consol_act/wsa2005245/s10.html); [Sprintlaw](https://sprintlaw.com.au/articles/workplace-surveillance-act-2005-nsw-explained/)
- **ACT Workplace Privacy Act 2011, s.13:**
  - 14 days' written notice before optical, tracking or data surveillance (shorter if the worker agrees, or for new starters where surveillance already exists);
  - a 14-day consultation obligation, with consideration of worker concerns;
  - covert surveillance needs a Magistrates Court authority;
  - a written policy given to workers can satisfy notice.

  — [Mondaq – ACT Workplace Privacy Act](https://www.mondaq.com/australia/employee-rights-labour-relations/137436/workplace-privacy-act-2011-act); [ACT Legislation Register](https://www.legislation.act.gov.au/DownloadFile/a/2011-4/current/PDF/2011-4.PDF)
- **Victoria:**
  - The Parliamentary Inquiry into workplace surveillance tabled its final report on 13 May 2025, with 18 recommendations.
  - The Government response of 18 Nov 2025 gave in-principle support to 15 of them.
  - On 20 July 2026 the Government pledged "the toughest workplace surveillance laws in the country" if re-elected in Nov 2026.
  - No bill has been enacted. Victoria currently has no blanket CCTV-notice requirement; the inquiry recommended one.

  — [Parliament of Victoria – reports](https://www.parliament.vic.gov.au/get-involved/inquiries/inquiryintoworkplacesurveillance/reports); [Corrs](https://www.corrs.com.au/insights/victorian-government-backs-landmark-workplace-surveillance-reforms); [Landers & Rogers](https://landers.com.au/legal-insights-news/vic-government-foreshadows-tougher-workplace-surveillance-laws); [ABCO Security](https://abcosecurity.com.au/workplace-surveillance-laws-victoria/)

### Inferences

**Personal information?**
- Under the "reasonably identifiable" test, live frames processed at the edge are likely personal information in the restaurant's hands, for an APP entity.
- Anonymous, aggregated table or zone events are likely not.
- Per-staff metrics are personal information. Note that for the employer, staff data may fall in the **employee records exemption**, which tranche 2 also keeps. The vendor is not the employer, so that exemption would not cover the vendor's own handling [background — not verified].

**Sensitive information:** biometric templates and biometric information used for automated biometric verification or identification are "sensitive information" requiring consent (APP 3.3) [background — s.6(1) definition, not re-verified]. A no-template, no-re-identification design stays outside this. Bunnings and Kmart turned on face templates.

**Small-business exemption nuances:** businesses under A$3M that trade in personal information, or are contracted service providers to the Commonwealth, are not exempt [background — not verified]. Selling only anonymous aggregates should not be "trading in personal information". Removal of the exemption remains a live future risk with no timetable.

**Bunnings lesson for signage:** be specific, not "may", and mention the analytics in the restaurant's privacy policy and collection notice (APP 5).

**Kmart lesson:** document proportionality and that less-intrusive alternatives (anonymous counting) were chosen. That is exactly this product's pitch.

**Statutory tort:** low risk for anonymous counting. Higher risk for covert monitoring of staff in private areas (staff rooms, toilets), which must be excluded.

**ADM from 10 Dec 2026:** only bites if outputs feed decisions significantly affecting individuals (e.g. automated staff discipline or rostering). Keep a human in the loop. If a customer uses staff metrics in decisions, its privacy policy must say so.

**NSW and ACT practical rule:** before switching on analytics that monitor staff, even if only to time responses, the restaurant should give employees **14 days' written notice** describing:
- the kind of surveillance (camera plus AI analytics);
- how it is carried out;
- the start date;
- whether it is continuous or intermittent;
- whether it is for a limited period or ongoing.

Also check that camera signs at entrances are in place. In the ACT, add consultation. A vendor-supplied notice template is a strong onboarding feature.

**Data residency:** no data-localisation mandate for private-sector analytics was found. APP 8 and s.16C accountability apply only if personal information is disclosed overseas. Anonymous aggregates are outside it. Hosting in an AU region removes the question entirely for any account or staff personal information.

### Gaps
- The OAIC's "What is personal information" guidance on video and images was not retrieved, and no OAIC guidance specifically on people-counting or video analytics was found.
- Exact NSW s.11 camera-signage text and s.18 restrictions on use of surveillance records were not verified beyond secondary sources.
- Whether a Victorian bill will be introduced after the Nov 2026 state election is unknown.
- Whether the Commissioner appealed the Bunnings ART decision, and the status of Kmart's ART review, are unclear.
- Other state laws were not researched in detail: SA, WA and Qld surveillance devices acts, and Victoria's Surveillance Devices Act 1999 ban on surveillance in toilets and change rooms.

---

## 4. CROSS-CUTTING — Where "anonymous" ends; privacy-by-design for vision analytics; vendor/controller contracts; data residency

### Takeaway
Across all three countries, the legal line is **identifiability** (Israel and Australia) or **use to identify** (US biometric laws).
- Raw frames on the edge are personal data under Israeli and Australian law (and CCPA where applicable) while they exist.
- Aggregate, unlinkable counts and events are not.
- Short-lived in-memory track IDs are a grey zone that stays low-risk if they are never persisted, never linked across cameras or visits, and never tied to faces or gait.
- Per-employee metrics are personal data everywhere.

The product's architecture (edge-only, no retention, no face recognition, aggregates only) is exactly what regulators point to as the "less intrusive alternative". The remaining compliance work is mainly notices, signage, staff-monitoring rules and contracts.

### Cited Findings
- **Israel:** personal data is anything about an identified or identifiable person, judged by reasonable effort, including biometric, location and online identifiers. — [Baker McKenzie](https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/emea/israel/topics/key-definitions)
- **Israel:** the PPA's draft AI guidance says any AI system processing personal data at any lifecycle stage is subject to the PPL, and recommends privacy-by-design and DPIAs. — [Pearl Cohen](https://www.pearlcohen.com/israel-new-draft-guidelines-on-the-application-of-privacy-law-to-ai/); [EBN Law](https://www.ebnlaw.co.il/media-center/draft-guidance-from-the-israeli-privacy-protection-authority/)
- **US:** BIPA covers only data capable of identifying a person (*Zellmer*). NYC covers characteristics used "to identify, or assist in identifying", and exempts video not analysed by identifying software. Washington excludes data generated from video. — [Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/ninth-circuit-holds-face-signatures-used-for-photo-tag-suggestions-are-not-biometric-information); [intro.nyc Int. 1170-A](https://intro.nyc/1170-2018); [RCW 19.375](https://app.leg.wa.gov/RCW/default.aspx?cite=19.375&full=true)
- **US:** CCPA risk assessments apply to "systematic observation", including live-streamed video, used to infer employee performance, behaviour or movement. — [FPF](https://fpf.org/wp-content/uploads/2025/10/FPF_CCPA-Regulations-Issue-Brief.pdf)
- **Australia:** analytics can "create" personal information. Collect only what is reasonably necessary. — [OAIC data analytics guide](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/more-guidance/guide-to-data-analytics-and-the-australian-privacy-principles)
- **Australia:** Kmart's face recognition was disproportionate partly because less privacy-intrusive alternatives existed. Bunnings breached APP 1 and APP 5 through vague "may use" signage and a privacy policy that omitted face recognition. — [Clayton Utz](https://www.claytonutz.com/insights/2025/november/from-cameras-to-compliance-oaics-kmart-determination-highlights-facial-recognition-technology-privacy-risks); [Kennedys](https://www.kennedyslaw.com/en/thought-leadership/article/2026/facial-recognition-and-privacy-law-in-australia-lessons-from-the-bunnings-decision/)
- **EU reference (not in scope, persuasive only):** the EDPB Video Guidelines 3/2019 are cited as treating anonymous people counting as generally outside special-category (biometric) processing. This is a secondary citation via a vendor. — [Fora Soft](https://www.forasoft.com/learn/video-surveillance/articles-vms/retail-analytics-people-counting-heatmaps)
- **Cross-border, Israel:** contractual undertakings with foreign holders are required, and the PPA tells companies to review SaaS agreements. — [Gornitzky](https://www.gornitzky.com/cross-border-data-transfer-agreements-the-position-of-the-israeli-privacy-protection-authority/)
- **Cross-border, Australia:** APP 8 and s.16C accountability; storage-only cloud may be a "use", not a disclosure. — [OAIC ch. 8](https://www.oaic.gov.au/privacy/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information/)

### Inferences

**A. "Anonymous" vs "personal" vs "biometric": a practical classification for this product**

| Data element | Israel (PPL/Am.13) | US (BIPA/CUBI/NYC/CCPA) | Australia (Privacy Act) | Risk |
|---|---|---|---|---|
| Raw camera frames in edge RAM | Personal data (identifiable); restaurant = controller, vendor = holder | CCPA "personal information" if business is covered; not "biometric" unless identifying features are extracted | Personal information for APP entities | Medium; mitigate with no retention, no egress |
| Bounding boxes, pose keypoints per frame | Likely personal data while linked to frame | Not biometric if non-identifying (*Zellmer*) | Likely PI while linked to frame | Low–medium |
| In-memory track ID (seconds–minutes, single camera) | Grey; pseudonymous at most, not stored | Not biometric | Grey; not reasonably identifiable once frame discarded | Low if never persisted |
| Appearance/re-ID embedding, gait vector, cross-camera or cross-visit matching | Approaches "biometric identifier" / special sensitivity | Risk of "biometric identifier" / "any other identifying feature" (NYC), BIPA claims | Approaches "biometric information/template" (sensitive) | **High — avoid or keep RAM-only, per-camera, reset frequently** |
| Face crops, face embeddings, face recognition | Biometric, special sensitivity | BIPA/CUBI/NYC triggers; **Portland ban** | Sensitive (Bunnings/Kmart) | **Prohibited by design** |
| Aggregate counts, occupancy, table wait time events | Not personal data | Not PI if deidentified/aggregate | Not PI | Very low |
| Per-employee response times / leaderboards | Personal data + workplace monitoring (5/2017, *Isakov*) | Employee monitoring notice (CT/NY/DE); CCPA risk assessment ("systematic observation"); ADMT if used in significant decisions (2027) | PI (employee records exemption for employer only); NSW/ACT 14-day notice | **High — offer table/zone-level by default; staff-level only opt-in with notices** |

**B. Privacy-by-design controls**

These map to the PPA AI draft (privacy-by-design, DPIA), the OAIC's minimisation and less-intrusive-alternative reasoning, *Zellmer* (non-identifiability), and the NYC exemption.
1. Edge-only inference. Frames are never written to disk and never leave the device. Document this, and make it verifiable (no recording code path, read-only stream credentials).
2. No face detection beyond the person class; no face crops; no face or gait embeddings; no re-ID across cameras or days. If cross-camera hand-off is needed, use geometry or time-based association, not appearance.
3. Ephemeral track IDs: random, RAM-only, reset at least daily (ideally per camera per session), never exported.
4. Only aggregated or event-level outputs go to the cloud. Enforce k-anonymity-style thresholds on small counts (e.g. don't emit events that single out one diner, such as "the only person at table 7" in a near-empty venue).
5. Privacy zone masks on by default: restrooms, staff rooms, changing areas, kitchen workstations if not needed. AB 1331 bathroom ban, Israeli 5/2017 and the AU tort make these hard no's.
6. No audio (Israel Wiretap Law; AU listening-device laws; US wiretap laws).
7. Staff features off by default. When enabled, report at team or shift level first. Individual attribution needs explicit customer configuration, plus employee notice in-app or in the policy pack, and a contractual promise not to use outputs as the sole basis for discipline.
8. Write a "non-identifiability declaration" and model card, keeping evidence for *Zellmer*-style defences and DPIAs.
9. Security: device hardening, encrypted transport, tenant isolation in the multi-tenant cloud, and a breach-response plan meeting Israel's "immediate" notification standard.

**C. Vendor (processor/holder/service provider) vs restaurant (controller) contracts**
- Use one global DPA with country riders:
  - **Israel:** holder obligations; a security-regulation-compliant outsourcing clause; cross-border transfer undertaking if hosting outside Israel.
  - **US:** CCPA service-provider terms (purpose limitation, no sale or sharing, no combining across clients) [background — verify]; NYC biometric profit ban, which bars selling or sharing biometric data.
  - **Australia:** APP-compliant handling, APP 8 and s.16C allocation, assistance with notifiable data breaches.
- Contract the restaurant to own: camera signage, the customer privacy notice, the employee monitoring notice (NSW and ACT 14 days; CT, NY and DE notice), DPIA or risk assessment where required, and union or works-council consultation.
- The vendor supplies templates.
- Multi-tenant: no cross-customer benchmarking unless the data is aggregated and anonymised. State this right explicitly in the DPA.

**D. Data residency**
- No hard localisation requirement was found for private-sector anonymous metrics in any of the three countries.
- Israel's transfer regulations and Australia's APP 8 only bite for personal data. Expected personal data: user accounts, staff names if staff features are used.
- Practical option: regional hosting (IL or EU for Israel; AU region for Australia; US region for US), or at minimum contractual transfer safeguards.

**E. Compliance map summary (what to do per country)**
- **Israel:**
  - updated camera signage mentioning analytics;
  - update the privacy notice and workplace camera policy;
  - DPIA-style assessment;
  - employee notice and policy, and avoid per-employee output metrics from security cameras (5/2017);
  - holder agreement and security measures;
  - transfer basis;
  - consider an external DPO given the "systematic monitoring" limb.
- **USA:**
  - no face recognition anywhere (Portland ban; BIPA/CUBI/NYC triggers);
  - NYC voluntary or required sign;
  - employee-monitoring notices in CT, NY and DE;
  - CCPA risk assessment for covered businesses if staff performance is inferred from video (new processing: before start; existing: by 31 Dec 2027);
  - watch CCPA ADMT and Colorado SB 26-189 (both 1 Jan 2027) if outputs drive employment decisions;
  - California AB 1331 (1 Jan 2027): no bathroom or similar areas.
- **Australia:**
  - NSW and ACT 14-day written notice and entrance signs (ACT consultation);
  - APP 1 and APP 5 notice and privacy-policy update for APP entities (be specific, not "may");
  - APP 1.7–1.9 ADM disclosure from 10 Dec 2026 if outputs drive significant decisions;
  - monitor tranche 2 and the Victorian reforms;
  - AU hosting or APP 8 safeguards.

### Gaps
- No regulator in any of the three jurisdictions was found to have issued guidance specifically classifying edge-only, non-retained people tracking as outside privacy law. The classification table above is an inference from definitions and analogous decisions.
- No case law was found on whether short-lived in-memory tracking IDs are personal information, or on body, gait or appearance re-identification under BIPA, CUBI or NYC law.
- CCPA deidentification standards, CCPA service-provider contract requirements, Australia's s.6(1) biometric "sensitive information" definition, and the small-business-exemption exceptions are background knowledge not re-verified this session.
- Primary statute texts could not be fetched in this environment, which blocked fetches from several hosts. All findings rest on search extracts of law-firm, regulator and legislature pages. Confirm with local counsel in each country before launch.

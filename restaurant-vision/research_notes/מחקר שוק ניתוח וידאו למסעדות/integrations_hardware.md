# Integration Ecosystem & Edge Hardware Map for Restaurant Camera Analytics (USA + Australia; camera/edge facts global incl. Israel)

> Research date: 2026-11-06. Method note: Web search hit the shared session budget partway through, and direct page fetching was blocked for several vendor domains (doc.toasttab.com, docs.frigate.video, ultralytics.com). To make up for this, benchmark and license facts were pulled straight from the **primary GitHub repositories** (Hailo Model Zoo, Rockchip rknn_model_zoo, Frigate docs, and the LICENSE files of each OSS project) at their latest commits (Oct–Nov 2026). Everything else comes from search-result summaries of the cited pages. Treat vendor and aggregator claims as such; this is flagged inline.

---

## 1. POS systems: market share, APIs/partner programs, cost, data, webhooks (US full-service + Australia)

### Takeaway
In US full-service dining, **Toast is the clear #1 integration target**: it has a formal partner program and an **orders webhook that pushes the full order JSON on every change**. That makes "check opened / check closed / table / guests" signals achievable in near real time. Square and Clover are self-serve but weak for dine-in open checks. Oracle Simphony and NCR Aloha are partner-gated enterprise programs, best reached through middleware (Olo's Omnivore). In Australia there is no reliable share data. **Doshii (middleware) plus Lightspeed K-Series** is the most efficient first step. SwiftPOS, Impos, H&L and Abacus need one-off vendor conversations.

### Cited Findings

**US market share (all figures are secondary estimates; sources disagree widely)**
- Toast's estimated share of full-service restaurants ranges from ~23% to ~35% across sources. 6sense puts Toast at 23.33% of POS users with 155,000+ locations (2025). One vendor guide claims ~35% of full-service with no stated method. — [6sense Toast market share](https://6sense.com/tech/point-of-sale-pos/toast-pos-market-share); [Dashmote Restaurant POS Market Share 2026](https://dashmote.com/restaurant-technology/pos); [Hyperresearch Toast vs Square vs Clover 2026](https://hyperresearch.ai/samples/restaurant-pos-competitor-analysis)
- Square has ~27–28% of the *overall* POS market (all verticals). One estimate puts Square at only ~8–10% of pure full-service. — [6sense](https://6sense.com/tech/pos-systems/toast-market-share); [Jamie's Substack: Square vs Toast](https://torovictorioso.substack.com/p/square-vs-toast)
- Clover has ~5–7% of the overall POS market and ~9.7–11% of restaurants in directory-listing data. Operators report it lags Toast for full-service tableside and coursing. — [Dashmote](https://dashmote.com/restaurant-technology/pos); [OrderPin ISO platform guide 2026](https://www.orderpin.co/clover-vs-square-vs-toast-vs-lightspeed-the-iso-complete-platform-guide-2026/)
- Caveat from the search synthesis: full-service-specific figures come from vendor blogs and third-party panels. Toast's SEC filings plus a paid dataset are needed for a defensible number. — [Hostmerchantservices POS market share review (2024)](https://hostmerchantservices.com/articles/point-of-sale-market-share/)

**Toast (US #1 target)**
- API access is granted only through the **Toast Partner Integrations program**, which includes a formal application and certification process. — [Toast API overview](https://doc.toasttab.com/doc/devguide/apiOverview.html); [Toast Partner integration overview](https://doc.toasttab.com/doc/devguide/apiPartnerIntegrationOverview.html)
- A restaurant connects a partner from Integrations › Integration management › Browse & purchase integrations. Toast APIs (orders, labor) can take up to **15 minutes** to update their access lists after connection. — [Toast platform guide: integrations](https://doc.toasttab.com/doc/platformguide/adminRestaurantServiceIntegrationsAndToastPartnerIntegrations.html)
- Fees for restaurants: some integrations are free without a Toast Partner Connect subscription, others carry an extra fee, and partner integration pricing varies by partner. — [Toast platform guide](https://doc.toasttab.com/doc/platformguide/adminRestaurantServiceIntegrationsAndToastPartnerConnect.html); [Toast Central help article](https://intercom.help/toast-central/en/articles/14728223-add-or-remove-an-integration-with-toast-partner-integrations)
- One integrator (Dolce) says most integrations require a **$25/month per location** Toast Partner Connect subscription (vendor claim; verify with Toast). — [Dolce Software: Toast Partner Connect](https://dolcesoftware.knowledgeowl.com/help/setting-up-toast-integration-with-dolce)
- **Orders webhook:** it fires on any order update *or* new order (same event type) and delivers the **complete Order JSON** in the `details` field. The Check object includes payments, discounts, service charges and selections. Guest PII and delivery details are stripped and must be fetched via `GET /orders/v2/orders/{guid}`. Payloads can exceed **600 KB**. Toast recommends the webhook over polling `/ordersBulk`. — [Toast Orders webhook reference](https://dev.toasttab.com/doc/devguide/devOrdersWebhookRef.html); [Toast API announcement: new orders updated webhook](https://toast-api.launchnotes.io/announcements/new-orders-updated-webhook)
- The `itemType` field was removed from the orders webhook effective 2025-05-26 (an example of schema churn to monitor). — [Toast API update announcements](https://doc.toasttab.com/doc/relnotes/apiReleaseNotesChangeDeployments.html)
- Third-party descriptions (unofficial) list outbound partner webhooks for gift cards, loyalty and tender. An unofficial blog cites a $99–299/month "stream proxy" path; treat as unverified. — [API Evangelist: Toast](https://providers.apievangelist.com/providers/toast/); [Hostie AI Toast playbook](https://hostie.ai/resources/integrating-hostie-ai-toast-pos-2025-3-path-playbook)

**Square**
- `order.updated` (still marked Beta) fires on API UpdateOrder calls, Order Manager or Dashboard. — [Square order.updated webhook reference](https://developer.squareup.com/reference/square/orders-api/webhooks/order.updated)
- **Open tickets taken in the Square POS app do not trigger order webhooks.** Only API-created orders or fully paid POS orders are available. Developers are told to use payment webhooks (which fire only at payment) or poll Order Search. Forum threads may be dated, and one Square reply conflicts on whether unpaid orders exist. — [Square forum 6626](https://developer.squareup.com/forums/t/real-time-order-confirmation-using-webhooks/6626); [Square forum 11681](https://developer.squareup.com/forums/t/subscribed-to-order-created-event-but-notifications-are-only-for-square-online-orders-not-including-the-forhere-orders/11681); [Square forum 5783](https://developer.squareup.com/forums/t/a-list-of-webhook-events-trigered-by-pos/5783.md)

**Clover (Fiserv)**
- Public REST API covering merchants, orders, payments, inventory, customers and employees. Webhooks notify on order create/update but carry **only order IDs**, so a follow-up fetch is needed. Webhooks require creating a Clover app. **Rate limits are per app**, shared across all merchants. — [Clover docs](https://docs.clover.com/); [Rollout: Clover API essentials](https://rollout.com/integration-guides/clover/api-essentials)
- OAuth web integrations are self-serve, but App Market publishing goes through an approval workflow. Revenue-share terms were not found. — [Supergood API report card: Clover](https://supergood.ai/api-report-card/clover); [Clover community question on revenue share](https://community.clover.com/answers/39447/view.html)

**Oracle MICROS Simphony**
- Path: enroll in the **Oracle PartnerNetwork (OPN)** (Cloud Build track optional), then submit a Simphony Integrations Program inquiry to the ISV partner team. The request form asks for a 13-digit OPN Company ID and lists **STSG2 (Simphony Transaction Services Gen2)** among integration methods. — [Oracle: Integrate with Simphony POS](https://www.oracle.com/food-beverage/restaurant-pos-systems/pos-integrations/partners/); [Oracle Next-Gen Simphony APIs](https://www.oracle.com/food-beverage/restaurant-pos-systems/pos-integrations/next-gen-api-for-restaurant-pos/); [STS Gen2 authentication docs](https://docs.oracle.com/en/industries/food-beverage/simphony/omsstsg2api/authenticate.html)
- Access is partner-gated with no self-serve sandbox (third-party report). No OPN or STSG2 pricing was found. — [Supergood: Oracle Simphony](https://supergood.ai/api-report-card/oracle-simphony)

**NCR Voyix Aloha**
- Developer portal at developer.ncrvoyix.com. Apps get OAuth2 client credentials; API host is api.ncrvoyix.com. — [Nexla Aloha connector guide](https://docs.nexla.com/user-guides/connectors/aloha_pos_feeds)
- Per Supergood (a vendor that sells alternative access, so not neutral): ~28 documented APIs with a sandbox (orders, menu, payments, labor) for Aloha Cloud. Access requires **NCR Partner Program approval, per-integration certification and per-location fees**. On-prem Aloha Essentials sites use **Aloha Connect / SQL exports**, not a modern API. Docs are fragmented across three portals. — [Supergood: NCR Aloha](https://supergood.ai/api-report-card/ncr-aloha)
- An alternative path is to have the NCR Voyix account manager enable API access per site. Many third parties route through middleware (Omnivore, Olo, ItsaCheckmate, Chowly). — [Leat: NCR Aloha integration](https://www.leat.com/integrations/ncr-aloha); [Supergood](https://supergood.ai/api-report-card/aloha-pos)

**Middleware: Omnivore (Olo)**
- Olo closed its acquisition of Omnivore on **March 4, 2022** for ~$49.3M cash. — [Olo 10-K FY2022 (SEC)](https://www.sec.gov/Archives/edgar/data/1431695/000143169523000011/olo-20221231.htm)
- Olo's Omnivore API lists 12 supported POS systems, including **NCR Aloha, PAR Brink, Micros Simphony, Micros 3700, POSitouch and Dinerware**. It is positioned as a way to avoid building direct POS integrations. — [Olo Omnivore API](https://www.olo.com/omnivoreapi)

**SpotOn**
- No open API. SpotOn integrates only with "handpicked" partners via an intake form for Preferred Integration Partners, with no guarantee of a partnership. Its developer site documents **Centralized APIs (CAP)** for SpotOn Express and legacy SpotOn Restaurant (RPOS), covering online ordering, reporting, loyalty and webhooks (menu updates). — [SpotOn integrations](https://spoton.com/integrations); [SpotOn developers: Central API](https://developers.spoton.com/central-api/docs)
- API Evangelist lists a location-centric **Restaurant POS Export API** for close-to-real-time export. Supergood says official access carries add-on fees (vendor claim). — [API Evangelist: SpotOn](https://providers.apievangelist.com/providers/spoton/); [Supergood: SpotOn API](https://supergood.ai/docs/spoton-api)

**PAR Brink, TouchBistro, Revel**
- PAR Brink runs a partner integration ecosystem (2020 press releases with Open Dining, SpeedETab and eTouchMenu). No API docs or terms were found. — [BusinessWire: PAR + eTouchMenu (2020)](https://www.businesswire.com/news/home/20200309005156/en/PAR-Technology-Announces-New-API-Integration-with-eTouchMenu-and-Brink-POS-Software)
- Brink is reachable via Omnivore (see above). — [Olo Omnivore API](https://www.olo.com/omnivoreapi)

**Lightspeed (Restaurant K-Series), relevant in both US and AU**
- Lightspeed is used by 7,000+ restaurants across AU/NZ (review-site claim). — [mobiletransaction.org AU restaurant POS](https://mobiletransaction.org/au/pos-for-restaurants-cafes-australia)
- K-Series API: third-party tooling describes webhook subscriptions for **order, payment and staff events**. Lightspeed does not publish a maintained OpenAPI spec. Storekit's integration syncs **areas and tables** (floor plan) from Lightspeed. Supergood says the K-Series API is "in continuous development and subject to change." — [Jentic: Lightspeed API](https://jentic.com/apis/lightspeed.app/lightspeed); [Storekit: Lightspeed K-Series](https://storekit.com/docs/guides/integrations/pos/lightspeed-k-series); [Supergood: Lightspeed Restaurant API](https://supergood.ai/docs/lightspeed-restaurant-api)
- OpenTable ↔ Lightspeed: seating a guest transfers their details and can auto-open a check (waitlist not supported). — [Lightspeed K-Series support](https://k-series-support.lightspeedhq.com/hc/articles/4415755433627)

**Australia**
- No reliable hospitality POS market-share data was found. A TechSci press release names Lightspeed, Square and Impos as key players but gives no breakdown. — [TechSci Australia POS market](https://www.techsciresearch.com/news/10185-australia-pos-market.html)
- **Impos:** founded 2006 and claims 3,000+ Australian venues (vendor). It appears in the me&u partner directory (AU/NZ). — [Impos about](https://impos.com.au/about); [me&u: Impos partner](https://www.meandu.com/integrations/impos-partner)
- **SwiftPOS:** describes itself as API-driven and integrated with "hundreds" of third parties. It targets large venues (pubs, clubs, entertainment). — [SwiftPOS](https://www.swiftpos.com.au/?p=1121); [API Tracker: SwiftPOS](https://apitracker.io/a/swiftpos-au/integrations); [posapt.au hospitality POS 2026](https://posapt.au/blogs/8-best-hospitality-pos-systems-australia)
- **H&L:** founded 1987, a "complete suite of integrated hospitality POS". No API information was found. — [Capterra AU: H&L](https://www.capterra.com.au/software/196445/h-l)
- **Abacus:** an all-in-one hospitality POS (POS, loyalty, delivery, kiosk, web ordering). — [Capterra AU: Abacus](https://www.capterra.com.au/software/151561/abacus)
- **Doshii (middleware):** claims its API makes it simple to integrate with the POS systems of **50,000+ Australian venues** (vendor; an older Deliveroo release said 6,500). It partners with "high-growth hospo-tech solutions primarily focused on the Australian market." — [Doshii: Partner with Doshii](https://doshii.com/en-au/partner-with-doshii); [Food Magazine: Deliveroo–Doshii](https://www.foodmag.com.au/deliveroo-partners-with-tech-startup-doshii-to-improve-ordering-process/)
- Doshii added **Abacus, Splitability and MSL (covering SwiftPOS and Infogenesis)** as POS partners in April 2021 (dated). — [ChannelLife: Doshii signs POS partners](https://channellife.com.au/story/doshii-signs-pos-partners-empowers-aus-hospitality-scene)
- Doshii signed a global agreement with Omnivore giving Doshii-connected apps reach to Omnivore POS systems (Micros, Aloha). — [PRWeb: Doshii & Omnivore](https://www.prweb.com/releases/Doshii_and_Omnivore_Integration_Opens_Global_Opportunities_for_Apps_and_POS_in_Hospitality/prweb16270523.htm)
- Doshii is also used for Idealpos ↔ OpenTable table-status sync. — [Doshii support: OpenTable with Idealpos](https://support.doshii.com/integrating-opentable-with-idealpos)

### Inferences
- **Recommended POS integration order:**
  - **US:** (1) Toast; (2) Olo/Omnivore for Aloha, Simphony and Brink in one contract; (3) Clover; (4) Square (dine-in signal is weak); (5) SpotOn by application.
  - **AU:** (1) Doshii; (2) Lightspeed K-Series direct; (3) SwiftPOS and Impos via vendor partnership.
- **Difficulty (inferred from access model):**
  - Toast: medium (application + certification; webhooks are excellent).
  - Clover: easy-to-medium (self-serve; ID-only webhooks; per-app rate limits).
  - Square: easy access but **poor fit** for dine-in open checks.
  - Lightspeed K: medium.
  - Doshii: medium (partner approval, AU focus).
  - Simphony and Aloha: hard (OPN/NCR partner programs, per-site enablement, on-prem variants) → use middleware.
  - SpotOn: hard/selective.
- **Data needed for analytics:** check opened/closed time, table ID, guest count (covers) and server ID. Toast's full-order webhook makes these the most likely to be available in real time. From prior knowledge of Toast's Order schema (fields like `numberOfGuests`, `table`, `server`, `openedDate`, `closedDate`), these exist, but this **was not verified this session** (see Gaps).
- **The POS integration is a "nice to have" enrichment, not a dependency.** Camera-only metrics (occupancy, seat time, turnover) work without the POS. POS data mainly adds ground-truth labels (check close ≈ table turn) and server attribution. An MVP can ship without any POS integration, then add Toast first.
- A key product risk: POS table numbers must be **mapped to camera-defined table polygons**. The Doshii/Idealpos note that "table names must match exactly" ([Doshii support](https://support.doshii.com/integrating-opentable-with-idealpos)) suggests this mapping UX is a known pain point across integrations.

### Gaps
- Not verified this session (doc.toasttab.com blocked, search budget exhausted): the exact Toast Order/Check fields (`numberOfGuests`, `table`, `server`, `closedDate`) and Toast's partner fees charged to *partners* (vs restaurants).
- Square: whether the Order object carries a guest count for Square for Restaurants open checks, and whether 2025–2026 changes now expose open tickets via API.
- No primary information was found on: TouchBistro and Revel partner APIs; H&L, Impos, Abacus and SwiftPOS developer docs or pricing; Oracle OPN fees; NCR per-location fees; Clover revenue share.
- No reliable AU POS market-share data exists in public sources. The current Doshii POS partner list was not retrieved (2021 list only).
- Kounta was acquired by Lightspeed and rebranded (prior knowledge, not verified this session). Its current API status under Lightspeed is unknown.

---

## 2. Reservation / waitlist platforms (US: OpenTable, Resy, SevenRooms, Yelp Guest Manager, Tock; AU: NowBookIt, OpenTable AU, SevenRooms, Quandoo)

### Takeaway
Almost all reservation platforms are **partner-gated with no self-serve keys**. The notable exception is **NowBookIt (AU)**, which publishes API docs, supports webhooks and charges venues a small monthly integration fee. Reservation data is useful for "expected covers" and waitlist context, but the camera system's own queue and wait metrics don't need it. This is a phase-2 integration.

### Cited Findings
- **OpenTable:** the API program is gated with no self-serve. Per a third-party report, the Affiliate API needs ~3–4 weeks of approval, and Partner APIs sync reservations and guest profiles for approved POS/CRM vendors (unverified against OpenTable's own materials). — [Supergood: OpenTable](https://supergood.ai/api-report-card/opentable)
- OpenTable ↔ POS seated-status examples: with NCR Aloha, a seated guest updates the POS and closing the check updates table availability. With Atlas POS, seating opens a cart on the matching table within seconds. With Idealpos via Doshii, a seated reservation sets the table to a seated state, and table names must match exactly. — [OpenTable restaurant solutions](https://www.opentable.com/restaurant-solutions/?p=166126); [Atlas Kitchen: OpenTable](https://help.atlas.kitchen/integrations/opentable.md); [Doshii support](https://support.doshii.com/integrating-opentable-with-idealpos)
- OpenTable has an Australian restaurant-solutions site (opentable.com.au), so the same product is sold in AU. — [OpenTable AU restaurant solutions](https://www.opentable.com.au/restaurant-solutions/?p=87776)
- **SevenRooms:** documented API at api-docs.sevenrooms.com but **no self-serve key**. Access goes through support for authorized accounts. Outbound webhooks exist for reservation and client events (per a competitor's blog). Unified.to lists a SevenRooms connector in **Beta**. — [Carly blog: SevenRooms](https://www.usecarly.com/blog/sevenrooms-ai/); [Unified.to: SevenRooms](https://unified.to/integrations/sevenrooms)
- **Resy:** no documented public API. Keys go only to approved POS/CRM/loyalty/discovery partners. Resy's integrations page lists partners such as Fishbowl and NCR Aloha. — [Supergood: Resy](https://supergood.ai/api-report-card/resy); [Resy integrations](https://resy.com/resyos/integrations); [Carly: Resy API](https://www.usecarly.com/blog/resy-api/)
- **Tock:** now under American Express and being merged into Resy. The partner API is narrow: twice-daily exports, a guest-profile ingest API and two real-time webhooks. Reservations can't be modified, and API/webhook access is limited to the Premium and Premium Unlimited plans. — [Supergood: Tock](https://supergood.ai/api-report-card/tock); [The Bulkhead Seat: Resy to integrate Tock venues](https://thebulkheadseat.com/25000-restaurants-total-resy-to-integrate-tock-venues-this-summer/)
- **Yelp Guest Manager:** Yelp documents a **Waitlist Partner API** and a Reservations API, enabled only for contracted partners. Restaurants get API/data-feed access only on the custom-priced Enterprise plan. — [Supergood: Yelp Guest Manager](https://supergood.ai/api-report-card/yelp-guest-manager)
- **NowBookIt (AU):** public API docs. The base URL and API key come at onboarding, and all endpoints use an `X-API-KEY` header. Supports outbound webhooks plus HMAC-signed partner inbound webhooks. Bepoz retrieves reservations into SmartPOS and **sends table statuses back** to NowBookIt. Fees to venues are reportedly **$20/month for a full integration and $10/month for gift-card-only**, with some partners free. — [NowBookIt API docs](https://api-docs.nowbookit.com/index.md); [NowBookIt help: integrating POS/CRM](https://help.nowbookit.com/integrating-your-pos-or-crm-with-now-book-it); [Bepoz: NowBookIt integration](https://help.bepoz.com/bepoz/nowbookit-integration-summary-page)
- **Quandoo (AU):** has a Partner API (docs.quandoo.com) available under partner agreements; contact publishers@quandoo.com. It partnered with ResDiary in Australia (Nov 2024). — [Quandoo public API docs](https://docs.quandoo.com); [eCommerceNews: ResDiary–Quandoo](https://ecommercenews.com.au/story/resdiary-quandoo-team-up-to-boost-australian-bookings)

### Inferences
- **Recommended priority:**
  - **US:** OpenTable (largest footprint, established POS seated-sync pattern); then SevenRooms (enterprise and multi-unit groups, which are likely early customers); then Yelp Guest Manager (waitlist-heavy casual dining, but Enterprise-only); Resy/Tock last (closed, in merger flux).
  - **AU:** NowBookIt first (most open, cheap); then OpenTable AU, SevenRooms, Quandoo.
- **The camera product can *generate* data that reservation platforms lack.** Examples are real table-vacated events and actual queue length. A "write-back" partnership (pushing table-cleared status into OpenTable/SevenRooms/NowBookIt) could be a stronger partnership pitch than simply reading reservations. NowBookIt's acceptance of inbound table statuses from Bepoz shows this pattern exists.

### Gaps
- OpenTable's current official partner-program terms and fees (no primary source retrieved).
- SevenRooms partner fees and whether table-status webhooks exist (only a competitor's blog).
- OpenTable AU-specific partner terms.

---

## 3. Staff paging / alerting: what restaurants use and how "waiter needed" alerts could reach staff

### Takeaway
Restaurants already use RF server pagers (Long Range Systems, HME) and POS handhelds. LRS transmitters expose an **API/Ethernet/USB interface for third-party triggering**, which is the most direct path to vibrating a server's existing pager. For an MVP, a **mobile app or push / SMS / WhatsApp / Slack channel** avoids hardware dependencies, with LRS integration as a premium option.

### Cited Findings
- The LRS Connect transmitter can start paging or texting from its keypad, an LRS waitlist app, **or a third-party system via its API**. It has **API, Ethernet and USB ports** for POS, kiosk and reservation integration. — [LRS Connect transmitter](https://shop.lrsus.com/products/lrs-connect-transmitter-1)
- LRS sells **staff server pagers** (4 red LEDs, multiple vibration modes) and a staff paging system. Management-software tracking works only with compatible management systems. — [LRS staff server pager](https://shop.lrsus.com/products/staff-server-pager); [LRS staff paging system](https://shop.lrsus.com/products/lrs-staff-paging-system); [LRS Vibe staff pager](https://shop.lrsus.com/products/vibe-staff-server-pager)
- LRS has a rechargeable **alphanumeric** pager (so messages like "Table 12 needs service" can be shown) and **NetPage Unlimited**, which combines paging and SMS. — [LRS: rechargeable alphanumeric pager](https://www.lrsus.com/blog/long-range-systems-introduces-rechargeable-alphanumeric-pager); [LRS: NetPage Unlimited](https://www.lrsus.com/blog/lrs-netpage-unlimited-combines-paging-and-text-messaging-on-a-global-scale-in-one-powerful-system)
- LRS modernized paging and waitlist with a software partner (case study), which signals an app/cloud layer. — [CaseStudies: LRS + Synerzip](https://www.casestudies.com/company/synerzip/case-study/long-range-systems-customer-case-study)
- HME also sells restaurant paging systems. Some paging integration documents use the industry-standard **Waveware** protocol for HME Wireless systems. — [Cash Registers Online: HME pagers](https://www.cashregistersonline.com/blogs/cash-registers-online-blog/hme-pagers); [VeDoSign I-Station software integration manual (PDF)](https://vedosign.com/wp-content/uploads/Manual-I-Station-Software-Integration-GB.pdf)
- Watch-style pagers exist (a "Wear and Go Watch Pager" with HOSTESS/SERVER transmitter variants), but no integration API was documented. — [Wear and Go Watch Pager manual (PDF)](https://cdn.shopify.com/s/files/1/0079/1163/7090/files/Wear_and_Go_Watch_Pager_User_Manual.pdf)
- AU distributors sell restaurant paging systems (an established category in AU). — [Hospitality Hub AU: paging systems](https://www.hospitalityhub.com.au/buy/paging-system)

### Inferences
- **Alert-delivery ladder (inferred), from lowest to highest integration cost:**
  1. Own PWA or mobile app with push notifications (also gives acknowledge/claim buttons, which yield "staff response time").
  2. SMS, or WhatsApp Business API (strong in Israel and many AU venues).
  3. Slack/Teams for managers.
  4. A wall or kitchen display tablet.
  5. LRS transmitter API, to hit existing alphanumeric server pagers.
  6. POS handheld notifications. There is no evidence Toast exposes a partner API to push notifications to Toast Go handhelds; this is unverified.
- **Measuring staff response time** needs an "acknowledged" event (app tap) *or* camera-detected staff arrival at the table. The camera-only approach needs staff-vs-guest classification: uniform color, a staff zone origin, or a re-ID heuristic.
- Using pager hardware gives no read-receipt (one-way RF). So a pager integration should be paired with camera confirmation of arrival.

### Gaps
- No sources were found on: Toast Go / handheld notification APIs; smartwatch adoption among servers; Slack/WhatsApp use in restaurant ops; LRS API documentation or pricing; HME API details. Search budget was exhausted before these could be covered.

---

## 4. Camera ecosystem: brands, RTSP/ONVIF, resolution/fps, mount geometry, US NDAA/FCC restrictions

### Takeaway
Most restaurant-grade IP cameras (Hikvision, Dahua and their OEM rebrands, Axis, Uniview, Hanwha) expose **multiple RTSP substreams**, and a **640p–720p substream at ~5 fps** is enough for people detection and tracking. Cloud-managed systems vary: **Verkada allows local RTSP** (2 concurrent streams), **UniFi Protect works for its own cameras but is awkward with third-party ones**, and **Eagle Eye offers a cloud Media API**. US rules restrict *import and marketing* of Hikvision/Dahua, but do **not** require private restaurants to remove installed cameras. A software-only vendor can legally connect to them, but should avoid reselling or recommending them.

### Cited Findings

**Brands and market structure**
- Axis led North America with **44.4%** in a 2024 IP Video System Design Tool ranking (counts system designs, not sales). A separate JVSG report gave Axis 20.5% with Hanwha Vision and Hikvision behind it. The sources conflict on method. — [JVSG: Hikvision remains leading brand](https://www.asadria.com/?p=29027); [JVSG quarterly ratings](https://www.jvsg.com/?p=6610)
- Globally, Hikvision is called the most popular camera brand but is not NDAA-compliant (vendor blog). — [Botslab: popular camera brands 2025](https://www.botslab.com/blogs/news/reviewing-the-most-popular-security-camera-brands-for-2025)
- No restaurant-specific camera brand share data was found. IPVM subscriber discussions exist for retail. — [IPVM discussion: brands used in retail](https://ipvm.com/discussions/what-are-the-most-common-types-and-brands-of-cameras-used-in-retail)
- Frigate (the leading OSS NVR) recommends Dahua, Hikvision and Amcrest (Amcrest = rebranded Dahua). Both Dahua and Hikvision have "multiple streams with configurable resolutions and frame rates and rock solid streams". **WiFi cameras are not recommended** (unreliable streams). Reolink 4K+ models have reported issues, so ≤5MP is advised. — [Frigate docs: recommended hardware (GitHub, dev branch, Nov 2026)](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/hardware.md)

**Stream configuration (resolution / fps)**
- Frigate decodes only the **detect** substream. The **default detection rate of 5 fps "is correct for almost all cameras"**, and 10 fps is the recommended maximum. Detection load scales linearly with fps. If a higher rate seems needed, the fix is camera placement. The ideal detect resolution makes objects fit the model input (320×320 in Frigate's default). Higher resolution helps only when objects are very small. A **15 fps** recording stream is recommended. Lowering fps in software wastes CPU, so set it in the camera. — [Frigate docs: camera setup](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/camera_setup.md)
- Video decode is a major CPU cost that accelerators like the Coral don't help with, so hardware-accelerated decode matters. — [Frigate docs: hardware FAQ](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/hardware.md)

**Cloud / managed camera platforms**
- **Verkada:** officially supports **RTSP to third-party apps**, enabled per camera in Command with username and password. Streams go camera → client directly and are **local network only** (RFC 1918 private addresses). Max **2 concurrent RTSP streams per camera**. RTSP 1.0 is unencrypted (VPN recommended). Verkada also has a cloud **Streaming API** for live and historical footage. — [Verkada help: low-latency RTSP streaming](https://help.verkada.com/verkada-cameras/live-streaming/low-latency-rtsp-streaming); [Verkada blog: APIs and integrations](https://www.verkada.com/blog/verkada-apis-and-integrations/)
- **UniFi Protect:** third-party ONVIF cameras can be adopted into Protect (enable "Discover Third-Party Cameras"), with only motion, PTZ and audio supported. Users report the RTSP link option is missing for third-party cameras in Protect, and that some can't be streamed to other apps after adoption. The RTSP option exists in camera advanced settings for native UniFi cameras. — [UI Help Center: third-party cameras](https://help.ui.com/hc/en-us/articles/26301104828439); [Home Assistant issue #127610](https://github.com/home-assistant/core/issues/127610); [IPCamTalk thread](https://ipcamtalk.com/threads/onvif-camera-added-to-unifi-protect.78452)
- **Eagle Eye Networks:** cloud VMS with a **Media API** for live and recorded video plus snapshots. API v3 uses OAuth and supports **8,000+ camera models**. Eagle Eye said there are **no additional fees** for using its Cloud VMS API. Its developer program explicitly targets "turning existing security cameras into smart business tools". — [Eagle Eye developer overview](https://developer.eagleeyenetworks.com/docs/overview); [EEN: expands developer program](https://www.een.com/eagle-eye-networks-expands-cloud-video-api-developer-program-to-help-transform-existing-security-cameras-into-smart-business-tools/); [BusinessWire: EEN API V3 (Sept 2023)](https://www.businesswire.com/news/home/20230907171285/en)

**Mount geometry: fisheye/ceiling vs wall**
- Overhead fisheye has a wide field of view and its **overhead mounting reduces occlusion**, but distant people become small, so one camera may not suffice for a large room. **Models trained on side-view images perform poorly on overhead fisheye** without adaptation. — [Boston University VIP lab: occupancy sensing with overhead fisheye](https://vip.bu.edu/projects/vsns/cossy/fisheye); [Li et al., IEEE: supervised people counting with overhead fisheye](https://ieeexplore.ieee.org/document/8909877)
- Axis advises mounting top-down fisheye at **2–4 m** indoors for counting. — [Axis whitepaper: counting solutions (2025)](https://whitepapers.axis.com/download/wp_counting_solutions_t10157830_2507.pdf)
- Angled views give more per-person detail but **increase occlusion** (missed detections, inaccurate counts) and are position-sensitive. Top-down views focus on head and shoulders, reducing obstruction. — [FootfallCam camera positioning guide](https://footfallcam.com/doc/docs/User-Guides/Camera-Positioning-And-Counting-Line-Guide); [Frontiers in Imaging 2024 (PDF)](https://www.frontiersin.org/journals/imaging/articles/10.3389/fimag.2024.1387543/pdf)

**US NDAA §889 / FCC Covered List**
- **NDAA FY2019 §889** names five companies: **Huawei, ZTE, Hytera, Hikvision, Dahua** (plus subsidiaries and affiliates), implemented by FAR 52.204-25. Part B bars federal agencies from contracting with entities that **use** covered equipment, reportedly "regardless of whether that use" relates to a federal contract (IPVM's reading). — [NDSU: NDAA Section 889](https://www.ndsu.edu/purchasing/ndaa_section_889); [IPVM: where Dahua and Hikvision are banned](https://ipvm.com/reports/hikua-bans); [USAC supply chain FAQs](https://www.usac.org/about/reports-orders/supply-chain/faqs/)
- **FCC:** in **November 2022** the FCC prohibited **new equipment authorizations** for covered Hikvision/Dahua video surveillance equipment (scoped to public safety, government facilities and critical-infrastructure physical security). The D.C. Circuit largely upheld this but required the FCC to amend its "critical infrastructure" definition. — [Hikvision USA v. FCC, D.C. Cir. 2024](https://law.justia.com/cases/federal/appellate-courts/cadc/23-1032/23-1032-2024-04-02.html); [Security Sales: FCC bans new Hikvision/Dahua sales](https://www.securitysales.com/news/fcc-bans-new-equipment-sales-hikvision-dahua/148053/); [JD Supra: court instructs FCC](https://production.jdsupra.com/legalnews/court-instructs-fcc-to-amend-definition-7105171)
- **2025–2026 escalation:**
  - An **Oct 28, 2025** Second Report & Order (ET 21-232) gave the FCC authority to bar import and marketing of *previously authorized* covered models.
  - Public Notice **DA 26-294 (Mar 27, 2026)** proposed this.
  - The FCC voted **June 26, 2026** to prohibit continued importation and marketing of previously authorized Huawei/ZTE/Hytera/Hikvision/Dahua equipment, **effective July 16, 2026 (DA 26-635)**.
  - For Hikvision and Dahua, the restriction applies to the **covered uses** only. **Existing installed equipment may continue to be used**, with no removal requirement.
  - Hikvision filed a court challenge in December 2025 (ongoing). Sources are mostly installer blogs plus Hikvision's own notices; verify on fcc.gov.
  - — [Hikvision US: Important notice to partners (2026)](https://www.hikvision.com/us-en/newsroom/latest-news/2026/Important-Notice-to-Our-Partners/); [Hikvision US: Understanding FCC updates (PS Docket 26-72)](https://www.hikvision.com/us-en/newsroom/latest-news/2026/understanding-the-fcc-s-regulatory-updates/); [Worldstar: FCC expands ban (June 2026 update)](https://worldstarsecuritycameras.com/fcc-expands-ban-on-hikvision-dahua-and-other-chinese-surveillance-equipment-full-implications-for-the-u-s-market-june-2026-update/); [FVS: FCC July ban on legacy kit](https://www.fvs-cctv.com/blog/fcc-hikvision-dahua-ban-ndaa-uk-sourcing); [Blinkless banned camera checker](https://blinkless.com/banned-camera-checker/)
- Private businesses with no federal ties are not legally barred from using existing Hikvision cameras (vendor blog, not legal authority). — [Get Safe and Sound: Is Hikvision NDAA compliant (2026)](https://getsafeandsound.com/blog/hikvision-ndaa-compliant/)

### Inferences
- **Implications for our product (US):**
  1. Connecting software to a restaurant's *existing* Hikvision/Dahua cameras is legal for ordinary private restaurants.
  2. We should **never sell, bundle or recommend** Hikvision/Dahua cameras or NVRs (marketing restrictions, reputational risk). Our recommended-camera list should be NDAA-compliant brands: Axis, Hanwha, i-PRO, Avigilon, Verkada, Ubiquiti, and US-assembled models.
  3. If we ever pursue federal or federal-contractor customers (military-base dining, federal cafeterias, contractor-operated venues), §889 Part B means *our company's own use* of covered equipment matters. Customer sites using Hikvision could raise questions.
  4. Edge-box hardware should avoid covered components. Hailo (Israel), NVIDIA and Intel are not covered. Rockchip is Chinese but **not named in §889**; it is a perception and procurement risk for some enterprise buyers, not a legal ban (inference).
- **Integration difficulty by camera ecosystem (inferred):**
  - Easy: generic ONVIF/RTSP (Hikvision, Dahua and OEMs, Uniview, Axis, Hanwha, Amcrest, Reolink ≤5MP) — pull the substream directly.
  - Easy-medium: Verkada (local RTSP, but max 2 concurrent streams per camera, so we must use one slot).
  - Medium: UniFi Protect (native cameras expose RTSP(S) links; third-party adopted cameras may not).
  - Medium, cloud-only: Eagle Eye (Media API, so pulling video adds bandwidth; may make an edge box unnecessary, or the integration could run in Eagle Eye's cloud).
  - Unknown: Avigilon (no data found).
- **Many restaurant NVRs (Hikvision/Dahua) re-stream channels via RTSP**, so one NVR connection can expose all cameras. Hitting the NVR rather than each camera reduces per-camera config but adds NVR CPU load (common practice; not verified this session).
- **Mount implications for per-table state:**
  - Existing restaurant cameras are mostly **wall/corner-angled security cameras** aimed at entrances, registers and the bar, not dining tables. Diners seated across a table occlude each other, and chairs and tables hide lower bodies.
  - A **ceiling-mounted fisheye or 360° camera** over the dining room gives the best per-table occupancy (less occlusion). It needs a fisheye-trained or dewarped model, and a center mount at 2–4 m.
  - Many sites will need **1–2 added cameras** for full table coverage, which is a sales and installation consideration.

### Gaps
- No data found for: restaurant-specific camera brand share (US/AU/Israel); Avigilon (Alta / Unity) RTSP or API access; typical resolution/fps defaults in restaurant installs.
- Australia: whether federal or state government bans on Hikvision/Dahua exist. Media reported Australian government departments removing them from government buildings in 2023 (prior knowledge, not verified this session); no private-sector restriction is known.
- Israel: no information found on Hikvision/Dahua restrictions.
- Exact FCC document text was not retrieved; the 2026 dates come from Hikvision notices and installer blogs.

---

## 5. Edge hardware: prices (2025–2026), streams per device at 5–10 fps, power, reliability, fleet management

### Takeaway
At the target load (e.g., **8–16 cameras × 5 fps ≈ 40–80 inferences/s** with a nano/small detector), almost every option has enough raw NPU throughput. The real constraints are **video decode, total cost, supply and fleet tooling**.

2026 pricing changed the calculus:
- **NVIDIA raised Jetson prices up to 101% in July 2026.** The Orin Nano Super dev kit went from $249 to $399; the Orin Nano 8GB module from $299 to $399; the Orin NX 16GB from $599 to $999.
- **Raspberry Pi raised prices three times in 2025–26** because of DRAM costs.

The best cost/performance is likely either:
- an **Intel N100/N150 mini PC (OpenVINO iGPU + Quick Sync decode) plus a Hailo-8 (26 TOPS) M.2**, or
- an **RK3588 board** for the lowest BOM.

Jetson remains the easiest path if we choose DeepStream.

### Cited Findings

**NVIDIA Jetson**
- Orin Nano Super dev kit: launched Dec 2024 at **$249**. **67 TOPS sparse / 33 TOPS dense INT8**, 1,024 CUDA cores, 32 Tensor cores, 102 GB/s memory bandwidth, **25 W** envelope. Existing Orin Nano kits get the boost via a JetPack 6.2 update. — [Tom's Hardware: $249 Orin Nano Super](https://tomshardware.com/tech-industry/artificial-intelligence/nvidia-launches-new-usd249-ai-development-board-that-does-67-tops); [CNX Software (Dec 2024)](https://www.cnx-software.com/2024/12/18/249-nvidia-jetson-orin-nano-super-developer-kit-targets-generative-ai-applications-at-the-edge/?amp=1)
- **July 2026 price hike (up to 101%), list prices at 1KU volume:**
  - Orin NX 16GB: $599 → **$999**
  - Orin NX 8GB: $399 → **$649**
  - Orin Nano 8GB module: $299 → **$399**
  - Orin Nano Super Dev Kit: $249 → **$399**
  - NVIDIA gave no explanation; memory costs are inferred.
  - — [CNX Software (Jul 22, 2026)](https://cnx-software.com/2026/07/22/nvidia-increases-the-price-of-jetson-modules-and-devkits-by-up-to-101); [Hackster (2026)](https://www.hackster.io/news/nvidia-hikes-jetson-pricing-by-up-to-101-as-the-company-gets-caught-out-by-its-own-ai-bubble-91701d7c5783); [Notebookcheck](https://www.notebookcheck.net/Nvidia-quietly-increases-Jetson-prices-by-up-to-101.1348323.0.html)
- NVIDIA accelerated **end-of-life for LPDDR4-based Jetson modules** (TX2 NX, TX2i, AGX Xavier variants) in 2026 because of DRAM supply. — [CNX Software (Apr 30, 2026)](https://www.cnx-software.com/2026/04/30/nvidia-phases-out-several-jetson-modules-due-to-high-lpddr4-ram-prices-and-tight-supplies/?amp=1&noamp=mobile); [Tom's Hardware](https://www.tomshardware.com/maker-stem/nvidia-accelerates-end-of-life-for-some-jetson-ai-processors-due-to-memory-shortages-rampocalypse-sends-older-ddr4-based-modules-to-the-great-scrapheap-in-the-sky)
- In Frigate, Jetson inference via TensorRT is "typically **20–40 ms** for most models". It uses the Jetson hardware media engine for decode; the DLA is more power-efficient but not faster. — [Frigate docs: hardware](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/hardware.md)
- DeepStream 7.1's performance table lists PeopleNet ResNet34 (960×544, INT8, no tracker) at ~**250 FPS** on Orin Nano, measured with a 1080p H.265 sample. Column alignment in the extracted text was ambiguous; verify. A third-party guide reports **~15–25 fps end-to-end at 720p** for a DeepStream 9.1 + PeopleNet pipeline on Orin Nano (setup unclear). — [NVIDIA DeepStream 7.1 DS Performance](https://docs.nvidia.com/metropolis/deepstream/7.1/text/DS_Performance.html); [Peridio: NVIDIA DeepStream](https://docs.peridio.com/developer-reference/references/nvidia-deepstream)

**Hailo (Israeli company; Hailo-8 26 TOPS, Hailo-8L 13 TOPS, Hailo-10H 40 TOPS INT4)**
- Official Hailo Model Zoo throughput, measured on an i5-9400 host over **PCIe Gen3 x4**. These are **NPU-only numbers** (no decode or post-processing), so expect lower figures on a Raspberry Pi's single-lane PCIe:

  | Model (640×640) | COCO mAP (HW) | Hailo-8 FPS (bs1 / bs8) | Hailo-8L FPS (bs1 / bs8) | Hailo-10H FPS (bs1 / bs8) |
  |---|---|---|---|---|
  | yolov8n | 36.4 | 1036 / 1036 | 201 / 437 | 378 / 367 |
  | yolov8s | 43.9 | 491 / 491 | 110 / 208 | 178 / 263 |
  | yolov8m | 49.2 | 66.9 / 149 | 50.7 / 87 | 76.4 / 132 |
  | yolo11n | 37.5 | 185 / 541 | 157 / 370 | 309 / 343 |
  | yolo11s | 45.1 | 111 / 303 | 91.9 / 190 | 142 / 223 |
  | yolo26n | 38.4 | 154 / 427 | 111 / 255 | 234 / 311 |
  | yolo26s | 45.3 | 97.8 / 263 | 66.5 / 147 | 125 / 215 |
  | yolov10n | 36.6 | 194 / 567 | 150 / 359 | 303 / 338 |
  | yolox_s_leaky (Apache-2.0) | 37.3 | 385 / 385 | 109 / 199 | 199 / 234 |
  | yolov6n (GPL-3.0, see §6) | 32.4 | 1250 / 1250 | 356 / 356 | 506 / 511 |
  | yolov9c | 51.0 | 44.8 / 88.7 | 27.2 / 42.2 | 52.7 / 85.0 |

  — [Hailo Model Zoo: HAILO8 object detection](https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO8/HAILO8_object_detection.rst); [HAILO8L](https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO8L/HAILO8L_object_detection.rst); [HAILO10H](https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO10H/HAILO10H_object_detection.rst) (repo commit Oct 31, 2026)
- In Frigate, Hailo-8 takes ~6–7 ms and Hailo-8L ~10–11 ms (ssd-mobilenet / yolov6n). Frigate reports consistent performance with multiple cameras, and x86 hosts with more PCIe lanes improve on the Raspberry Pi. — [Frigate docs: hardware](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/hardware.md)
- **Prices:**
  - Raspberry Pi AI Kit (Hailo-8L, 13 TOPS): **$70** list. — [Data Phoenix: AI Kit $70](https://dataphoenix.info/the-raspberry-pi-ai-kit-developed-with-hailo-is-now-available-and-costs-70); [Jeff Geerling: 13 TOPS for $70](https://jeffgeerling.com/tags/hat)
  - Standalone Hailo-8 (26 TOPS) M.2 module: **~$180–$230** retail (Waveshare $179.99–$187.99; an Amazon listing at $218.59 as of 2026-04-23). — [Waveshare AI boards](https://waveshare.com/product/ai/boards-kits/raspberry-pi.htm?dir=asc); [Desertcart Hailo-8 M.2](https://www.desertcart.co.uk/products/642367194-hailo-8-m-2-ai-accelerator-module-compatible-with-raspberry.md)
  - **Raspberry Pi AI HAT+ 2 (Hailo-10H, 8 GB onboard RAM): $130** at launch (Jan 2026), with retail listings up to €199 / $225. For vision it performs roughly like the 26-TOPS AI HAT+. Peak power is reported at **12 W vs 7 W** for the previous HAT (secondary source). — [Tecnoblog: AI HAT+ 2](https://tecnoblog.net/noticias/raspberry-pi-anuncia-placa-ai-hat-2-com-40-tops-para-ia-preco-e-alto/); [LAVX: AI HAT+ 2 analysis at $130](https://news.lavx.hu/article/raspberry-pi-ai-hat-2-technical-analysis-edge-inference-tradeoffs-at-130); [Adafruit AI HAT+ 2](https://www.adafruit.com/product/6451); [Switch Science](https://www.switch-science.com/products/10916)
- **Raspberry Pi DRAM-driven price rises:**
  - 8GB Pi 5: $80 → $95 (Dec 2025) → $125 (Feb 2026).
  - Sources conflict after that: BGR and TweakTown say **$175** (April 2026); Tom's Hardware's table shows **$130** for April and Oct 2026.
  - The 16GB Pi 5 went above $200.
  - — [Raspberry Pi: more memory-driven price rises](https://www.raspberrypi.com/news/more-memory-driven-price-rises/); [Tom's Hardware](https://www.tomshardware.com/raspberry-pi/raspberry-pi-5-price-increases-drastically-as-ai-shortage-bites-16gb-version-now-usd205-second-price-increase-in-three-months-over-70-percent-more-expensive-than-original-msrp); [BGR](https://www.bgr.com/2150106/raspberry-pi-cost-ram-crisis/); [The Register](https://www.theregister.com/2026/02/02/raspberry_pi_ram_shortage_price_hike/)

**Intel N100/N150 (OpenVINO, iGPU/CPU)**
- Frigate OpenVINO inference on the iGPU:
  - **N100:** MobileNetV2 ~15 ms; YOLOv9-s @320 30 ms; YOLO-NAS @320 ~25 ms. Can run only one detector instance.
  - **N150:** YOLOv9-t @320 16 ms; YOLOv9-s @320 24 ms.
  - **Intel NPU (Core Ultra):** YOLOv9-s @320 11 ms / @640 30 ms.
  - **Iris Xe:** YOLOv9-t @640 14 ms.
  - — [Frigate docs: hardware](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/hardware.md)
- Frigate's favourite server is the **Beelink EQ13 (N100, dual NICs for an isolated camera network)**: "can run object detection on several 1080p cameras with low-medium activity". The i3-1220P handles "a large number of 1080p cameras with high activity". The Core Ultra 125H includes an NPU. The Beelink EQ14 has known compatibility issues. — [Frigate docs: hardware](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/hardware.md)
- On the N100 **CPU** (LattePanda Mu), YOLOv8n with OpenVINO runs at ~**4–7 FPS** (camera loop). — [LattePanda: YOLOv8 on N100](https://lattepanda.com/blog-323173.html); [DigiKey Maker.io](https://www.digikey.com/en/maker/projects/run-yolov8-on-lattepanda-mu-intel-n100-processor-with-openvino/e8bac6c250be401cb5bdfdf3ad1e1056)
- OpenVINO throughput mode (multi-stream, async) is key. A 2023 NUC test reached ~204 FPS on the iGPU (YOLOv8n INT8, unnamed CPU, an upper-bound reference). — [OpenVINO Medium: YOLOv8 1000 FPS](https://medium.com/openvino-toolkit/how-to-get-yolov8-over-1000-fps-with-intel-gpus-9b0eeee879); [Ultralytics OpenVINO export docs](https://docs.ultralytics.com/integrations/openvino)

**Rockchip RK3588 (6 TOPS NPU, 3 cores)**
- Official rknn_model_zoo benchmark, **RK3588 single NPU core**, INT8, 640×640, inference only (no pre/post-processing), at max NPU frequency:
  - **yolov8n 76.3 FPS**, yolov8s 38.6, yolov8m 16.3
  - **yolo11n 64.0**, yolo11s 34.6
  - **yolo26n 55.0**, yolo26s 30.5
  - **yolox_s 37.6**, yolox_m 15.9
  - ppyoloe_s 39.7
  - yolov10n 63.9
  - (RK3576 single core is similar or faster.) — [airockchip/rknn_model_zoo README (commit Oct 13, 2026)](https://github.com/airockchip/rknn_model_zoo)
- Frigate on RK3588 with all 3 cores: YOLOX nano 14 ms / tiny 18 ms; YOLO-NAS small ~20 ms; YOLOv9 tiny ~35 ms. — [Frigate docs: hardware](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/hardware.md)
- Community: Qengineering reports ~53 FPS yolov8n. A Khadas RK3588S 1080p pipeline across 3 NPU cores went from 31 FPS single-threaded to a 46 FPS sensor ceiling. Python post-processing adds ~30–40 ms/frame. — [Radxa forum: YOLOv8 on RK3588 NPU](https://forum.radxa.com/t/use-yolov8-in-rk3588-npu/15838?page=7); [tinycomputers: RK3588 NPU benchmarks](https://tinycomputers.io/posts/rockchip-rk3588-npu-benchmarks.md)

**Google Coral (Edge TPU)**
- Frigate says **"The Coral is no longer recommended for new Frigate installations"**, except for very low power or hardware that can't use other accelerators. It runs ~10 ms ssd-mobilenet, and max throughput ≈ 1000/inference-ms (≈100 FPS). — [Frigate docs: hardware](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/hardware.md)

**Axelera Metis and other accelerators**
- Axelera Metis M.2 starts at **$195.46** (Sept 2025 announcement). Vendor-reported **YOLOv8n 771 FPS (M.2)** / 847 FPS (PCIe), with a conflicting 178 FPS YOLOv5s figure in a community comparison. The Metis M.2 Max was announced Sept 2025, shipping Q4 2025. — [Ultralytics docs: Axelera integration](https://docs.ultralytics.com/tr/integrations/axelera); [Axelera community post](https://community.axelera.ai/voyager-sdk-2/yolo-developers-meet-your-new-edge-for-real-time-multi-stream-ai-1083); [TechIntelPro: Metis M.2 Max](https://techintelpro.com/news/ai/enterprise-ai/axelera-ai-unveils-metis-m2-max-for-enhanced-edge-ai-performance)
- **MemryX MX3 M.2:** total pipelined throughput of **YOLOv9s @320 ~382 FPS, @640 ~110 FPS**; YOLOX-S @640 ~263 FPS (measured on an i7-13700 host). — [Frigate docs: hardware](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/hardware.md)
- DEEPX DX-M1: YOLOX-S (PPU) @640 ~13 ms. AXERA AX650N: YOLOv9-tiny ~4 ms. — [Frigate docs: hardware](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/hardware.md)

**Fleet / remote management**
- **balenaCloud** (third-party aggregator pricing):
  - Prototype **$159/mo** (incl. 30 devices); Pilot **$329/mo** (60); Production **$1,439/mo** (110).
  - Extra devices **$3/device/mo** (Prototype) or **$2/device/mo** (Pilot and up).
  - First 10 devices free; Enterprise is quote-only.
  - — [FitGap: balenaCloud](https://us.fitgap.com/products/balenacloud)
- The DeepStream SDK is available as containers (NGC). The **development** containers are under a development-only license that **does not allow redistribution**, which matters for container-based fleet deploys. — [NGC DeepStream SDK collection](https://catalog.ngc.nvidia.com/orgs/nvidia/collections/deepstream_sdk)

### Inferences
- **Stream-capacity math (inferred from NPU-only numbers; decode, tracking and post-processing will reduce this).** At 5 fps per camera with full-frame detection:

  | Accelerator | Model | Approx. FPS | Approx. streams at 5 fps |
  |---|---|---|---|
  | Hailo-8L (on x86) | yolov8s | 110 | ~22 |
  | Hailo-8L (on x86) | yolov8n | 201 | ~40 |
  | Hailo-8 | yolo11s | 111–303 | ~22–60 |
  | RK3588 (3 cores) | yolov8s | ~110 | ~20 |
  | N100 iGPU (Frigate) | YOLOv9-s @320 (30 ms) | ~33 | ~6 |
  | Jetson Orin Nano (Frigate) | typical (20–40 ms) | ~25–50 | ~5–10 |

  - **Jetson caveat:** this is a single-process Frigate number. DeepStream batching gets much higher, e.g., ~250 FPS PeopleNet → ~50 streams at 5 fps.
  - **A typical 8–16-camera restaurant is comfortably served by any of these at 5 fps** with a small model. The decode of 8–16 × 1080p (or 640p substreams) is the real bottleneck.
- **Decode capability matters more than TOPS.** Use camera substreams (e.g., 640×360 or 704×480 at 5 fps) to make decode trivial. Hardware decode:
  - Intel N100 has Quick Sync; Jetson has NVDEC; RK3588 has a multi-stream VPU (prior knowledge, not verified this session).
  - **The Raspberry Pi 5 lacks a hardware H.264 decoder (only HEVC)** (prior knowledge, not verified this session). This makes Pi 5 + Hailo a weaker choice for 8+ H.264 RTSP streams.
- **Edge-box BOM options (inferred; 2026 retail):**
  - **(A) Lowest cost, x86:** N100/N150 mini PC (~$150–250 street before 2026 DRAM increases; current price not verified) with OpenVINO on the iGPU → ~6–10 streams at 5 fps with a small model at 320–416 input. Easiest Linux/Docker fleet ops, dual NIC for camera VLAN isolation.
  - **(B) Best cost/performance:** N100/N150 mini PC + **Hailo-8 M.2 (~$180–230)** → plenty of headroom (20–60 streams of detection) and x86 manageability. Hailo is an Israeli company, which is relevant for the Israel market and NDAA neutrality.
  - **(C) Lowest BOM ARM:** RK3588 SBC/box (e.g., Orange Pi 5 / Radxa Rock 5 class; prices not verified) → ~20 streams of yolov8s. Weaker software ecosystem; Python post-processing is slow; Chinese SoC is a perception risk with some buyers.
  - **(D) Turnkey NVIDIA:** Orin Nano 8GB (**$399 module / $399 dev kit after July 2026**) → DeepStream, NVDEC and TensorRT, the best SDK maturity. Now ~2× the price of option B.
  - **(E) Avoid for new designs:** Google Coral (deprecated in Frigate) and Raspberry Pi 5 + AI HAT (H.264 decode limit, rising Pi prices, SD-card reliability unless using NVMe).
- **Reliability:** use industrial or fanless boxes with eMMC/NVMe (not SD cards), a watchdog, and a UPS-friendly config. Use **dual NICs or VLAN** to isolate cameras from the internet (Frigate's EQ13 rationale applies).
- **Fleet tooling:**
  - balena costs roughly **$2–3/device/month**: fine at <1,000 sites, but it shapes unit economics.
  - Alternatives: Mender (OTA, open-source core), AWS IoT Greengrass, or plain Docker + Tailscale/WireGuard + Ansible/Watchtower. Pricing for these was not verified this session.

### Gaps
- Current (Nov 2026) street prices for N100/N150 mini PCs, RK3588 boards, Hailo-8L standalone M.2 and Axelera Metis (DRAM-driven increases make 2025 prices unreliable).
- Verified multi-stream end-to-end benchmarks (decode + detect + track) on each platform; only NPU-only or single-stream numbers exist publicly.
- Power draw under load for N100 + Hailo-8, RK3588 and Orin Nano at the target load (only the 25 W Orin Nano envelope and 7 W/12 W Hailo HAT peaks were found).
- Mender and AWS IoT Greengrass pricing (not retrieved; search budget exhausted).
- Hailo's own published price list; Google Coral production/EOL status from Google.

---

## 6. Software stack options and licensing caveats for commercial SaaS

### Takeaway
A permissively licensed, commercially safe stack is achievable:
- **Detector:** RT-DETR, D-FINE, RF-DETR (Nano–Large) or YOLOX (all Apache-2.0).
- **Trackers:** ByteTrack and BoT-SORT originals (MIT), or Roboflow `trackers` (Apache-2.0).
- **Zones and counting:** Roboflow Supervision (MIT).
- **Ingest:** MediaMTX (MIT), GStreamer.
- **Reference NVR:** Frigate (MIT).

**Avoid Ultralytics YOLO (AGPL-3.0)** unless we buy an Enterprise License. Ultralytics states that **trained models and even internal business use** fall under AGPL by default. **BoxMOT is AGPL-3.0** too.

### Cited Findings
- **Ultralytics (YOLOv5/v8/11/26):** the repository LICENSE is **GNU AGPL-3.0**. The README says the Enterprise License is for "development and production use… business products and services, including internal tools, automated workflows, and production deployments, bypassing the open-source requirements of AGPL-3.0". — [ultralytics/ultralytics README & LICENSE (commit Nov 6, 2026)](https://github.com/ultralytics/ultralytics)
- Ultralytics' licensing page says SaaS, embedded and customer-facing products **and internal business tools** require an Enterprise License. Trained models fall under AGPL-3.0 by default. YOLOv5, YOLOv8, YOLO11 and YOLO26 are covered by the enterprise agreement. **No public price** (quote via form). — [Ultralytics license](https://ultralytics.com/license); [Ultralytics enterprise software license](https://www.ultralytics.com/legal/enterprise-software-license); [KI-Syndikat: YOLO](https://www.ki-syndikat.de/tools/yolo/)
- Roboflow is an **authorized licensor of Ultralytics models** (e.g., YOLO11), offering a commercial license without open-sourcing obligations. — [Roboflow: Ultralytics licensing](https://roboflow.com/ultralytics)
- **RF-DETR:** LICENSE is Apache-2.0. Per the README, Nano through Large are Apache-2.0, while XL and 2XL "Plus" models use **PML 1.0** (commercial use when deployed on Roboflow). Roboflow (Mar 2026) says the Apache models are free for closed-source commercial use. — [roboflow/rf-detr](https://github.com/roboflow/rf-detr); [Roboflow blog: RF-DETR free commercially](https://blog.roboflow.com/rf-detr-is-free-to-use-commercially/)
- **RT-DETR** (lyuwenyu/RT-DETR): Apache-2.0. **D-FINE** (Peterande/D-FINE): Apache-2.0. **YOLOX** (Megvii): Apache-2.0. — [RT-DETR LICENSE](https://github.com/lyuwenyu/RT-DETR/blob/main/LICENSE); [D-FINE LICENSE](https://github.com/Peterande/D-FINE/blob/master/LICENSE); [YOLOX LICENSE](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/LICENSE)
- **Trackers:**
  - ByteTrack original (ifzhang/ByteTrack): MIT. BoT-SORT original (NirAharon/BoT-SORT): MIT.
  - Roboflow `trackers` (SORT, ByteTrack, OC-SORT, BoT-SORT implementations): Apache-2.0.
  - **BoxMOT (mikel-brostrom/boxmot): AGPL-3.0**, so avoid it in proprietary code.
  - — [ByteTrack LICENSE](https://github.com/ifzhang/ByteTrack/blob/main/LICENSE); [BoT-SORT LICENSE](https://github.com/NirAharon/BoT-SORT/blob/main/LICENSE); [roboflow/trackers](https://github.com/roboflow/trackers); [PyPI trackers](https://pypi.org/project/trackers/2.6.1/); [BoxMOT LICENSE](https://github.com/mikel-brostrom/boxmot/blob/master/LICENSE)
- **Roboflow Supervision** (includes PolygonZone, LineZone and annotators): MIT. — [roboflow/supervision LICENSE.md](https://github.com/roboflow/supervision/blob/develop/LICENSE.md)
- **Frigate:** MIT ("Copyright (c) 2026 Frigate, Inc."). **MediaMTX** (RTSP/WebRTC/HLS media server): MIT. — [Frigate LICENSE](https://github.com/blakeblackshear/frigate/blob/dev/LICENSE); [MediaMTX LICENSE](https://github.com/bluenviron/mediamtx/blob/main/LICENSE)
- **NVIDIA DeepStream:** the SDK is under the **DeepStream SDK EULA**, NGC containers are under the NGC license, and GitHub sources are OSS. Development containers **cannot be redistributed**. Whether **PeopleNet** (NGC pretrained model) can be used commercially is contradictory in NVIDIA forum replies: one says yes, a later one says the model itself can't be sold but fine-tuned derivatives can. Check the model EULA. — [NGC DeepStream SDK](https://catalog.ngc.nvidia.com/orgs/nvidia/collections/deepstream_sdk); [NVIDIA forum: DeepStream commercial licensing](https://forums.developer.nvidia.com/t/understanding-deepstream-sdk-commercial-licensing/277386); [NVIDIA forum: TAO models commercial licensing](https://forums.developer.nvidia.com/t/understanding-tao-models-commercial-licensing/281977)
- Hailo Model Zoo and RKNN model zoo publish precompiled models for **both AGPL (Ultralytics) and Apache (YOLOX, RT-DETR-style) architectures**. Using a precompiled Ultralytics-derived HEF/RKNN still carries Ultralytics' license terms (Hailo links the source as github.com/ultralytics/ultralytics). — [Hailo Model Zoo HAILO8 table](https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO8/HAILO8_object_detection.rst); [rknn_model_zoo](https://github.com/airockchip/rknn_model_zoo)

### Inferences
- **Recommended permissive default stack:**
  - Ingest: MediaMTX or GStreamer RTSP ingest using camera substreams at 5 fps.
  - Detection: YOLOX-S or D-FINE-N/S or RF-DETR-Nano/Small, fine-tuned on restaurant footage (all Apache-2.0). YOLOX has ready Hailo, RKNN and OpenVINO ports; DETR-family export to NPUs is less mature. On Frigate's Intel NPU, RF-DETR-n @320 takes 40 ms versus 11 ms for YOLOv9-s, so it is heavier on edge NPUs.
  - Tracking: ByteTrack via Roboflow `trackers` (Apache-2.0).
  - Zones and per-table logic: Supervision PolygonZone (MIT).
  - Uplink: only anonymized metrics (MQTT/HTTPS).
  - Frigate (MIT) is a useful *reference* or fork base for camera handling and detector abstraction across Hailo, OpenVINO, RKNN, TensorRT and MemryX.
- **AGPL risk:** AGPL network-use clauses mean even a SaaS that never distributes binaries can trigger obligations. And Ultralytics explicitly claims internal use and trained weights. So using Ultralytics in edge boxes we ship to customers clearly requires an Enterprise License or a switch of model family.
- **YOLOv6 (Meituan) is GPL-3.0** and **YOLOv9 (WongKinYiu) is GPL-3.0** (prior knowledge; not verified this session). Frigate's default Hailo model (YOLOv6n) and its YOLOv9 detectors may therefore carry copyleft obligations if embedded in a proprietary product. Verify before reusing Frigate's default models.
- DeepStream is fine to deploy commercially under its EULA. Lock-in to NVIDIA hardware (now ~2× pricier after July 2026) is the main cost.

### Gaps
- Ultralytics Enterprise License pricing (quote-only; no public figure found).
- PeopleNet / TAO model commercial terms (forum answers conflict; EULA text not retrieved).
- Licenses of YOLOv6/YOLOv9/YOLO-NAS weights (YOLO-NAS weights have a restrictive Deci license per prior knowledge; not verified this session).

---

## 7. Accuracy expectations: people counting and occupancy in crowded indoor scenes; table occlusion

### Takeaway
Little hard, comparable accuracy data exists for **seated diners at tables**. Public material is mostly qualitative or for entrance line-crossing. The evidence consistently says that **overhead/fisheye mounts reduce occlusion**, that **side-view-trained detectors degrade on overhead fisheye**, and that **angled security-camera views suffer occlusion** (the typical restaurant setup). Expect to collect a restaurant-specific dataset and validate per-site, and design metrics around **table-level occupancy states (empty / occupied / needs attention)** rather than exact head counts.

### Cited Findings
- Overhead fisheye cameras offer a large field of view and reduce occlusion. Far-away people can be too small, so a single overhead fisheye may not suffice for large spaces. Models trained on side views perform poorly on overhead fisheye images, so a fisheye-adapted detector is needed. — [BU VIP Lab: overhead fisheye occupancy sensing](https://vip.bu.edu/projects/vsns/cossy/fisheye); [Li et al.: people counting using overhead fisheye](https://vip.bu.edu/projects/vsns/cossy/fisheye/Li-et-al); [IEEE Xplore 8909877](https://ieeexplore.ieee.org/document/8909877); [BU OpenBU](https://open.bu.edu/items/aa911ad2-bf75-4844-8cff-23a4d0a74cb1)
- Angled views increase occlusion, causing missed detections or inaccurate counts, and are sensitive to positioning. Top-down head-and-shoulder views improve accuracy. — [FootfallCam positioning guide](https://footfallcam.com/doc/docs/User-Guides/Camera-Positioning-And-Counting-Line-Guide); [IP Security Depot: people counting accuracy guide](https://www.ipsecuritydepot.com/guides/people-counting-analytics-accuracy-guide)
- Axis counting whitepaper: top-down fisheye at 2–4 m indoors (vendor guidance on mounting for accurate counting). — [Axis: counting solutions whitepaper (2025)](https://whitepapers.axis.com/download/wp_counting_solutions_t10157830_2507.pdf)
- Academic crowd-counting work (Oxford ESGI CrowdVision) discusses crowd-density challenges. — [Oxford ESGI CrowdVision draft](https://miis.maths.ox.ac.uk/755/1/esgi-crowdvision-draft-v1.pdf)
- Hailo/RKNN COCO mAP shows the size-versus-accuracy trade-off for general detectors. Examples: yolov8n 36.4 → yolov8s 43.9 → yolov8m 49.2 mAP on Hailo-8; yolo11s 45.1; yolo26s 45.3. Larger models help with small or occluded people at a throughput cost. — [Hailo Model Zoo HAILO8](https://github.com/hailo-ai/hailo_model_zoo/blob/master/docs/public_models/HAILO8/HAILO8_object_detection.rst)
- Frigate guidance: tracking needs ~8–10 detections while an object crosses the view. At 5 fps, people in normal scenes yield ~15+ detections. Objects transiting in under 1 s can't be tracked reliably at any practical rate. — [Frigate docs: camera setup](https://github.com/blakeblackshear/frigate/blob/dev/docs/docs/frigate/camera_setup.md)

### Inferences
- **Table-state accuracy is driven by camera geometry more than by model choice.** Seated diners behind others, high-backed booths, and staff standing in front of tables will produce under-counts from angled cameras. Per-table **occupied vs empty** (binary, smoothed over 30–60 s) should be far more robust than exact diner counts. Diner counts should be reported with confidence and/or reconciled with POS covers.
- **Temporal smoothing** (hysteresis over many frames) mitigates transient occlusion. Waiter-needed alerts should use dwell-time rules (e.g., guests seated more than N minutes with no staff visit) rather than single-frame events.
- **Staff vs guest classification** (needed for staff response time and waiter-needed) is a separate accuracy problem. Uniform color, staff-zone origin and per-site fine-tuning are likely required. No public benchmarks were found.
- Plan a **per-site calibration step** (draw table polygons, set camera-to-table mapping, verify with a 1-day labelled sample). Report site-level accuracy as part of onboarding.
- Fine-tuning on restaurant footage (seated people, partial bodies, low light) with a permissive model (YOLOX/D-FINE/RF-DETR) is likely necessary. COCO "person" mAP does not reflect seated, occluded diners.

### Gaps
- **No published, quantitative accuracy figures were found** for seated-diner counting or table occupancy in restaurants, nor head-to-head overhead vs angled accuracy tables. Vendor counting accuracies (often 95%+ for entrance line-crossing, from prior knowledge) were not retrieved this session and don't transfer to seated scenes.
- Benchmarks on crowded indoor datasets (e.g., CrowdHuman, MOT17/20 tracker HOTA/IDF1 for ByteTrack/BoT-SORT) were not retrieved this session because the search budget was exhausted.

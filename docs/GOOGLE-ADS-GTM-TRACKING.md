# Tracking Online Booking Conversions with Google Tag Manager

How to see when someone clicks a Google ad and then books an appointment
through the scheduler.

---

## Why this needed code changes

The scheduler is a modal on your existing page. When a customer finishes
booking, the URL never changes — there is no `/thank-you` page. Every
standard GTM recipe ("fire a conversion on the confirmation page URL")
depends on that page load, so none of them can ever fire here. That is
almost certainly why bookings have been invisible in Google Ads.

The fix is a **dataLayer event**. The widget now announces each step of
the booking funnel to the page it is embedded in, and GTM listens for
those announcements instead of for a page view.

The other half of the problem is attribution. Google Ads adds a `gclid`
parameter to the landing page URL when someone clicks an ad. The widget
now captures that click ID, keeps it for 90 days, and sends it along with
the booking into ServiceTitan — so a job that eventually *sells* can be
matched back to the exact ad click that produced it.

---

## Events the scheduler pushes

All events land on `window.dataLayer` on the host page.

| Event | Fires when | Use it for |
|---|---|---|
| `scheduler_open` | Widget opens | Top of funnel |
| `scheduler_step_view` | Any step is shown | Drop-off analysis |
| `scheduler_service_selected` | Cooling / Heating / Plumbing / Electrical picked | Demand by trade |
| `scheduler_issue_selected` | Specific issue picked | Ad copy / keyword insight |
| `scheduler_details_submitted` | Step 2 "Continue" | Funnel |
| `scheduler_contact_submitted` | Step 3 "Continue" (name, phone, address done) | Micro-conversion |
| `scheduler_slot_selected` | Appointment window chosen | Funnel |
| `scheduler_booking_submitted` | "Request Appointment" clicked | Attempt rate |
| **`booking_confirmed`** | **ServiceTitan job created** | **← the conversion** |
| `scheduler_booking_error` | Submission failed | Alerting |
| `scheduler_abandoned` | Closed before booking | Drop-off analysis |

**`booking_confirmed` is the only event you should use as your Google Ads
conversion.** It fires only after the job actually exists in
ServiceTitan, so it never counts a failed submission.

### Data available on `booking_confirmed`

| Key | Example | Notes |
|---|---|---|
| `transaction_id` | `10059871` | ServiceTitan job ID — Google's dedupe key |
| `job_id` | `10059871` | Same value |
| `value` | `350` | Only if you set `conversionValue` (see config) |
| `currency` | `USD` | |
| `service_type` | `cooling` | |
| `service_name` | `Cooling` | |
| `issue` | `ac-not-cooling` | |
| `appointment_date` | `2026-09-14` | |
| `booking_zip` | `75024` | |
| `is_member` | `false` | |
| `has_referral` | `true` | |
| `scheduler_brand` | `lex` / `etx` / `lyons` | |
| `gclid`, `utm_source`, `utm_campaign`, … | | Present when the visit came from a tagged click |

Every event also carries the attribution keys, so you can segment any
step of the funnel by campaign — not just the final conversion.

---

## Setup

### Prerequisites

1. **GTM container installed on the site** where the scheduler embed
   lives (lexac.com, the ETX site, the Lyons site — each one).
2. **Google tag (`AW-…` and/or `G-…`) firing on all pages** through
   that container.
3. **Auto-tagging enabled** in Google Ads → Settings → Account settings →
   Auto-tagging. Without it there is no `gclid` and none of this works.
4. **A Conversion Linker tag** in GTM firing on All Pages (or the
   modern Google tag, which handles linking itself). This writes the
   `_gcl_aw` cookie that connects the click to the booking.

### Step 1 — Create the conversion action in Google Ads

Google Ads → Goals → Conversions → **New conversion action** → Website →
enter your domain → **Add a conversion action manually**.

- **Goal category:** Submit lead form
- **Conversion name:** `Online Booking — Scheduler`
- **Value:** Use a value that reflects a booked appointment. If you don't
  have one, take your average completed-job revenue × your booked-to-sold
  rate. A rough number beats no number — Smart Bidding needs something to
  optimize toward.
- **Count:** **One** (one booking per click; "Every" would inflate counts
  for repeat customers)
- **Click-through conversion window:** 30–90 days (HVAC/plumbing
  research cycles run long)
- **Attribution model:** Data-driven

Save, then choose **Use Google Tag Manager** and copy the **Conversion ID**
(`AW-XXXXXXXXX`) and **Conversion Label** (`AbC-D_efGhI`).

### Step 2 — Create the trigger in GTM

Triggers → New → **Custom Event**

- **Event name:** `booking_confirmed`
- Fires on: All Custom Events
- Name it `CE — Booking Confirmed`

### Step 3 — Create the variables

Variables → New → **Data Layer Variable** for each. Name each one
`DLV — <key>`:

| Data Layer Variable Name | Suggested variable name |
|---|---|
| `transaction_id` | `DLV — transaction_id` |
| `value` | `DLV — value` |
| `service_type` | `DLV — service_type` |
| `issue` | `DLV — issue` |
| `scheduler_brand` | `DLV — scheduler_brand` |
| `gclid` | `DLV — gclid` |

### Step 4 — Create the Google Ads conversion tag

Tags → New → **Google Ads Conversion Tracking**

- **Conversion ID:** from Step 1
- **Conversion Label:** from Step 1
- **Conversion Value:** `{{DLV — value}}`
- **Transaction ID:** `{{DLV — transaction_id}}`
- **Currency Code:** `USD`
- **Trigger:** `CE — Booking Confirmed`

The Transaction ID matters: it's the ServiceTitan job ID, so if the tag
ever fires twice for the same booking, Google Ads counts it once.

### Step 5 — Add a GA4 tag on the same trigger (recommended)

Tags → New → **Google Analytics: GA4 Event**

- **Event Name:** `generate_lead`
- **Event Parameters:** `value` → `{{DLV — value}}`, `currency` → `USD`,
  `service_type` → `{{DLV — service_type}}`, `transaction_id` →
  `{{DLV — transaction_id}}`
- **Trigger:** `CE — Booking Confirmed`

This gives you the booking funnel inside GA4 alongside the Ads
conversion. Repeat with the other `scheduler_*` events if you want full
drop-off reporting — `scheduler_open` → `scheduler_contact_submitted` →
`booking_confirmed` makes a clean GA4 funnel exploration.

**Import it as a second conversion only if you understand the overlap.**
Counting both the Ads tag and a GA4-imported conversion will double-count
in your reporting columns.

### Step 6 — Enhanced conversions (optional, recommended)

Enhanced conversions send hashed customer contact details with the
conversion, recovering attribution Google would otherwise lose to
cookie restrictions. Typical lift for home-services lead forms is
meaningful.

1. In the embed config, set `enhancedConversions: true` (see below).
   The widget then includes `enhanced_conversion_data` with the
   customer's email, phone, and address on the `booking_confirmed` event.
   **It is off by default** — nothing personal enters the dataLayer
   unless you turn it on.
2. In Google Ads, on the conversion action → **Enhanced conversions** →
   turn on, choose **Google Tag Manager**, accept the customer data terms.
3. In GTM, on the conversion tag → **Include user-provided data from your
   website** → create a **User-Provided Data** variable → **Manual
   configuration** → map each field to a Data Layer Variable pointing at
   `enhanced_conversion_data.email`, `enhanced_conversion_data.phone_number`,
   `enhanced_conversion_data.address.first_name`, and so on.

GTM hashes the data with SHA-256 in the browser before it is sent. Make
sure your privacy policy covers it.

### Step 7 — Test before publishing

1. GTM → **Preview**, enter the site URL.
2. Add `?gclid=test123` to the URL so attribution capture has something
   to grab.
3. Open the scheduler and complete a real booking (use your own phone
   number and a real address — it creates an actual ServiceTitan job, so
   cancel it afterward).
4. In the Tag Assistant panel, confirm:
   - The `booking_confirmed` event appears in the event stream.
   - Your Google Ads conversion tag shows under **Tags Fired**.
   - The Data Layer tab shows `transaction_id`, `value`, and `gclid`.
5. Optionally, run `dataLayer` in the browser console to see the raw
   events, or set `debug: true` in the tracking config to have the widget
   log every event it pushes.
6. **Submit** the GTM container.

Google Ads takes 3–24 hours to show the first conversion. Check
Goals → Conversions → your action → status should move from "No recent
conversions" to "Recording conversions."

---

## Embed configuration

Add a `tracking` block to the existing config on each site. Every field
is optional.

```html
<script>
  window.LEXSchedulerConfig = {
    apiEndpoint: 'https://scheduler-mu-three.vercel.app/api/lex-booking',
    autoButton: true,
    buttonText: 'Book Online',
    baseUrl: 'https://scheduler-mu-three.vercel.app',
    headerColor: '#133865',
    buttonColor: '#0A5C8C',
    tagline: 'The Gold Standard of White Glove Service',
    phoneNumber: '(972) 466-1917',

    tracking: {
      brand: 'lex',              // stamped on every event
      conversionValue: 350,      // value sent with booking_confirmed
      currency: 'USD',
      measurementId: 'G-XXXXXXX',// optional: enables GA4 session ID capture
      enhancedConversions: false,// true = include customer data for EC
      debug: false               // true = console.log every event
      // enabled: false          // kill switch — disables all tracking
    }
  };
</script>
```

### Running without GTM

If a site has the Google tag (`gtag.js`) directly and no GTM container,
the widget can fire the conversion itself — add the Ads IDs and skip
steps 2–5 entirely:

```js
tracking: {
  googleAds: {
    conversionId: 'AW-XXXXXXXXX',
    conversionLabel: 'AbC-D_efGhI'
  }
}
```

The dataLayer events still fire, so you can add GTM later without
changing anything.

---

## Closing the loop: offline conversion import

Everything above tells Google Ads that a *booking* happened. What it
doesn't know is which bookings turned into paid work — and that's the
number worth bidding on. Roughly: a booked appointment and a sold
$14,000 system replacement should not be worth the same to your bidding
algorithm.

The widget now writes the ad click ID into the ServiceTitan job so you
can feed real revenue back to Google:

**Where it lands.** Every job created through the scheduler gets an
attribution block appended to the job **body** (the dispatch board
summary stays clean):

```
--- Marketing Attribution ---
GCLID: Cj0KCQjw...
Source: google
Medium: cpc
Campaign: DFW-AC-Repair
Landing Page: https://lexac.com/ac-repair/?gclid=Cj0KCQjw...
```

**The workflow:**

1. Monthly (or weekly), pull sold jobs from ServiceTitan that were
   created by the scheduler, with their job body and invoice total.
2. Extract the `GCLID:` line from each body.
3. Build the upload sheet: `Google Click ID`, `Conversion Name`,
   `Conversion Time`, `Conversion Value`, `Conversion Currency`.
4. In Google Ads, create a conversion action of type **Import → Other
   data sources or CRM → Track conversions from clicks**, named e.g.
   `Booking Sold`.
5. Upload at Goals → Conversions → **Uploads**.

Bid toward `Booking Sold` and let `Online Booking — Scheduler` stay as a
secondary/observation conversion. That's the setup that stops Google from
optimizing toward cheap tune-up leads at the expense of system
replacements.

A ServiceTitan Custom Field on the job would be tidier than parsing the
body text — if you create one for GCLID, its `typeId` can be wired in
next to the existing referral-code field in `api/_booking-core.js`.

---

## Notes and caveats

- **Consent Mode.** If the sites run a consent banner, conversions from
  visitors who decline analytics cookies will be modeled rather than
  observed. The dataLayer events still fire; GTM decides what to send.
- **Cross-domain.** The widget renders inline in the host page's DOM
  (not an iframe), so the ad click and the booking share one domain and
  one cookie jar. No cross-domain configuration is needed. The
  `scheduler-mu-three.vercel.app` preview page is a separate domain and
  is only for testing — don't run ads to it.
- **Ad blockers** stop some share of GTM loads. Booking counts in
  ServiceTitan will always exceed conversions in Google Ads; a 10–20%
  gap is normal, not a broken tag.
- **Each brand needs its own setup.** LEX, ETX, and Lyons are separate
  sites — separate GTM containers and separate conversion actions. The
  `scheduler_brand` field distinguishes them if they ever share one.
- **Nothing here can break a booking.** Every tracking call is wrapped
  in a try/catch and fails silently. If GTM is absent, the events simply
  queue on `window.dataLayer` and no one reads them.

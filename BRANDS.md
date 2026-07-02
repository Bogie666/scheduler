# Multi-Brand Scheduler — Lyons & Lex ETX

This one codebase serves **two brands** that share the same ServiceTitan API:

| Brand key | Display name | Notes |
|-----------|--------------|-------|
| `lex-etx` | LEX ETX      | Uses the existing LEX tenant + Business Units. Default brand. |
| `lyons`   | Lyons        | New brand — needs its ServiceTitan IDs + branding filled in.  |

A request picks its brand three ways (first match wins):

1. `brand` field in the widget config (frontend) → sent in the booking body / availability query
2. `?brand=lyons` query param or `brand` body field (API)
3. `X-Brand: lyons` header (API)

No brand supplied → **`lex-etx`** (so existing embeds keep working unchanged).

---

## How it's wired

**Frontend**
- `src/brands.js` — per-brand branding presets (logo, colors, phone, tagline, subtitle).
  Passing `brand: 'lyons'` loads Lyons' preset; any value you also pass explicitly overrides it.
- `src/index.jsx` / `src/members-index.jsx` — merge the preset and forward `brand` to the widget.
- `src/SchedulerWidget.jsx` — sends `brand` on the availability call, member-verify call, and booking payload; all phone copy is now driven by the brand's `phoneNumber`.

**Backend** (`api/`)
- `api/_brands.js` — the brand registry: per-brand tenant, credentials, Job Type / Business Unit maps, campaigns, referral custom field, phone.
- `api/lex-booking.js`, `api/availability.js`, `api/members-verify.js` — resolve the brand per request and use its config. Token cache is per-brand.

---

## Embed snippets

### Lex ETX
```html
<link rel="stylesheet" href="https://scheduler-mu-three.vercel.app/lex-scheduler.css">
<script>
  window.LEXSchedulerConfig = {
    brand: 'lex-etx',
    apiEndpoint: 'https://scheduler-mu-three.vercel.app/api/lex-booking',
    autoButton: true,
    buttonText: 'Book Online',
    position: 'bottom-right'
  };
</script>
<script src="https://scheduler-mu-three.vercel.app/lex-scheduler.iife.js"></script>
```

### Lyons
```html
<link rel="stylesheet" href="https://scheduler-mu-three.vercel.app/lex-scheduler.css">
<script>
  window.LEXSchedulerConfig = {
    brand: 'lyons',
    apiEndpoint: 'https://scheduler-mu-three.vercel.app/api/lex-booking',
    autoButton: true,
    buttonText: 'Book Online',
    position: 'bottom-right'
    // logoUrl / headerColor / phoneNumber etc. fall back to the Lyons preset
    // in src/brands.js — override here per-site if needed.
  };
</script>
<script src="https://scheduler-mu-three.vercel.app/lex-scheduler.iife.js"></script>
```

> Both brands can run from the same Vercel deployment. If you'd rather give each
> brand its own domain, deploy this repo twice and point each domain's embed at
> its own `apiEndpoint` — the `brand` field still selects the ServiceTitan config.

---

## Environment variables (Vercel)

Credentials resolve **brand-specific first, then shared**. If both brands live on the
**same ServiceTitan tenant/app**, just set the shared vars and give Lyons its own IDs
in `api/_brands.js`. If Lyons is a **separate tenant/app**, set the `ST_LYONS_*` vars.

```
# Shared (used by any brand that doesn't override)
ST_TENANT_ID=1498628772
ST_APP_KEY=<app key>
ST_CLIENT_ID=<client id>
ST_CLIENT_SECRET=<client secret>

# Per-brand overrides (optional — only if a brand has its own tenant/app)
ST_LEX_ETX_TENANT_ID=...
ST_LEX_ETX_APP_KEY=...
ST_LEX_ETX_CLIENT_ID=...
ST_LEX_ETX_CLIENT_SECRET=...

ST_LYONS_TENANT_ID=...
ST_LYONS_APP_KEY=...
ST_LYONS_CLIENT_ID=...
ST_LYONS_CLIENT_SECRET=...
```

Env var name = `ST_<BRAND>_<FIELD>` where `<BRAND>` is the uppercased brand key with
`-` → `_` (so `lex-etx` → `LEX_ETX`).

---

## ✅ Fill-in checklist

Search the code for `TODO(Lyons)` and `TODO(Lex ETX)`.

### Lyons — `api/_brands.js` (`LYONS_JOB_TYPE_MAP` + the `lyons` brand def)
- [ ] `defaultTenantId` (or set `ST_LYONS_TENANT_ID`)
- [ ] Credentials — shared, or `ST_LYONS_CLIENT_ID` / `ST_LYONS_CLIENT_SECRET` / `ST_LYONS_APP_KEY`
- [ ] Every `jobTypeId` + `businessUnitId` in `LYONS_JOB_TYPE_MAP` (any left `null` → the API rejects that issue)
- [ ] `campaigns.website` and `campaigns.referral` (or leave `null` — jobs are created without a campaign)
- [ ] `referralFieldTypeId` (only if Lyons uses a referral custom field)
- [ ] `phone`, `state`

### Lyons — `src/brands.js` (`lyons` preset), then rebuild
- [ ] `logoUrl`, `headerColor`, `buttonColor`, `phoneNumber`, `tagline`, `headerSubtitle`

### Lex ETX
- [ ] Confirm ETX shares the current tenant + Business Units in `LEX_JOB_TYPE_MAP`. If ETX runs its own Business Units, give it its own map + `ST_LEX_ETX_*` vars.
- [ ] Confirm the support `phone` for ETX in both `api/_brands.js` and `src/brands.js`.

After editing `src/brands.js` (or any frontend file): `npm run build` and redeploy.
Backend-only edits (`api/*`) don't need a rebuild.

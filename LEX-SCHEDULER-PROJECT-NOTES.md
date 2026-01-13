# LEX Online Scheduler - Project Notes

## Project Overview

Building a custom online scheduling widget for LEX Air Conditioning that integrates with ServiceTitan. The widget will be embedded on the WordPress site via a `<script>` tag and allow customers to request HVAC, plumbing, and electrical appointments.

### Business Context
- **Company:** LEX Air Conditioning (3-generation family HVAC business)
- **Location:** Plano, Texas - serves DFW metroplex
- **Services:** Heating, cooling, plumbing, electrical
- **Phone:** (972) 888-9669

---

## What's Been Built

### Frontend Widget (Complete)
A React-based embeddable widget with:

- **4-step booking flow:**
  1. Service selection (HVAC/Plumbing/Electrical) + issue type
  2. Additional details (optional textarea)
  3. Contact info (name, phone, email, address)
  4. Date/time preference selection

- **Features:**
  - Mobile responsive (slides up from bottom on mobile)
  - Floating "Book Online" button (configurable position)
  - Clean, professional design with LEX branding colors
  - Form validation
  - Success confirmation with summary

- **Tech Stack:**
  - React 18
  - Vite (build tool)
  - CSS (no external dependencies)
  - Outputs as single IIFE bundle for easy embedding

### File Structure
```
lex-scheduler/
├── dist/
│   ├── lex-scheduler.iife.js    # Built widget (153KB)
│   └── lex-scheduler.css        # Built styles (8.5KB)
├── src/
│   ├── index.jsx                # Entry point & initialization
│   ├── SchedulerWidget.jsx      # Main React component
│   └── SchedulerWidget.css      # Styles
├── index.html                   # Dev preview page
├── package.json
└── vite.config.js
```

### WordPress Installation
```html
<link rel="stylesheet" href="https://your-cdn.com/lex-scheduler.css">
<script>
  window.LEXSchedulerConfig = {
    apiEndpoint: 'https://your-backend.com/api/booking',
    autoButton: true,
    buttonText: 'Book Online',
    position: 'bottom-right'
  };
</script>
<script src="https://your-cdn.com/lex-scheduler.iife.js"></script>
```

### Configuration Options
```javascript
{
  apiEndpoint: '/api/lex-booking',     // Backend URL (required)
  autoButton: true,                     // Show floating button
  buttonText: 'Book Online',            // Button text
  position: 'bottom-right',             // or 'bottom-left'
  buttonSelector: '.book-now-btn'       // Use existing buttons instead
}
```

### JavaScript API
```javascript
LEXScheduler.open();   // Open the modal
LEXScheduler.close();  // Close the modal
LEXScheduler.toggle(); // Toggle open/closed
```

---

## What Needs to Be Built

### Backend API Server
The frontend POSTs booking data to `apiEndpoint`. Need a backend that:

1. **Receives booking requests** from the widget
2. **Authenticates with ServiceTitan** (OAuth 2.0)
3. **Creates/looks up customer and location** in ServiceTitan
4. **Submits booking** via ServiceTitan Bookings API
5. **Returns confirmation** to the frontend

### Booking Request Payload (from frontend)
```json
{
  "serviceType": "hvac",
  "issue": "ac-not-cooling",
  "issueDetails": "Unit is blowing warm air, started yesterday",
  "firstName": "John",
  "lastName": "Smith",
  "phone": "(214) 555-1234",
  "email": "john@example.com",
  "address": "123 Main St",
  "city": "Plano",
  "zip": "75024",
  "preferredDate": "2025-01-15",
  "preferredTime": "morning"
}
```

---

## ServiceTitan API Details

### Credentials (stored securely - do not commit)
- **App ID:** `rlaxwjh55wy6t`
- **Tenant ID:** `1498628772`
- **Booking Provider ID:** `346456684`
- **Client ID:** (stored separately - ask Ryan)
- **Client Secret:** (stored separately - ask Ryan)

### Authentication Flow
ServiceTitan uses OAuth 2.0 Client Credentials flow:

```
POST https://auth.servicetitan.io/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={CLIENT_ID}
&client_secret={CLIENT_SECRET}
```

Returns access token valid for ~1 hour.

### Key API Endpoints

#### 1. Create Booking (Primary Approach)
```
POST https://api.servicetitan.io/crm/v2/tenant/{tenant_id}/booking-provider/{booking_provider_id}/bookings
Authorization: Bearer {access_token}
```

Request body:
```json
{
  "source": "Online",
  "name": "John Smith",
  "address": {
    "street": "123 Main St",
    "city": "Plano",
    "state": "TX",
    "zip": "75024",
    "country": "US"
  },
  "contacts": [
    {
      "type": "Phone",
      "value": "2145551234"
    },
    {
      "type": "Email", 
      "value": "john@example.com"
    }
  ],
  "summary": "AC Not Cooling - Unit is blowing warm air, started yesterday",
  "isFirstTimeClient": null,
  "priority": "Normal"
}
```

This creates a booking that appears on the Calls > Bookings screen for CSRs to follow up.

#### 2. Alternative: Direct Job Creation
More complex, requires:
1. Look up or create Customer (`/crm/v2/tenant/{id}/customers`)
2. Look up or create Location (`/crm/v2/tenant/{id}/locations`)
3. Create Job (`/jpm/v2/tenant/{id}/jobs`)

Use this approach only if you want appointments to go directly to the dispatch board without CSR review.

### Service Type to Business Unit Mapping
You'll need to map the widget's service types to ServiceTitan Business Unit IDs:
- `hvac` → (get Business Unit ID from ServiceTitan)
- `plumbing` → (get Business Unit ID from ServiceTitan)
- `electrical` → (get Business Unit ID from ServiceTitan)

### API Documentation
- Developer Portal: https://developer.servicetitan.io/
- CRM/Bookings: https://developer.servicetitan.io/docs/api-resources-crm/
- Job Planning: https://developer.servicetitan.io/docs/api-resources-job-planning/
- Dispatch/Capacity: https://developer.servicetitan.io/docs/api-resources-dispatch/

---

## Backend Implementation Options

### Option A: Node.js/Express Server
Best if you want to host on a VPS or dedicated server.

```javascript
// Basic structure
const express = require('express');
const app = express();

app.post('/api/booking', async (req, res) => {
  // 1. Get access token
  // 2. Format booking data
  // 3. POST to ServiceTitan
  // 4. Return result
});
```

### Option B: Serverless (Cloudflare Workers, Vercel, AWS Lambda)
Best for low-maintenance, auto-scaling, pay-per-use.

### Option C: WordPress Plugin
Could build as a WP plugin with REST API endpoint, keeps everything in one place.

---

## Environment Variables Needed
```
SERVICETITAN_APP_ID=rlaxwjh55wy6t
SERVICETITAN_TENANT_ID=1498628772
SERVICETITAN_BOOKING_PROVIDER_ID=346456684
SERVICETITAN_CLIENT_ID=cid.lzjt83nc2znci9mfszmugplm6
SERVICETITAN_CLIENT_SECRET=<secret>
```

---

## Deployment Checklist

### Frontend
- [ ] Host built JS/CSS files (CDN, S3, or WP media library)
- [ ] Update `apiEndpoint` in config to point to backend
- [ ] Add script tag to WordPress theme footer
- [ ] Test on mobile devices

### Backend
- [ ] Set up server/function with environment variables
- [ ] Implement token caching (tokens valid ~1 hour)
- [ ] Add error handling and logging
- [ ] Set up CORS for your domain
- [ ] Test end-to-end booking flow
- [ ] Verify bookings appear in ServiceTitan

---

## Issue Type Mappings

The widget uses these issue IDs - map to ServiceTitan call reasons or job types as needed:

### HVAC
- `ac-not-cooling` → AC Not Cooling
- `heater-not-working` → Heater Not Working
- `hvac-maintenance` → Maintenance / Tune-Up
- `new-system` → New System Estimate
- `strange-noises` → Strange Noises
- `hvac-other` → Other HVAC Issue

### Plumbing
- `leak` → Leak / Dripping
- `clogged-drain` → Clogged Drain
- `water-heater` → Water Heater Issue
- `no-hot-water` → No Hot Water
- `toilet-issue` → Toilet Problem
- `plumbing-other` → Other Plumbing Issue

### Electrical
- `outlet-not-working` → Outlet Not Working
- `breaker-tripping` → Breaker Keeps Tripping
- `lighting-issue` → Lighting Issue
- `panel-upgrade` → Panel Upgrade
- `ceiling-fan` → Ceiling Fan Install
- `electrical-other` → Other Electrical Issue

---

## Time Slot Mappings

- `morning` → 8am - 12pm
- `afternoon` → 12pm - 5pm
- `first-available` → ASAP

---

## Notes & Considerations

1. **Rate Limiting:** ServiceTitan has API rate limits. Implement retries with exponential backoff.

2. **Token Caching:** Cache access tokens and refresh before expiry to avoid unnecessary auth calls.

3. **Error Handling:** The widget shows a generic error message. Backend should log detailed errors for debugging.

4. **Spam Prevention:** Consider adding reCAPTCHA or honeypot fields before going live.

5. **Email Notifications:** ServiceTitan may handle these, or you could add your own confirmation emails.

6. **Analytics:** Consider tracking form starts, completions, and drop-off points.

7. **Scheduling Pro:** If LEX has Scheduling Pro add-on, there's a more robust API with real-time availability. Worth investigating.

---

## Quick Start for Claude Code

1. Clone/download the source zip
2. `cd lex-scheduler && npm install`
3. `npm run dev` - starts dev server for frontend testing
4. Create backend in `/api` or separate repo
5. Update `apiEndpoint` and test end-to-end

# CDACC LEAKAGES

A serverless web platform for KASNEB students to access revision papers, premium study materials, and VIP content.

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Auth**: Firebase Authentication
- **Database**: Cloud Firestore
- **Storage**: Firebase Storage
- **Payments**: PayHero Kenya (M-Pesa STK Push via Cloudflare Worker)
- **Hosting**: Cloudflare Pages + Firebase Hosting
- **Backend**: Cloudflare Worker (payhero-proxy)

## Architecture

```
Student → Cloudflare Pages (frontend)
  → Cloudflare Worker (PayHero proxy)
    → PayHero API (STK Push)
      → M-Pesa
    → Callback → Worker → Firestore
  → Frontend polls Worker /verify-payment
  → Access granted
```

## Setup

### Firebase
1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication (Email/Password)
3. Enable Cloud Firestore
4. Enable Firebase Storage
5. Copy your Firebase config into `js/firebase-config.js`

### PayHero Worker
1. Create a PayHero account at https://app.payhero.co.ke
2. Generate an API Key in PayHero (API Keys menu)
3. Create a Payment Channel for M-Pesa
4. Deploy the Worker:

```bash
cd workers/payhero-proxy
npm install
npx wrangler login
npx wrangler secret put PAYHERO_API_TOKEN
npx wrangler secret put PAYHERO_CHANNEL_ID
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
npx wrangler deploy
```

5. In PayHero dashboard, set your channel's callback URL to:
```
https://revisionhub-payhero-proxy.YOUR_SUBDOMAIN.workers.dev/payhero-callback
```

### Deploy Frontend
```bash
# Firebase Hosting
firebase deploy --only hosting

# OR Cloudflare Pages
# Push to GitHub, connect repo, output dir: /
```

## Configuration

### Worker URL
In `premium.html` and `vip.html`, replace the WORKER_URL:
```javascript
const WORKER_URL = 'https://revisionhub-payhero-proxy.YOUR_SUBDOMAIN.workers.dev';
```

### Admin Access
Set your admin email in `js/firebase-config.js`:
```javascript
const ADMIN_EMAIL = "your-email@example.com";
```

Also set `role: 'admin'` in your Firestore user document.

### Worker Secrets
| Secret | Description |
|--------|-------------|
| `PAYHERO_API_TOKEN` | Base64 Basic auth token from PayHero |
| `PAYHERO_CHANNEL_ID` | PayHero M-Pesa channel ID |
| `FIREBASE_SERVICE_ACCOUNT` | JSON string of Firebase service account |

## File Structure

```
revision-hub/
├── index.html              # Landing page
├── login.html              # Login
├── register.html           # Registration
├── forgot.html             # Password reset
├── dashboard.html          # Student dashboard
├── papers.html             # Browse free papers
├── premium.html            # Premium papers (M-Pesa)
├── vip.html                # VIP membership
├── downloads.html          # Download history
├── profile.html            # User profile
├── css/style.css           # Full UI
├── js/firebase-config.js   # Firebase init
├── js/app.js               # Navbar, theme, auth
├── admin/
│   ├── dashboard.html      # Admin overview
│   ├── upload.html         # Upload papers
│   ├── papers.html         # Manage papers
│   ├── students.html       # View students
│   └── payments.html       # Payment history
└── workers/payhero-proxy/  # Cloudflare Worker
    ├── wrangler.jsonc
    ├── package.json
    └── src/index.ts
```

## Payment Flow

1. Student clicks "Unlock" on a premium paper or VIP
2. Frontend creates a pending payment record in Firestore
3. Frontend calls Worker with phone + amount + reference
4. Worker sends STK Push via PayHero API
5. Student enters M-Pesa PIN on phone
6. PayHero sends callback to Worker
7. Worker updates Firestore (payment status + VIP activation)
8. Frontend polls Worker's /verify-payment endpoint
9. On success, access is granted

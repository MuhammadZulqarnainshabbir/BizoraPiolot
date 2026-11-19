# Bizora Pilot — mobile app (Expo + React Native + TypeScript)

The shop owner's and employees' portal as an iPhone/Android app, talking to the same API as the
web app (`backend/`). Runs in **Expo Go** on a physical phone with no native build.

## What it does

Everything the web app does, for both roles. The server decides what each role may do
(`backend/src/config/permissions.js`); the app only shows the allowed actions.

| Area | Owner | Employee |
|---|---|---|
| Sign in | Email + password, registration, forgot password | Shop code + employee ID + password; forced password change for temporary passwords. A **manager** (an employee the owner promoted) signs in the same way and gets the shop-wide dashboard, every sale, the team's performance and whatever else the owner has allowed; the owner promotes, demotes and sets permissions on the web Shop profile page |
| Home | Stock and sales summary, overdue installments, team performance, shortcuts | Own sales today / this month, units added, shop stock |
| Inventory | Every unit (status chips, search, "added by", sort, infinite scroll), stock by product, add stock (new or existing product, categories from the API, one serial per line), unit details with edit/delete (reason logged) | Same lists and add stock; no cost prices, no edit/delete |
| Selling | Full price, installment (schedule preview mirrors the server's rounding) | Same |
| Sales | Full-price sales with day/week/month totals, installment agreements (status filter incl. overdue), history, CSV export via the share sheet, cancel/refund with reason | Own sales only |
| Installments | Schedule, payments, record payment, cancel agreement | Read-only |
| Receipts | "Share receipt (PDF)" on sale, agreement and payment screens and right after a sale: the server-generated PDF opens in the share sheet (save to Files, AirDrop, WhatsApp, print). NTN, STRN and receipt terms are set on the Shop profile tab | Same for their own sales |
| Customers | Searchable list, add/edit (name, phone, CNIC, address, notes), CNIC pictures taken with the camera or chosen from the library, purchase history and installment balances, delete when unused; sale forms link to an existing customer or create one | Same, except delete; sees only the sales they made on a customer's page |
| Account | Shop profile, time zone, employee login link / shop ID, employees (create, edit, reset password, remove) | Change password |
| Session | Same rules as the web: token renewed while you touch the screen, "Are you still there?" dialog before an idle sign-out, "session ending" warning before the maximum length | Same |
| Language | English / اردو, remembered on the device (translations shared with the web app) | Same |

## Run it on your iPhone with Expo Go

1. **Install Expo Go** from the App Store on the iPhone.
2. **Start the API** (MongoDB replica set required, see the root README):
   ```bash
   cd backend
   npm run dev
   ```
   It must listen on all interfaces (Express does by default) and Windows Firewall must allow
   inbound TCP 3000 and 8081 on your current network. If in doubt (elevated PowerShell):
   ```powershell
   New-NetFirewallRule -DisplayName "Bizora API 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
   New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow
   ```
3. **Start the app** (second terminal):
   ```bash
   cd mobile
   npm install
   npm start
   ```
4. **Open it on the phone**: with the phone on the same Wi-Fi as the computer, scan the QR code
   with the iPhone Camera (it opens in Expo Go). If the networks differ or the LAN blocks
   device-to-device traffic, use `npm run tunnel` instead and scan that QR code.

### Which API address does the app use?

In this order:

1. A server address saved in the app (landing page → the address at the bottom → **Change**).
2. `EXPO_PUBLIC_API_URL` in `mobile/.env` (copy `.env.example`).
3. **Automatic**: the computer that runs `npm start`, port 3000 — i.e. `http://<your-PC-IP>:3000/api/v1`.
   This is right for `npm run dev` in `backend/` with the phone on the same Wi-Fi.

The server screen has a **Test connection** button (it calls `/api/health`). When Metro runs in
tunnel mode the automatic address can't be derived, so set the address explicitly in that case
(your PC's LAN IP, `ipconfig`).

CORS doesn't apply to the app (native requests send no `Origin`), so `CLIENT_ORIGIN` in
`backend/.env` can stay as it is.

### Employee sign-in on a phone

The web app's employee login lives at `/<shop-slug>/<shopId>/employee/login`. In the app, the
employee pastes that link (or just the shop ID, shown on the owner's Shop profile tab) once;
the shop is remembered on the phone afterwards.

## Project layout

```
mobile/
  src/app/                      Expo Router routes (file = screen, _layout = navigator)
    _layout.tsx                 providers; root stack with the two groups below
    (auth)/_layout.tsx          signed-out group (redirects to /home when signed in)
    (auth)/index.tsx, login.tsx, register.tsx, forgot-password.tsx, employee-login.tsx, server.tsx
    (app)/_layout.tsx           tabs: Home · Inventory · Sales · Customers · Account (redirects to / when signed out)
    (app)/home.tsx              owner overview / employee summary (the route is /home so it never clashes with the landing page at /)
    (app)/inventory/…           units, products, add, units/[unitId], sell/full-price/[unitId], sell/installment/[unitId]
    (app)/sales/…               lists, [id] (sale), installments/[id] (agreement)
    (app)/customers/…           list, new, [id] (details + CNIC pictures + history), [id]/edit
    (app)/account/…             profile/account, password, employees
  src/api/                      client.ts (fetch wrapper, base URL, token), endpoints.ts (typed API), models.ts
  src/auth/AuthContext.tsx      session (owner/employee), permissions, idle/max session timer, secure token storage
  src/i18n/                     I18nContext.tsx (t(), money, dates) + ur.ts (copied from the web app)
  src/hooks/                    useLoad (one resource), usePagedList (search/sort/paging), useFormat
  src/ui/                       Screen, Button, Field, Select, dialogs (confirm, session warning, action sheet), primitives
  src/utils/                    dates (schedule maths), forms (money/serial parsing), labels (status labels and colours)
```

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Dev server (LAN); scan the QR with Expo Go |
| `npm run tunnel` | Dev server through an Expo tunnel (phone on another network) |
| `npm run typecheck` | `tsc --noEmit` |
| `npx expo-doctor` | Checks dependency versions against the Expo SDK |
| `npm run web` | Runs the app in a browser (handy for quick checks; needs the API started with `CLIENT_ORIGIN=http://localhost:8081`) |

## Notes

- Tokens are kept in the iOS keychain (`expo-secure-store`); the profile and session times in
  AsyncStorage. Relaunching the app restores the session; relaunching doesn't count as activity.
- The password-reset email links to the web app; the app only sends the email.
- Everything in Expo Go uses only modules bundled with Expo Go, so no development build is needed.
  To ship to the App Store later: `npx eas-cli build --platform ios`.
- Keep `src/i18n/ur.ts` in sync with `frontend/src/app/core/i18n/ur.ts` when the web app's
  translations change (the app has a few strings of its own; untranslated text falls back to English).

## Shop suspended by the platform
If Bizora suspends, deactivates or has not yet approved a shop, the API answers every request with 403 and a code starting with SHOP_. The app treats that like an ended session: it signs out and shows the reason on the login screen. No platform-admin screens exist in the mobile app by design.

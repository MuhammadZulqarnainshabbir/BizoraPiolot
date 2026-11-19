# Bizora Pilot — MEAN shop owner authentication starter

Angular 19 + Express + MongoDB shop-owner landing page, registration, login and protected dashboard.

## Prerequisites
- Node.js 20.11+ (Node 22 LTS recommended)
- npm
- MongoDB running locally, or MongoDB Atlas connection string

## Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env, especially JWT_SECRET and MONGO_URI
npm run dev
```
On Windows PowerShell use `Copy-Item .env.example .env` instead of `cp`.
API: http://localhost:3000/api/health

## Frontend (in a second terminal)
```bash
cd frontend
npm install
npm start
```
Open http://localhost:4200

## API routes
- POST /api/v1/auth/register-shop
- POST /api/v1/auth/login
- Registration creates the shop in MongoDB but does not sign it in; log in afterward. Login checks the saved account and password in MongoDB before issuing a token.
- GET /api/v1/auth/me (Authorization: Bearer <token>)

### Registration JSON
```json
{"shopName":"Test Shop","ownerName":"Test Owner","email":"test1@example.com","phone":"+491234567890","address":"Munich, Germany","password":"TestPassword123!","confirmPassword":"TestPassword123!"}
```

## Navigation bar
`frontend/src/app/core/nav/` holds the site-wide bar. Its rules are in `nav-config.ts` (`buildNav`), the one place to change what it shows:

| Who / where | Bizora Pilot logo | Home | Features | Also shows |
|---|---|---|---|---|
| Signed out | Landing page | Landing page | Landing page `#features` | Language, Login, Register |
| Shop owner signed in (any page) | Shop dashboard (`/partnerdashboard`), tagged "Partner portal" | Dashboard overview | Overview `#shop-management` | Inventory search (serial or product), Language, Log out |
| Employee signed in | Their shop's employee portal, tagged "Partner portal" | My summary | Its `#shop-management` quick actions | Language, Log out |
| Shop's employee login link | Landing page | — | — | Language only |

The shop owner's portal lives at `/partnerdashboard`; the employee portal at `/<slug>/<shopId>/employee`. Both contain the same inventory and sales pages (`inventory`, `inventory/add`, `inventory/products`, `inventory/units/:id`, `sell/full-price/:unitId`, `sell/installment/:unitId`, `sales/full-price`, `sales/installments`, `sales/installments/:id`, `sales/history`, `sales/:id`), each showing only what the signed-in role may do. Old `/dashboard` and `/partnerdashboard/sales` links redirect.

## Session expiry
Both dashboards sign out automatically:

| | Shop dashboard (owner) | Employee dashboard |
|---|---|---|
| After inactivity | 30 minutes (`OWNER_IDLE_MINUTES`) | 15 minutes (`EMPLOYEE_IDLE_MINUTES`) |
| Maximum session length | 12 hours (`OWNER_MAX_HOURS`) | 12 hours (`EMPLOYEE_MAX_HOURS`) |

- Set these in `backend/.env` (decimals allowed). The server enforces them: tokens last only for the inactivity limit and are renewed via `POST /api/v1/auth/refresh` or `POST /api/v1/employee/refresh` while the user is active (mouse, keyboard, touch or scroll). Renewal never goes past the maximum session length.
- Two minutes before an inactivity sign-out, a dialog asks "Are you still there?" with a countdown and a **Stay signed in** button. Five minutes before the maximum length, a non-extendable "Your session is ending" warning appears.
- When a session ends, or the server rejects a token as expired, the user goes to the owner login page or the shop's employee login link with "Your session expired. Please log in again."
- Reloading a page keeps the session's original expiry. Reloading doesn't count as activity, so it can't keep an idle session alive.

## Languages (English / اردو)
- Every page has an English / اردو switch. Changing it updates every word on screen immediately, with no reload, including messages already shown. Urdu also switches the layout to right-to-left. The choice is remembered in the browser.
- Text is written in English in the code and translated at display time. Urdu lives in `frontend/src/app/core/i18n/ur.ts`, keyed by the English text. API messages are translated in the browser too.
- In templates use `{{ 'Text' | t }}`, `{{ 'Hello {name}' | t:{ name: x } }}`, `| tDate:'medium'` and `| tMoney`. In TypeScript, wrap messages in `tk('Text')` or `msg('Text {x}', { x })`.
- Run `npm run i18n:check` in `frontend/` after changing any visible text. It fails if a string has no Urdu translation, if `{placeholders}` differ, or if a template contains text that isn't translated.
- User-entered data (product, shop and people names) is shown as typed.
- Prices are in Pakistani rupees: "Rs 195,000" in English, "195,000 روپے" in Urdu. Paisa are shown only when an amount has them. Formatting lives in the `tMoney` pipe (`frontend/src/app/core/i18n/i18n.pipes.ts`).

## Product categories
- Products are filed under a category and sub-category picked from dropdowns (13 categories, 37 sub-categories, taken from the Subhan Electronics product list).
- The list lives in `backend/src/config/productCategories.js`. Edit it there; the frontend loads it from `GET /api/v1/categories` (owner token).
- Creating a product requires a category and sub-category pair from the list. Products created before the list existed keep their old free-text category and can still be edited; changing it means choosing from the list.

## MongoDB must be a replica set
Sales, payments and corrections run in MongoDB transactions, so the server refuses to start against a standalone MongoDB. Atlas clusters are already replica sets. For a local Windows MongoDB service:
1. In `C:\Program Files\MongoDB\Server\<version>\bin\mongod.cfg` add
   ```yaml
   replication:
     replSetName: rs0
   ```
2. Restart the service (elevated PowerShell): `Restart-Service MongoDB`
3. Once: `mongosh --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] })"`

`MONGO_URI=mongodb://127.0.0.1:27017/electrohub` keeps working (add `?directConnection=true` if the driver can't find the set).

## Inventory: one record per physical unit
- **Products** are the catalog (name, brand, model, category, sub-category, description, image links; code `P-0001`). **Inventory units** are the physical items, each with its own **serial number**, purchase and selling price, supplier, status and who added it.
- Serial numbers are required and unique within a shop, compared ignoring case and spaces (`sn 01` = `SN01`). Uniqueness is enforced by a database index, so it also holds under concurrent requests. Different shops may use the same serial.
- Unit status: `AVAILABLE` → `SOLD_FULL_PRICE` or `SOLD_INSTALLMENT`, changed only by recording a sale ("Mark as sold"). Refunding or cancelling a sale does **not** put the unit back in stock.
- A unit can be sold once: the status change and the sale are written in one transaction with a conditional update, so two people selling the same unit at the same moment get one success and one "This unit has already been sold".

## Who can do what (enforced by the API)
Three access levels. An employee account's level is its `accessRole` (`employee` or `manager`); the owner is the shop account itself. The `role` field on an employee is just the job title.

| | Owner | Manager (default) | Employee |
|---|---|---|---|
| Add stock, view inventory and serial numbers | ✓ | ✓ | ✓ |
| Edit product catalog details | ✓ | ✓ · | — |
| See purchase prices / cost values | ✓ | — · | — |
| Correct or delete an available unit (reason logged) | ✓ | — · | — |
| Record full-price and installment sales | ✓ | ✓ | ✓ |
| See sales | whole shop | whole shop · | own sales only |
| Shop dashboard (stock, sales totals, team performance) and team list | ✓ | ✓ · | own summary only |
| Record installment payments | ✓ | — · | — (read-only) |
| Cancel / refund sales (reason required, audit-logged) | ✓ | — · | — |
| CSV export | ✓ | — · | — |
| Customers: view, add, edit, ID pictures | ✓ | ✓ | ✓ |
| Delete customers | ✓ | — · | — |
| Create / edit / deactivate employees, promote or demote managers, set manager permissions, shop settings | ✓ | — | — |

`·` = the owner can switch this on or off per manager (**grantable**). Everything in the last row is owner-only and can never be granted. Managers and employees sign in the same way (shop code or login link + employee ID + password) and have the same session limits (15 min idle, 12 h max).

- Permissions are resolved from the database on every request, so promoting, demoting, deactivating or changing a manager's permissions takes effect on their very next request; `POST /employee/refresh` and `GET /employee/me` return the current role and permissions so the apps update without a new login. Deactivation and password resets also bump the token version, which ends open sessions outright.
- Owner endpoints: `GET /employees/managers`, `POST /employees/:id/promote-manager` `{ reason?, permissionOverrides? }`, `POST /employees/:id/demote-manager` `{ reason? }` (overrides cleared), `GET /employees/:id/permissions` (defaults, grantable list, overrides, effective permissions, change history), `PATCH /employees/:id/permissions` `{ permissionOverrides: { allow: [...], deny: [...] }, reason? }`, `GET /employees/permissions/registry`. `POST /employees` accepts `accessRole: 'manager'` to create a manager directly. Unknown or non-grantable keys are rejected. Every change is audit-logged (`EMPLOYEE_PROMOTED`, `MANAGER_DEMOTED`, `MANAGER_PERMISSIONS_CHANGED`, `MANAGER_CREATED`, `EMPLOYEE_DEACTIVATED`/`ACTIVATED`).
- Migration: existing employees get `accessRole: 'employee'` on the next server start (`backfillAccessRoles`); nothing else changes, and unsetting the field reverts it.

The shop and the user always come from the login token; a `shopId`, `employeeId` or role sent by the client is ignored. Records of another shop answer "not found". The permission list is `backend/src/config/permissions.js`; login responses include the user's permissions so the UI only shows allowed actions.

## Customers
- One record per customer per shop: code `C-0001`, name, phone, CNIC (13 digits, unique within the shop when known), address, notes, and up to 4 pictures of the ID card (JPEG/PNG/WebP, ≤ 3 MB each). Pictures are stored in MongoDB (`customer_documents`) and served only through the authenticated API, never as public files.
- Owners and employees can add and edit customers (`customers.manage`); only the owner can delete one, and only if no sale refers to it.
- Sales link to customers: send `customerId` (an existing record) or inline `customer` details. Installment sales always get a record (matched by CNIC, then phone digits; created otherwise); a full-price sale with a name and phone does too, a walk-in sale has none. Sales keep their own snapshot of the details at sale time.
- API (`/api/v1/customers`): `GET` (page/search by name, phone digits, CNIC, code, address), `POST`, `GET /:id` (record + purchase history + totals; employees see only their own sales), `PATCH /:id`, `DELETE /:id` *owner* (`{ reason }`), `POST /:id/documents` `{ kind: CNIC_FRONT|CNIC_BACK|OTHER, image: "data:image/jpeg;base64,…" }`, `GET /:id/documents/:docId` (returns a data URL), `DELETE /:id/documents/:docId`. Sales lists accept `customerId`.

## Receipts (PDF)
- Every sale has a downloadable PDF receipt, generated on the server (`backend/src/services/receiptService.js`, pdfkit) so each copy is identical: `GET /api/v1/sales/:id/receipt.pdf` (owner, or the employee who made the sale). A full-price sale gets a **sale receipt**; an installment sale gets an **installment agreement & receipt** with the plan, payment schedule and payments received. Each installment payment has its own receipt: `GET /api/v1/installments/:id/payments/:paymentId/receipt.pdf`.
- Contents: the business (shop name, address, phone, email, NTN and STRN when set), a unique receipt number (the sale number; payments use `IA-000001/P02`) and date in the shop's time zone, the selling agent (owner, or employee name, ID and role), the buyer (name, phone, CNIC, address), the goods (description, brand, model, category, serial number, product code), list price, discount, amount, payment method, terms, and signature lines. Cancelled and refunded sales are watermarked.
- The owner sets the **NTN**, **STRN** and the shop's own **receipt terms** on Shop profile (`PATCH /api/v1/auth/shop-settings` `{ ntn?, strn?, receiptNote? }`). Default terms cover returns/warranty; installment receipts add the installment conditions.
- Receipts are in English (Noto Sans); names typed in Urdu are printed in Urdu script (Noto Sans Arabic). On the web, buttons download the file; in the mobile app they open the share sheet (save to Files, AirDrop, WhatsApp, print).

## Installments
- Total installment price, down payment (must be less than the total), 1–120 installments, **monthly**, **weekly** or **custom** (every N days), optional first due date. Amounts are integer paisa; the last installment absorbs rounding (Rs 100,000 / 3 → 33,333.33 + 33,333.33 + 33,333.34).
- Status: Active, Completed (fully paid), Cancelled, and Overdue (active with a past-due installment, worked out from today's date in the shop's timezone).
- Payments are applied to the oldest unpaid installment first. Overpaying, paying a completed or cancelled agreement, is rejected, also under concurrent requests.

## Time zone
Times are stored in UTC. Each shop has a time zone (default `Asia/Karachi`, changeable on Shop profile); dates, "today / this week / this month" totals and installment due dates use it.

## Inventory, sales and dashboard API
All under `/api/v1`, with an owner or employee `Authorization: Bearer` token unless marked *owner*. Money in requests is in rupees (`120000`, `33333.33`); in responses it's integer paisa (`…Cents`). Lists take `page`, `limit` (≤100), `search`, `sort`, `order`.
- Products & units: `POST /products` (`{ productId | product: {name, brand, model, category, subCategory, description?, imageUrls?}, serialNumbers: [...], purchasePrice, sellingPrice, supplier? }`), `GET /products`, `GET /products/:id`, `PATCH /products/:id` *owner*, `GET /products/units` (`status`, `productId`, `addedBy=me|owner|<employeeId>`, `needsSerial`, `from`, `to`), `GET /products/units/:id`, `GET /products/units/by-serial/:serial`, `PATCH /products/units/:id` *owner*, `DELETE /products/units/:id` *owner* (`{ reason }`), `GET /products/stock-summary`, `GET /categories`.
- Sales: `POST /sales/full-price` `{ unitId, salePrice, paymentMethod, customer?, note? }`; `POST /sales/installment` `{ unitId, totalPrice, downPayment, installmentCount, frequency: MONTHLY|WEEKLY|CUSTOM, intervalDays?, firstDueDate?, paymentMethod, customer: { name, phone, address?, reference? }, notes? }`; `GET /sales`, `/sales/full-price`, `/sales/installment` (`status` incl. `OVERDUE`), `/sales/my-sales`, `/sales/:id`; *owner*: `POST /sales/:id/cancel`, `POST /sales/:id/refund` (`{ reason }`), `GET /sales/full-price/export`, `GET /sales/installment/export` (CSV). Filters: `soldBy`, `from`, `to` (YYYY-MM-DD, shop time zone), `status`, `type`.
- Installments: `GET /installments/:id`, `GET /installments/:id/payments`, *owner* `POST /installments/:id/payments` `{ amount, method, note? }`.
- Dashboards: *owner* `GET /dashboard/partner/summary`, `/inventory`, `/full-price-sales` (day/week/month series, per employee), `/installment-sales`, `/employees`; employee `GET /dashboard/employee/summary`, `/my-sales`.
- Employees *owner*: `GET|POST /employees`, `PUT|DELETE /employees/:id`, `POST /employees/:id/password`. Shop settings *owner*: `PATCH /auth/shop-settings` `{ timezone }`.
- Errors: `{ message, code?, details? }`, e.g. `409 { code: "ALREADY_SOLD" }`, `DUPLICATE_SERIAL` (with `details.serials`), `SERIAL_PENDING`, `OVERPAYMENT`.
- **Postman:** import `backend/postman/bizora-pilot.postman_collection.json` (45 requests). Set the `baseUrl` variable; the login requests store the tokens.

## Employees
- Owners manage employees from **Shop profile**. Each gets an ID unique within the shop (`EMP-0001`, …) and a temporary password that must be changed at first login.
- The **Role** (job title) is chosen from a dropdown, never typed: the list lives in `backend/src/config/jobRoles.js` (Sales, Senior sales, Cashier, Store manager, Floor supervisor, Stock keeper, Technician, Delivery, Accountant, Receptionist, Other), is served by `GET /api/v1/employees/roles`, and the server refuses any other value. Employees whose title predates the list keep it until edited.
- Each shop has its own employee login link on the Shop profile page: `/<shop-slug>/<shopId>/employee/login`.
- Each shop also has a 6-character **shop code** (e.g. `7K3QM2`, shown on Shop profile) that employees type in the mobile app together with their employee ID and password. `POST /api/v1/employee/login` accepts `{ shopCode, employeeId, password }` as well as `{ shopId, employeeId, password }`; `GET /api/v1/employee/shops/by-code/:code` returns the shop's name. Codes are assigned at registration and backfilled for existing shops on start (`backend/src/services/shopCodes.js`). The mobile app is in `mobile/` (see its README).
- Deactivating, deleting, or resetting an employee's password signs them out immediately.

## Migrating existing data
Earlier versions stored products with a quantity and sales without serial numbers. Convert once (safe to re-run; it skips what's already migrated and never deletes the old collections):
```bash
cd backend
npm run migrate:inventory -- --dry-run   # report only
npm run migrate:inventory
```
Each old item becomes a product plus one unit per item in stock, with a placeholder serial (`LEGACY-P-0001-001`) and unknown purchase price. These show as **Serial needed** in Inventory and can't be sold until the owner enters the real serial number. Old sales, installment plans and payments are copied into the new sales records.

## Tests
All of these need MongoDB running as a replica set (see above); each uses its own throwaway database.

| Command | What it checks |
|---|---|
| `cd backend && npm test` | API tests with Node's test runner (`bizora_pilot_test`): serial uniqueness, permissions, shop isolation, concurrent selling and payments, installment schedules, corrections, dashboards, migration. |
| `cd frontend && npm test` | Unit tests in headless Chrome (Karma/Jasmine): installment schedule maths, serial parsing, money validation, navigation rules, translation. `npm run test:watch` keeps them running while you code. |
| `cd frontend && npm run i18n:check` | Every visible string, including API error messages, has an Urdu translation. |
| `cd frontend && npm run e2e` | Playwright drives the real app in Chrome through both portals: adding stock, selling at full price and on installment, payments, refunds, CSV export, Urdu, phone width. It starts its own API on port 3999 (`bizora_pilot_e2e`) and web app on port 4300, so your development servers are untouched. |
| Postman | `backend/postman/bizora-pilot.postman_collection.json`; CI runs it with newman: `npx newman run postman/bizora-pilot.postman_collection.json --env-var baseUrl=http://localhost:3000/api/v1`. |

## CI/CD (GitHub Actions)
- **CI** (`.github/workflows/ci.yml`) runs on every pull request: API tests + the Postman collection, Urdu check + unit tests + production build (the built app is kept as an artifact), then the end-to-end suite. MongoDB runs as a replica set inside the job.
- **CD** (`.github/workflows/cd.yml`) runs on every push to `main` and on `v*` tags: the full CI first, then it publishes Docker images to the GitHub Container Registry (`ghcr.io/<owner>/bizora-pilot-backend` and `…-frontend`, tagged `latest`, the branch, the git SHA and the version). A tag such as `v1.2.0` also creates a GitHub release with the built web app attached.
- Dependabot opens weekly update PRs for both npm projects and the workflow actions, so CI checks them.

## Running with Docker
```bash
cp .env.example .env        # set JWT_SECRET
docker compose up --build   # MongoDB (replica set) + API + web app
```
Open http://localhost:8080. nginx serves the app and forwards `/api` to the API, so there is one origin and no CORS. The same images CD publishes can be run with `docker compose pull` instead of building locally.

## Development set-up notes
- The web app calls the API at the relative URL `/api/v1`: `ng serve` forwards it to `http://localhost:3000` (`frontend/proxy.conf.json`) and nginx does the same in production. Nothing needs changing when deploying; to use a different API during development, edit the proxy file.
- Set `TRUST_PROXY=1` in the API's environment when it runs behind nginx or a load balancer (docker-compose does), so rate limits apply per client rather than per proxy.

## Password reset email
Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `backend/.env` to enable password reset emails. Reset links expire after one hour and can only be used once. Until SMTP is configured, the forgot-password endpoint returns a service configuration error; reset tokens are never returned by the API.
- POST `/api/v1/auth/forgot-password` with an email address to send a reset link.
- POST `/api/v1/auth/reset-password` with the link token, new password, and confirmation to change the password.

## Platform console (Master Admin)
Bizora's own administration area, for Bizora staff rather than shop owners. It is a separate security domain: separate accounts (`platform_admins`), a separate sign-in (`POST /api/v1/platform-admin/auth/login`), tokens with the `platform` audience that every shop endpoint rejects, and a deny-by-default permission registry (`backend/src/config/platformPermissions.js`). Shop tokens (owner, manager, employee) are rejected by every platform endpoint. Web only: `/platform-admin` (lazy-loaded Angular area with its own layout); nothing was added to the mobile app.

### Provisioning the first administrator
There is no default administrator and no password in the source. Create the first `SUPER_ADMIN` with the CLI; the password comes from the environment or is asked for in the terminal (never echoed, never logged):
```bash
cd backend
PLATFORM_ADMIN_PASSWORD='a-temporary-Password-12' npm run platform-admin:create -- --email you@bizora.pk --name "Your Name" --role SUPER_ADMIN
```
On Windows PowerShell: `$env:PLATFORM_ADMIN_PASSWORD='a-temporary-Password-12'; npm run platform-admin:create -- --email you@bizora.pk --name "Your Name"`. Then open `http://localhost:4200/platform-admin/login`. The first sign-in is a set-up-only session: the temporary password must be replaced (12–128 characters, upper and lower case, a digit) and, when `PLATFORM_ADMIN_REQUIRE_MFA=1`, an authenticator app enrolled, before any other page works. Further administrators are created in the console (Administrators), which shows a random temporary password once.

### Roles and permissions
| Role | May |
| --- | --- |
| SUPER_ADMIN | Everything: shop lifecycle, administrators, plans, subscriptions, feature overrides, settings, audit log |
| SUPPORT_ADMIN | Read shops and diagnostics, plans, subscriptions, features, analytics, health |
| FINANCE_ADMIN | Read shops and plans; assign subscriptions; billing summaries, analytics |

Every endpoint names the permission it needs (`backend/src/routes/platformAdminRoutes.js`). Platform admins never see customer records, CNIC pictures, cost prices or individual sales: the shop pages show counts only, and there is no platform route into inventory, sales or customers.

### Shop lifecycle
Shops have a `status`: `PENDING` (registered, awaiting approval when the platform setting is `manual`), `ACTIVE`, `SUSPENDED`, `DEACTIVATED`. Only `ACTIVE` shops can sign in or call any shop API (owner, manager or employee); existing sessions are refused too, with `403 { code: 'SHOP_SUSPENDED' | 'SHOP_DEACTIVATED' | 'SHOP_PENDING' }`, and the web and mobile apps sign out with the reason. Records are never deleted; every transition needs a reason and is written to `platform_audit_logs` with before/after values. Transitions are conditional updates, so two administrators acting at once get one success and one 409. Existing shops are backfilled to `ACTIVE` at start-up.

### Plans, subscriptions and feature entitlements
`subscription_plans` (seeded: FREE_TRIAL, BASIC, PROFESSIONAL, ENTERPRISE; editable, prices 0 until set), `shop_subscriptions` (one per shop; shops without one use the default plan from settings), `feature_overrides` (a feature forced on or off for one shop). No payment provider is connected: a subscription records what was agreed; recurring revenue on the dashboard is plan price × active subscriptions, never shop sales. Entitlements are enforced on the server for create-style actions (`requireFeature` in `backend/src/middleware/entitlements.js`): installment sales, PDF receipts, CSV export, customer ID pictures, the manager role, plus plan limits on employees and inventory units. A user needs both the shop permission and the plan feature; a lapsed subscription removes plan features but leaves every record readable.

### Environment
`PLATFORM_ADMIN_IDLE_MINUTES` (15), `PLATFORM_ADMIN_MAX_HOURS` (8), `PLATFORM_ADMIN_REQUIRE_MFA` (set to 1 before production). Sign-in is rate-limited per IP and locked per account after 5 failures for 15 minutes; the privileged API has its own request ceiling.

## Notes
- Uses sessionStorage for a simple demo. For production, consider secure HttpOnly cookie sessions, CSRF protection, token rotation, email verification, password reset, stronger password policies, and account recovery.
- Shop details are user-provided; the public landing page is generic and no public shop directory is implemented.
- Employee sign-in and sales are scoped to a shop; an employee of one shop can never sign in to or see another shop's data.

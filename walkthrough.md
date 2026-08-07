# Walkthrough - Dashboard Users (Employee Login) Implementation

We have successfully implemented the **Dashboard Users (Employee Login)** system into the BillScape project. The architecture follows a client-direct monorepo structure, extending memberships as the authorization layer, checking custom permissions dynamically, and executing privileged invitation workflows via a secure Supabase Edge Function.

---

## 1. Database Migration
Created a new SQL migration file: **[013_dashboard_users.sql](file:///d:/personal/billscape/billscape/supabase/migrations/013_dashboard_users.sql)**:
* **Roles Table:** Ensured the `roles` table is defined to store role metadata and module-level permission JSON maps (e.g. `billing`, `inventory`, etc.).
* **Memberships Extension:** Added columns:
  * `employee_id` (UUID references `employees`, nullable) to link auth logins to HR employee records.
  * `custom_role_id` (UUID references `roles`, nullable) for custom role settings.
  * `is_active` (boolean, default true) to toggle access.
* **RLS Policies:**
  * Enabled Row Level Security on `roles`.
  * Set `roles` select rule for all members, and write rules for the Owner role only.
  * Re-created `memberships` write policy to ensure **only the Owner** can perform writes (inserts/updates/deletes) on membership logs.

---

## 2. Supabase Edge Function
Created the Edge Function: **[invite-employee/index.ts](file:///d:/personal/billscape/billscape/supabase/functions/invite-employee/index.ts)**:
* Validates user authentication using their request bearer JWT.
* Resolves the current user's membership and blocks access unless they have the `'owner'` role in the target organization.
* Prevents duplicates by checking if the select employee already has a linked membership.
* Triggers the Supabase admin client to invite the user via email.
* Creates the corresponding `memberships` table entry, setting it to active and linking it to the employee record.
* Cleans up the invited auth user if the database transaction fails.
* Writes a record to `activity_log` for the audit trail.

---

## 3. Context & Routing Protection
* **Auth Context ([AuthContext.tsx](file:///d:/personal/billscape/billscape/apps/web/src/contexts/AuthContext.tsx)):**
  * Added `customPermissions` to the auth state.
  * Modified the membership loader to query `custom_role_id` and load permissions maps.
  * Exposes a `hasPermission(key)` checking helper that verifies super admins/owners (always true), custom role keys (checks role maps), and system role defaults (managers can see all except roles/settings, cashiers see dashboard/billing/customers).
  * Enforces `is_active = true` filter so deactivated memberships are blocked instantly.
* **Protected Routes ([index.tsx](file:///d:/personal/billscape/billscape/apps/web/src/router/index.tsx)):**
  * Replaced the simple `RequireRole` wrapper with `RequirePermission`.
  * Secured all route targets under the sidebar using custom permissions (e.g., `/products` requires `'products'` permissions).

---

## 4. Front-End Layout & Settings UI
* **Sidebar Layout ([AppShell.tsx](file:///d:/personal/billscape/billscape/apps/web/src/components/layout/AppShell.tsx)):**
  * Updated sidebar rendering to check `hasPermission(item.permission)` instead of raw role ranges, dynamically hiding links cashiers or clerks shouldn't see.
* **Settings Page UI ([SettingsPage.tsx](file:///d:/personal/billscape/billscape/apps/web/src/pages/settings/SettingsPage.tsx)):**
  * Renamed the "Team" settings tab to **Dashboard Users**.
  * Shows a detailed table listing all dashboard users with their system role, custom role overrides, active status badge, and management buttons.
  * Lets Owners change system roles or assign custom roles inline.
  * Lets Owners toggle active status (`Disable`/`Enable`) or permanently `Revoke` (delete) memberships.
  * Provides a modal **Add Dashboard User** to invite active employees: selects employee, pre-fills email/role, and calls the secure Edge Function.

---

## Verification & Deployment Instructions

To apply and run the new code locally:

### Step 1: Run Database Migration
Execute the newly created SQL script on your local or remote database:
```bash
# If using local Supabase CLI:
supabase db push
# Or run the contents of 013_dashboard_users.sql in your Supabase SQL editor.
```

### Step 2: Deploy Edge Function
Deploy the `invite-employee` Edge Function to Deno/Supabase:
```bash
supabase functions deploy invite-employee
```

### Step 3: Run the Development Server
```bash
npm run dev
```
Navigate to Settings -> Dashboard Users as the Owner. You will now see the new portal!

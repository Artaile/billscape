# Daily Routine Works Feature Specification

This document contains the exact specifications for the "Routine Works" feature that needs to be implemented in this branch.

## 1. Context & Goal
We need to add a "Routine Works" system to track and execute monthly recurring expenses (like Rent, Utilities) and Monthly Payroll. 
This consists of:
1. A configuration tab in `SettingsPage.tsx` to manage `recurring_templates`.
2. A Notification Bell in `AppShell.tsx` to alert the user of pending monthly payouts and provide modals to execute them.

## 2. Database Schema Context
The following tables are used:
- `recurring_templates`: `id`, `organization_id`, `name`, `category` (rent/salary/utilities/maintenance/other), `due_day`, `default_amount`, `is_active`, `last_billed_month`
- `expenses`: `id`, `organization_id`, `category`, `amount`, `description`, `expense_date`, `created_by`
- `salary_payments`: `id`, `organization_id`, `employee_id`, `payment_month`, `base_salary`, `allowances_bonus`, `advance_deducted`, `other_deductions`, `net_paid`, `payment_date`, `payment_mode`, `expense_id`, `created_by`
- `employee_advances`: `id`, `organization_id`, `employee_id`, `amount`, `advance_date`, `notes`, `status`
- `activity_log`: standard activity tracking.

## 3. Implementation Details for `SettingsPage.tsx`

### State & Queries
- Add a state for the Template Dialog: `templateDialogOpen`, `editingTemplate`, and form fields (`tempName`, `tempCategory`, `tempDueDay`, `tempAmount`, `tempIsActive`).
- Add a `useQuery` to fetch `recurring_templates` for the current `orgId`.
- Add a `useMutation` to save (insert/update) a template.
- Add a `useMutation` to delete a template.

### UI Additions
- Add a "Routine Works" `<TabsTrigger value="routine">` in the sidebar.
- Create the `<TabsContent value="routine">`:
  - A header with "Add Routine Template" button.
  - A table listing existing templates showing Name, Category, Due Day, Amount, Status, and Edit/Delete actions.
- Add the Add/Edit Dialog:
  - Fields: Task Name (text), Category (select: rent/salary/utilities/maintenance/other), Due Day (number 1-31), Default Amount (number), Active (checkbox).

## 4. Implementation Details for `AppShell.tsx`

### State & Queries
- Determine `currentMonth` (e.g. `2026-08`) and `today` (e.g. `2026-08-09`).
- `useQuery` for active `recurring_templates`.
- `useQuery` for active `employees` (fetching `id, full_name, role, base_salary, salary_advance_balance`).
- `useQuery` for `salary_payments` in the `currentMonth`.
- Compute pending tasks:
  - `unpaidEmployees`: active employees not in `salary_payments` for `currentMonth`.
  - `isSalaryPending`: true if a 'salary' template exists AND `unpaidEmployees.length > 0`.
  - `pendingStandard`: templates where `category !== 'salary'` and `last_billed_month !== currentMonth`.
  - `pendingCount = pendingStandard.length + (isSalaryPending ? 1 : 0)`.
- State for modals: `notificationsOpen` (dropdown), `salaryPayoutOpen` (modal), `confirmExpenseTemplate` (modal).
- State for Salary Inputs: A record mapping `employeeId` to `{ baseSalary, bonus, advanceDeduction, otherDeduction }`. Initialize this when `salaryPayoutOpen` becomes true.
- State for Standard Expense Inputs: `expenseAmount`, `expenseDate`, `expenseNotes`, `paymentMode`.

### Notifications Dropdown UI
- Add a Bell icon next to the user profile with a red badge showing `pendingCount` if > 0.
- Clicking the bell opens a dropdown listing:
  - "Run Monthly Payroll" (if `isSalaryPending`). Clicking it opens the Payroll Modal.
  - Each pending standard template. Clicking "Pay" opens the Expense Confirm Modal.
  - A "Completed This Month" section at the bottom.

### Salary Payroll Payout Modal
- Lists all `unpaidEmployees` in a table.
- Columns: Employee details, Base Salary (editable input), Advance (shows balance, editable deduction input), Bonus (input), Deductions (input), Net Payout (calculated).
- Payment Mode selector (Cash / Bank Transfer / UPI).
- Total Net Payout summary.
- "Confirm Payouts" button triggers a mutation that runs `Promise.all` over the employees to:
  1. Insert into `expenses` (category: salary).
  2. Insert into `salary_payments` (linking the expense).
  3. Insert into `activity_log`.
  4. If `advanceDeduction > 0`, insert into `employee_advances` (status: deducted) and decrement the employee's `salary_advance_balance`.

### Standard Recurring Expense Modal
- Confirm payment for a standard template (e.g., Rent).
- Inputs: Amount (defaults to template's default_amount), Date, Notes, Payment Mode.
- Mutation:
  1. Insert into `expenses`.
  2. Update `recurring_templates` setting `last_billed_month = currentMonth`.
  3. Insert into `activity_log`.

---
*Note to Antigravity: Please implement this feature thoroughly and beautifully, ensuring standard loading states, toast notifications for success/error, and query invalidations upon success.*

# NexOps Enterprise Hub

**Unified Operations, QA & Approval Management System** built with React 19, TypeScript, Tailwind CSS v4, Express, Supabase (`@supabase/supabase-js`), and optional server-side Gemini AI executive review briefs.

---

## Key Capabilities

- **Executive KPI Dashboard:** Real-time metrics for Total Requests, Pending QA/Approval, Revision Required, Overall Approval Rate, Departmental Load, Cost-Center Budget Health, and Urgent Attention alerts.
- **Requests & Workflow Queue:** Switch seamlessly between **Table View** (with multi-row bulk priority updates & CSV export) and **Kanban Board View** across workflow stages (`Draft`, `Submitted`, `Under QA Review`, `Revision Required`, `Approved`), with **Two-Tier Escalated Approvals** (`Stage 1 Manager QA` → `Stage 2 Executive Admin Final Sign-Off`), live SLA countdown pills, and **Escalate to Admin**.
- **Projects & Clients Directory:** Manage internal projects, client engagements, and vendor programs with currency-aware cost-center budget utilization tracking (`PKR`, `USD`, `AED`).
- **Assets & Inventory Management:** Track company IT hardware, software licenses, custody transfers, maintenance logs, and low-stock alerts with direct request linkage.
- **Corporate SOP & Knowledge Vault:** Publish company SOPs, QA guidelines, and HR policies with employee digital compliance sign-off tracking.
- **Leave & Time-Off Approvals:** Submit leave applications with backup handover coverage and Manager/Admin approval routing.
- **Meetings & Action Items (MoM):** Record executive meeting minutes, decisions, and convert action items into tracked operational requests with 1 click.
- **Command Search (`Ctrl+K` / `Cmd+K`):** Instant search across Request IDs, Titles, Departments, and Audit Logs.
- **Company Branding, Permission Matrix & Cloud Health Diagnostics:** Admins can customize white-label branding, custom Departments & Categories, Role Permission Matrix, provision employee accounts, monitor live row counts across all 8 Supabase tables, and export/restore `.json` system backups.
- **Production Authentication & OOO Delegation:** Official Supabase Email/Password sign-in, password reset links, First-Time Admin Setup Guard, and Out-of-Office backup approver delegation.

---

## Local Development Setup

### Prerequisites
- **Node.js** `v20+`
- **npm** `v10+`

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not configured, NexOps Enterprise Hub automatically falls back to `localStorage` offline persistence.

### 3. Run Locally
```bash
npm run dev
```
The full-stack development server (`server.ts` + Vite middleware) starts on **http://localhost:3000**.

### 4. Typecheck & Production Build
```bash
npm run lint
npm run build
```

---

## Connecting Supabase (8-Table Cloud Persistence, Auth & Live Realtime Sync)

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard and execute the full 8-table PostgreSQL schema below (creates all module tables, RLS policies, and enables `supabase_realtime` cross-device replication):

```sql
-- 1. Operational Requests Table
CREATE TABLE IF NOT EXISTS public.nexops_requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  department TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status TEXT NOT NULL CHECK (status IN ('Draft', 'Submitted', 'Under QA Review', 'Revision Required', 'Approved', 'Rejected')),
  due_date TEXT NOT NULL,
  description TEXT NOT NULL,
  reference_link TEXT NOT NULL DEFAULT '',
  submitted_by TEXT NOT NULL,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Immutable Audit Logs Table
CREATE TABLE IF NOT EXISTS public.nexops_audit_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('Admin', 'Manager / QA Reviewer', 'Staff / Contributor')),
  action_type TEXT NOT NULL CHECK (action_type IN ('Created', 'Status Changed', 'Checklist Updated', 'Comment Added', 'Team Updated')),
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Projects & Clients Directory Table
CREATE TABLE IF NOT EXISTS public.nexops_projects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  lead_manager TEXT NOT NULL,
  department TEXT NOT NULL,
  status TEXT NOT NULL,
  budget_hours NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  estimated_budget NUMERIC NOT NULL DEFAULT 0,
  actual_spend NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Assets & Inventory Registry Table
CREATE TABLE IF NOT EXISTS public.nexops_assets (
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  department TEXT NOT NULL,
  condition TEXT NOT NULL,
  status TEXT NOT NULL,
  serial_number TEXT,
  location TEXT,
  stock_quantity INTEGER DEFAULT 1,
  min_stock_threshold INTEGER DEFAULT 0,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Corporate SOP & Knowledge Vault Table
CREATE TABLE IF NOT EXISTS public.nexops_sops (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  version TEXT NOT NULL,
  department TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  mandatory_read BOOLEAN NOT NULL DEFAULT true,
  author_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  scope TEXT NOT NULL,
  procedure_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  compliance_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  acknowledgments JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Leave & Time-Off Approvals Table
CREATE TABLE IF NOT EXISTS public.nexops_leaves (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  department TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  backup_delegate_name TEXT,
  reviewer_name TEXT,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Meeting Minutes & Action Items (MoM) Table
CREATE TABLE IF NOT EXISTS public.nexops_moms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  meeting_date TEXT NOT NULL,
  department TEXT NOT NULL,
  facilitator TEXT NOT NULL,
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Key-Value System State Table (Branding, Departments/Categories, Permission Matrix, Circulars)
CREATE TABLE IF NOT EXISTS public.nexops_system_state (
  state_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nexops_audit_request_id ON public.nexops_audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_nexops_audit_created_at ON public.nexops_audit_logs(created_at DESC);

-- Enable Row-Level Security (RLS) & Access Policies
ALTER TABLE public.nexops_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexops_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexops_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexops_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexops_sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexops_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexops_moms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexops_system_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all nexops_requests" ON public.nexops_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all nexops_audit_logs" ON public.nexops_audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all nexops_projects" ON public.nexops_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all nexops_assets" ON public.nexops_assets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all nexops_sops" ON public.nexops_sops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all nexops_leaves" ON public.nexops_leaves FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all nexops_moms" ON public.nexops_moms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all nexops_system_state" ON public.nexops_system_state FOR ALL USING (true) WITH CHECK (true);

-- Enable Live Cross-Device Realtime Updates across all 8 tables
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.nexops_requests,
  public.nexops_audit_logs,
  public.nexops_projects,
  public.nexops_assets,
  public.nexops_sops,
  public.nexops_leaves,
  public.nexops_moms,
  public.nexops_system_state;
```

3. Add your Supabase credentials to `.env`:
   ```env
   VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
   VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
   ```
4. Restart the dev server (`npm run dev`). The top bar badge switches to **Cloud Connected: Supabase**, and **Team & Settings → Cloud Health Diagnostics** displays live row counts and connection health for all 8 Supabase tables (`requests`, `audit_logs`, `projects`, `assets`, `sops`, `leaves`, `moms`, `system_state`).

### Optional: Server-Side Gemini AI Briefs
To enable live Gemini synthesis for the **Generate AI Review Brief** panel (while keeping your API key strictly server-side in `server.ts`), set:
```env
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```

---

## Deploying to Vercel or Netlify

Because the frontend compiles to a static SPA (`dist/`) and uses `VITE_*` public env vars for Supabase, you can deploy to Vercel or Netlify in minutes.

### Deploy to Vercel
1. Push your repository to GitHub/GitLab/Bitbucket and import it in [vercel.com](https://vercel.com).
2. Set the **Build & Development Settings**:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Add **Environment Variables** in Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. *(Note: On static-only hosting without `server.ts`, the AI Review Brief automatically falls back to the built-in rule-based engine with zero errors.)*

### Deploy to Netlify
1. Connect your repository in [app.netlify.com](https://app.netlify.com).
2. Configure **Build Settings**:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
3. Add a SPA redirect rule if needed (`/* /index.html 200` in `_redirects` or `netlify.toml`) and configure `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` under **Site configuration → Environment variables**.
4. Trigger **Deploy site**.

### Full-Stack Node.js Deployment (Cloud Run / Railway / Render)
If deploying the Express + Vite production server (`server.ts`) with `/api/ai/review-brief`:
- **Build Command:** `npm run build`
- **Start Command:** `npm start` (`node server.ts` / `tsx server.ts` depending on runtime; port `3000`)
- **Env Vars:** `NODE_ENV=production`, `GEMINI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

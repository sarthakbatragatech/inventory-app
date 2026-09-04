# Inventory App

Next.js 16 inventory app for uploading inward stock from Excel, managing BOMs, recording factory production, reviewing SKU totals, and inspecting inward history per item.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Required Environment Variables

Set these in `.env.local` for local development and in Vercel for deployment:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ORDER_SUPABASE_URL=...
ORDER_SUPABASE_SERVICE_ROLE_KEY=...
# Optional fallback if you do not want to use the service role key:
ORDER_SUPABASE_ANON_KEY=...
```

## Deployment

The app is ready to deploy to Vercel as a standard Next.js project.

Before deploying:

```bash
npm run lint
npm run build
```

In Vercel:

1. Import the repository.
2. Add the inventory Supabase variables for Production and Preview.
3. Add the order-portal Supabase variables if you use `/api/sync-sales` or the "Sync Sales" button.
4. Deploy.

## Notes

- Uploads are handled through App Router route handlers.
- Item detail pages include an inward history table and a Vega bar chart fed by `/api/items/[id]/chart`.
- Supabase service-role access is used on the server, so `SUPABASE_SERVICE_ROLE_KEY` must only be configured in server environments.
- Sales sync reads from a separate order-portal Supabase project, so `ORDER_SUPABASE_URL` plus either `ORDER_SUPABASE_SERVICE_ROLE_KEY` or `ORDER_SUPABASE_ANON_KEY` must be present anywhere `/api/sync-sales` runs.
- `/production` is the FR-Cruzer control workspace: fitter-stage assembly consumes moulded/electrical BOM components, box-stage output consumes packing-stage components and becomes finished-goods stock, synced sales reduce that packed stock, and live pending order quantities drive the recommended build.
- FR-Cruzer tracks the received China electrical and iron-frame parts as individual BOM components. Grouped placeholders such as Wire Set, Iron Frame, Drive Motor, and MP3 are retained only as catalog history and are not counted alongside their subcomponents.
- FR-Cruzer production is captured for Red-White, Aqua-Brown, White-Brown, and Military Green-Brown. Shared and colour-dependent BOM lines are tracked separately; sales remain model-level, so the app does not invent colour-wise finished-goods balances.
- The inward importer prefers a sheet explicitly named `Inward`, maps the supplied FR-001 item-name and colour combinations to their seeded SKUs, and replaces overlapping history only for matching SKUs.

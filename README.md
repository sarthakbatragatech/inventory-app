# Inventory App

Next.js 16 inventory app for uploading inward stock from Excel, reviewing SKU totals, and inspecting inward history per item.

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
2. Add the three Supabase environment variables for Production and Preview.
3. Deploy.

## Notes

- Uploads are handled through App Router route handlers.
- Item detail pages include an inward history table and a Vega bar chart fed by `/api/items/[id]/chart`.
- Supabase service-role access is used on the server, so `SUPABASE_SERVICE_ROLE_KEY` must only be configured in server environments.

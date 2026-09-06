# FR-Cruzer WhatsApp alerts

The tracking page offers an alert preview backed by the same dashboard calculations as the stock view. `GET /api/production/alerts?fgSku=FR-CRUZER` returns a message draft and configuration checks. It performs no Meta requests, sends no messages, and adds no schedule.

## Existing integration

`src/lib/whatsapp-cloud.ts` already uploads and sends a factory-stock PDF through WhatsApp Cloud API. It uses server-only `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_RECIPIENT_PHONE`, and optional `WHATSAPP_GRAPH_VERSION` (existing default: `v23.0`). The existing factory-report route requires `CRON_SECRET`. `vercel.json` schedules that route at 13:30 UTC / 19:00 IST daily.

The new preview reports only whether the three WhatsApp configuration values and the cron secret are present. `configured` means the three WhatsApp values are non-empty; it does not prove token validity, recipient consent, template approval, or successful delivery. `connectionVerified` and `deliveryEnabled` remain `false`. Neither credentials nor recipient numbers are returned. The existing schedule is reported as configured, not verified operational.

## Preview semantics

The message contains open orders, ready stock, work awaiting packing, required new assembly, complete-bike capacity, and up to four actionable dashboard alerts. Both pages use the same demand and stock rules. In particular, packed finished goods and usable work in progress offset demand before the app computes new assembly needs. It does not infer colour-wise finished goods from model-level sales.

The route validates the SKU, returns `400` for malformed values, `404` for missing models, and a generic `503` if the dashboard cannot be loaded. Responses use `Cache-Control: private, no-store`. Only `GET` is implemented, so a POST cannot trigger delivery.

## Enabling delivery later

1. Choose stakeholders, confirm their opt-in covers stock alerts, and agree timing and triggers. Configure these securely on the server. Existing report recipients are not automatically subscribed to a different alert.
2. Prepare a message template in WhatsApp Manager with fields matching the approved content, then verify its approval, language, category, and variable structure. Do not assume the free-form preview can be sent as a template unchanged.
3. Add a template-send method to the existing Cloud API adapter. Scheduled notifications outside a recipient's 24-hour reply window require an approved template; the existing PDF sender uses the `document` message type and alone is not a reliable unattended-alert mechanism.
4. Persist per-recipient delivery attempts with a unique key for model, alert state, reporting period, and recipient. Use this to prevent duplicate sends and add retries with bounded backoff. Record Meta message IDs and webhook delivery/failure statuses. Protect the webhook with Meta signature verification.
5. Add an explicitly enabled, authenticated scheduled route after the owner authorizes outbound notifications. Keep it disabled by default, avoid resending unchanged alerts repeatedly, and verify one approved test delivery before enabling the chosen schedule.

No configuration, existing WhatsApp sender, or cron schedule was modified for this preview.

## Official reference

WhatsApp's [Business Messaging Policy](https://business.whatsapp.com/policy) requires recipient opt-in and approved message templates for business-initiated conversations or messages outside the 24-hour customer-service window. Reviewed 7 September 2026. This is why the preview is not itself a delivery-ready message or an assurance that the existing daily document send will arrive.

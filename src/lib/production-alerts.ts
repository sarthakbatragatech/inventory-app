import type { ProductionDashboard } from '@/lib/production';
import deploymentConfig from '../../vercel.json';

export type ProductionAlertPreview = {
  provider: 'whatsapp_cloud_api';
  mode: 'preview';
  deliveryEnabled: false;
  configured: boolean;
  connectionVerified: false;
  checks: Array<{ id: string; label: string; ready: boolean }>;
  existingSchedule: string | null;
  requirements: string[];
  messagePreview: string;
  generatedAt: string;
};

const numberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

function quantity(value: number | null) {
  return value === null ? 'unavailable' : numberFormatter.format(value);
}

/** Builds a draft only. Configuration presence does not verify Meta credentials or delivery. */
export function buildProductionAlertPreview(
  dashboard: ProductionDashboard,
  environment: NodeJS.ProcessEnv = process.env,
  generatedAt = new Date().toISOString()
): ProductionAlertPreview {
  const checks = [
    {
      id: 'credential',
      label: 'API credential',
      ready: Boolean(environment.WHATSAPP_ACCESS_TOKEN?.trim()),
    },
    {
      id: 'sender',
      label: 'WhatsApp sender',
      ready: Boolean(environment.WHATSAPP_PHONE_NUMBER_ID?.trim()),
    },
    {
      id: 'recipient',
      label: 'Existing report recipient',
      ready: Boolean(environment.WHATSAPP_RECIPIENT_PHONE?.trim()),
    },
    {
      id: 'scheduler',
      label: 'Scheduled-job authentication',
      ready: Boolean(environment.CRON_SECRET?.trim()),
    },
  ];
  const factoryReportCron = deploymentConfig.crons.find(
    (cron) => cron.path === '/api/cron/factory-stock-whatsapp'
  );
  const actionableAlerts = dashboard.alerts.filter((alert) => alert.severity !== 'info');
  const date = new Date(generatedAt).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const previewLines = [
    `${dashboard.fgSku} inventory · ${date}`,
    `Open orders: ${quantity(dashboard.pendingOrderQty)} bikes`,
    `Ready stock: ${quantity(dashboard.demandPlanning.readyToDispatchQty)} bikes`,
    `Awaiting packing: ${quantity(dashboard.demandPlanning.wipAvailableQty)} bikes`,
    `New assembly needed: ${quantity(dashboard.demandPlanning.newAssemblyRequiredQty)} bikes`,
    `Complete-bike capacity: ${quantity(dashboard.buildableQty)}`,
    '',
    ...(actionableAlerts.length > 0
      ? actionableAlerts.slice(0, 4).map((alert) => `${alert.title}: ${alert.message}`)
      : ['No current inventory alerts.']),
    ...(actionableAlerts.length > 4
      ? [`Plus ${actionableAlerts.length - 4} more alerts in the tracking page.`]
      : []),
  ];

  return {
    provider: 'whatsapp_cloud_api',
    mode: 'preview',
    deliveryEnabled: false,
    configured: checks.slice(0, 3).every((check) => check.ready),
    connectionVerified: false,
    checks,
    existingSchedule: factoryReportCron
      ? factoryReportCron.schedule === '30 13 * * *'
        ? 'Factory report configured for 19:00 IST daily'
        : 'Factory report schedule configured'
      : null,
    requirements: [
      'Choose alert recipients and timing, and confirm their opt-in.',
      'Use a Meta-approved message template for scheduled alerts outside the 24-hour reply window.',
      'Add duplicate suppression and delivery tracking before enabling automatic alerts.',
    ],
    messagePreview: previewLines.join('\n'),
    generatedAt,
  };
}

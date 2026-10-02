export type InventoryIdentity = {
  userId: string;
  username: string;
  role: 'admin' | 'viewer';
};

export function isInventoryAdmin(identity: InventoryIdentity | null) {
  return identity?.role === 'admin';
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isReadMethod(method: string) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

export function safeReturnPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  const url = new URL(value, 'https://inventory.invalid');
  if (url.origin !== 'https://inventory.invalid' || ['/login', '/forbidden'].includes(url.pathname) || url.pathname.startsWith('/api/')) return '/';
  return `${url.pathname}${url.search}`;
}

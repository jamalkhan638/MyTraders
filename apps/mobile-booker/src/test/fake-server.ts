import { randomUUID } from 'node:crypto';

/**
 * In-memory stand-in for the SupplyBeacon API, following the same contract as the real backend
 * (verified there by test/mobile-booker.e2e-spec.ts): mobile sessions, booker master data, and
 * idempotent POST /orders keyed by (organization, clientOrderId). It can also misbehave like a
 * real network: go offline, lose the reply after saving, or fail with 5xx.
 */
interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: 'ORDER_BOOKER' | 'ADMIN' | 'SUPER_ADMIN';
  orgId: string | null;
  active: boolean;
}
interface Shop {
  id: string;
  orgId: string;
  bookerId: string | null;
  name: string;
  areaId: string;
  areaName: string;
  active: boolean;
}
interface Product {
  id: string;
  orgId: string;
  name: string;
  type: 'TIN' | 'POUCH';
  active: boolean;
}
interface Order {
  id: string;
  orgId: string;
  bookerId: string;
  orderNumber: string;
  clientOrderId: string | null;
  shopId: string;
  items: { productId: string; quantity: number }[];
  createdAt: string;
}

export class FakeServer {
  readonly users: User[] = [];
  readonly shops: Shop[] = [];
  readonly products: Product[] = [];
  readonly orders: Order[] = [];
  readonly suspended = new Set<string>();
  /** network down: every request fails before reaching the server */
  offline = false;
  /** the next N order creations are saved, but the reply never reaches the phone */
  dropReplies = 0;
  /** the next N requests answer 503 */
  fail5xx = 0;
  /** count of POST /orders requests that reached the server */
  orderPosts = 0;
  private access = new Map<string, string>();
  private refresh = new Map<string, string>();
  private counter = 0;

  addOrg(name = 'Org') {
    return { id: randomUUID(), name };
  }
  addUser(u: Partial<User> & Pick<User, 'role' | 'orgId'>) {
    const user: User = {
      id: randomUUID(),
      email: `${u.role.toLowerCase()}-${this.users.length}@test.local`,
      password: 'Password@123',
      name: 'Test User',
      active: true,
      ...u,
    };
    this.users.push(user);
    return user;
  }
  addShop(s: Partial<Shop> & Pick<Shop, 'orgId' | 'bookerId' | 'name'>) {
    const shop: Shop = {
      id: randomUUID(),
      areaId: 'area-1',
      areaName: 'Saddar',
      active: true,
      ...s,
    };
    this.shops.push(shop);
    return shop;
  }
  addProduct(p: Partial<Product> & Pick<Product, 'orgId' | 'name'>) {
    const product: Product = { id: randomUUID(), type: 'TIN', active: true, ...p };
    this.products.push(product);
    return product;
  }

  readonly fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (this.offline) throw new TypeError('Network request failed');
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (this.fail5xx > 0) {
      this.fail5xx--;
      return json(503, { message: 'Service unavailable' });
    }

    if (path === '/auth/mobile/login') {
      const user = this.users.find((u) => u.email === body.email && u.password === body.password);
      if (!user) return json(401, { message: 'Invalid email or password' });
      if (!user.active) return json(401, { message: 'Your account is inactive' });
      if (user.orgId && this.suspended.has(user.orgId)) {
        return json(401, { message: 'Your organization is suspended' });
      }
      if (user.role !== 'ORDER_BOOKER') {
        return json(403, {
          message:
            'This app is for Order Bookers only. Admins, please use the SupplyBeacon website.',
        });
      }
      return json(200, this.session(user));
    }
    if (path === '/auth/mobile/refresh') {
      const userId = this.refresh.get(body.refreshToken);
      if (!userId) return json(401, { message: 'Session expired, please sign in again' });
      this.refresh.delete(body.refreshToken);
      const user = this.users.find((u) => u.id === userId)!;
      if (!user.active) return json(401, { message: 'Your account is inactive' });
      if (user.orgId && this.suspended.has(user.orgId)) {
        return json(401, { message: 'Your organization is suspended' });
      }
      return json(200, this.session(user));
    }
    if (path === '/auth/mobile/logout') {
      this.refresh.delete(body.refreshToken);
      return new Response(null, { status: 204 });
    }

    const token = headers.Authorization?.replace('Bearer ', '');
    const user = this.users.find((u) => u.id === (token ? this.access.get(token) : undefined));
    if (!user || !user.active || (user.orgId && this.suspended.has(user.orgId))) {
      return json(401, { message: 'Not authenticated' });
    }
    const mine = (s: Shop) => s.orgId === user.orgId && s.bookerId === user.id && s.active;
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
    const paged = <T>(items: T[]) => ({
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    });

    if (path === '/booker/shops') {
      return json(
        200,
        paged(
          this.shops.filter(mine).map((s) => ({
            id: s.id,
            name: s.name,
            contactPerson: null,
            phone: null,
            address: null,
            area: { id: s.areaId, name: s.areaName },
          })),
        ),
      );
    }
    if (path === '/booker/areas') {
      const areas = new Map<string, { id: string; name: string; shopCount: number }>();
      for (const s of this.shops.filter(mine)) {
        const a = areas.get(s.areaId) ?? { id: s.areaId, name: s.areaName, shopCount: 0 };
        a.shopCount++;
        areas.set(s.areaId, a);
      }
      return json(200, [...areas.values()]);
    }
    if (path === '/booker/products') {
      return json(
        200,
        paged(
          this.products
            .filter((p) => p.orgId === user.orgId && p.active)
            .map((p) => ({
              id: p.id,
              name: p.name,
              code: null,
              type: p.type,
              weight: null,
              weightUnit: null,
              weightBasis: null,
              piecesPerCarton: p.type === 'POUCH' ? 6 : null,
            })),
        ),
      );
    }
    if (path === '/orders' && method === 'GET') {
      return json(
        200,
        paged(
          this.orders
            .filter((o) => o.orgId === user.orgId && o.bookerId === user.id)
            .map((o) => this.summary(o)),
        ),
      );
    }
    if (path === '/orders' && method === 'POST') {
      this.orderPosts++;
      if (body.clientOrderId) {
        const existing = this.orders.find(
          (o) => o.orgId === user.orgId && o.clientOrderId === body.clientOrderId,
        );
        if (existing && existing.bookerId !== user.id) {
          return json(409, { message: 'This client order id is already used by another order' });
        }
        if (existing) return this.reply(201, this.summary(existing));
      }
      const details: { path: string; message: string }[] = [];
      const shop = this.shops.find(
        (s) => s.id === body.shopId && s.orgId === user.orgId && s.bookerId === user.id,
      );
      if (!shop) details.push({ path: 'shopId', message: 'Shop not found or not assigned to you' });
      else if (!shop.active) details.push({ path: 'shopId', message: 'This shop is inactive' });
      (body.items as { productId: string }[]).forEach((item, i) => {
        const p = this.products.find((x) => x.id === item.productId && x.orgId === user.orgId);
        if (!p) details.push({ path: `items.${i}.productId`, message: 'Product not found' });
        else if (!p.active)
          details.push({ path: `items.${i}.productId`, message: 'This product is inactive' });
      });
      if (details.length)
        return json(422, { message: details.map((d) => d.message).join('. '), details });
      const order: Order = {
        id: randomUUID(),
        orgId: user.orgId!,
        bookerId: user.id,
        orderNumber: `ORD-${String(++this.counter).padStart(6, '0')}`,
        clientOrderId: body.clientOrderId ?? null,
        shopId: body.shopId,
        items: body.items,
        createdAt: new Date().toISOString(),
      };
      this.orders.push(order);
      return this.reply(201, this.summary(order));
    }
    return json(404, { message: 'Not found' });
  }) as typeof fetch;

  /** the server did the work, but the connection dropped before the reply arrived */
  private reply(status: number, body: unknown) {
    if (this.dropReplies > 0) {
      this.dropReplies--;
      throw new TypeError('Network request failed');
    }
    return json(status, body);
  }

  private session(user: User) {
    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    this.access.set(accessToken, user.id);
    this.refresh.set(refreshToken, user.id);
    return {
      accessToken,
      expiresIn: 900,
      refreshToken,
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization: user.orgId
          ? {
              id: user.orgId,
              name: 'Ali Akbar Traders',
              status: 'ACTIVE',
              currency: 'PKR',
              timezone: 'Asia/Karachi',
            }
          : null,
      },
    };
  }

  private summary(o: Order) {
    const shop = this.shops.find((s) => s.id === o.shopId)!;
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: 'PENDING',
      clientOrderId: o.clientOrderId,
      shop: { id: shop.id, name: shop.name },
      area: { id: shop.areaId, name: shop.areaName },
      orderBooker: { id: o.bookerId, name: 'Booker' },
      itemCount: o.items.length,
      totalPieces: 0,
      totalCartons: 0,
      createdAt: o.createdAt,
    };
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

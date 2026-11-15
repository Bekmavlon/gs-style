// Supabase'ni xotirada taqlid qiluvchi server: RLS (user_id) va LWW triggerini takrorlaydi.
type Row = Record<string, unknown>;

export class FakeServer {
  tables = new Map<string, Map<string, Row>>();
  files = new Map<string, Blob>(); // storage: "<bucket>/<path>"
  rpcCalls: string[] = [];
  private tick = 0;
  failNext = false;

  private t(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }
  private now() {
    this.tick++;
    return new Date(Date.UTC(2026, 10, 11, 0, 0, 0) + this.tick * 1000).toISOString().replace('Z', '+00:00');
  }

  upsert(table: string, rows: Row[], uid: string): { error: { message: string } | null } {
    if (this.failNext) {
      this.failNext = false;
      return { error: { message: 'tarmoq xatosi (sinov)' } };
    }
    const t = this.t(table);
    for (const r0 of rows) {
      const r = { ...r0 };
      if (!r.id) r.id = `${table}:${r.user_id}:${r.device_id ?? Math.random()}`;
      if (r.user_id !== uid) return { error: { message: 'new row violates row-level security policy' } };
      const ex = t.get(r.id as string);
      if (ex && ex.user_id !== uid) return { error: { message: 'new row violates row-level security policy' } };
      if (ex && new Date(r.updated_at as string) < new Date(ex.updated_at as string)) continue; // LWW
      t.set(r.id as string, { ...r, created_at: ex?.created_at ?? r.created_at, server_updated_at: this.now() });
    }
    return { error: null };
  }

  select(table: string, uid: string, since: string, from: number, to: number) {
    const rows = [...this.t(table).values()]
      .filter((r) => r.user_id === uid && new Date(r.server_updated_at as string) > new Date(since))
      .sort((a, b) => (a.server_updated_at as string).localeCompare(b.server_updated_at as string));
    return rows.slice(from, to + 1).map((r) => ({ ...r, updated_at: (r.updated_at as string).replace('Z', '+00:00') }));
  }

  client(uid: string | null) {
    const srv = this;
    return {
      auth: {
        getSession: async () => ({ data: { session: uid ? { user: { id: uid, email: 'a@b.uz' } } : null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      from(table: string) {
        return {
          upsert: async (rows: Row | Row[]) => srv.upsert(table, Array.isArray(rows) ? rows : [rows], uid!),
          select() {
            let since = '1970-01-01T00:00:00Z';
            const q = {
              gt(_c: string, v: string) {
                since = v;
                return q;
              },
              order() {
                return q;
              },
              range(a: number, b: number) {
                return Promise.resolve({ data: srv.select(table, uid!, since, a, b), error: null });
              }
            };
            return q;
          }
        };
      },
      functions: { invoke: async () => ({ data: null, error: { message: 'yo‘q' } }) },
      rpc: async (fn: string) => {
        srv.rpcCalls.push(fn);
        return { data: null, error: null };
      },
      storage: {
        from(bucket: string) {
          const own = (path: string) => uid && path.startsWith(`${uid}/`);
          return {
            upload: async (path: string, blob: Blob) => {
              if (!own(path)) return { data: null, error: { message: 'RLS: begona papka' } };
              srv.files.set(`${bucket}/${path}`, blob);
              return { data: { path }, error: null };
            },
            download: async (path: string) => {
              const b = own(path) ? srv.files.get(`${bucket}/${path}`) : undefined;
              return b ? { data: b, error: null } : { data: null, error: { message: 'Topilmadi' } };
            },
            remove: async (paths: string[]) => {
              for (const p of paths) if (own(p)) srv.files.delete(`${bucket}/${p}`);
              return { data: [], error: null };
            },
            list: async (folder: string) => {
              const pre = `${bucket}/${folder}/`;
              return { data: [...srv.files.keys()].filter((k) => k.startsWith(pre)).map((k) => ({ name: k.slice(pre.length) })), error: null };
            }
          };
        }
      }
    };
  }
}

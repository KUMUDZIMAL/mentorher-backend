import dns from 'dns';

// Some machines use a local proxy/DNS (e.g. 127.0.0.1) that refuses Node's
// c-ares DNS queries, which breaks mongodb+srv resolution with ECONNREFUSED.
// When the system resolver is loopback only, fall back to public DNS.
export function applyDnsFix(): void {
  try {
    const before = dns.getServers();
    const loopbackOnly = before.every(
      (s) => s === '127.0.0.1' || s === '::1' || s === 'localhost'
    );
    if (loopbackOnly) {
      dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
      console.log('[dnsfix] loopback DNS detected:', before, '->', dns.getServers());
    }
  } catch (e) {
    console.warn('[dnsfix] failed:', e);
  }
}

applyDnsFix();

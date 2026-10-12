const http = require('http'), fs = require('fs');
const EVE = process.env.EVE_PATH || '/var/log/suricata/eve.json';
let alerts = [], blocked = {}, counts = {};

function addAlert(a) {
  alerts = [a, ...alerts].slice(0, 100);
  counts[a.ip] = (counts[a.ip] || 0) + 1;
  // Response: block on high severity or 5+ alerts from the same IP
  if (!blocked[a.ip] && (a.sev === 1 || counts[a.ip] >= 5)) {
    blocked[a.ip] = new Date().toLocaleTimeString();
    console.log('[RESPONSE] Blocking', a.ip); // real: iptables -I INPUT -s <ip> -j DROP
  }
}

if (fs.existsSync(EVE)) {            // REAL MODE: read Suricata alerts
  let pos = fs.statSync(EVE).size;
  fs.watchFile(EVE, { interval: 500 }, cur => {
    if (cur.size < pos) pos = 0;
    const buf = Buffer.alloc(cur.size - pos), fd = fs.openSync(EVE, 'r');
    fs.readSync(fd, buf, 0, buf.length, pos); fs.closeSync(fd); pos = cur.size;
    buf.toString().split('\n').forEach(l => {
      try {
        const e = JSON.parse(l);
        if (e.event_type === 'alert') addAlert({ time: new Date(e.timestamp).toLocaleTimeString(), ip: e.src_ip, sig: e.alert.signature, sev: e.alert.severity });
      } catch {}
    });
  });
} else {                             // DEMO MODE: fake attacks
  const sigs = [['Port scan', 2], ['SSH brute force', 1], ['SQL injection', 1], ['Directory traversal', 2], ['ICMP ping', 3]];
  const ips = ['203.0.113.7', '198.51.100.23', '192.0.2.99', '203.0.113.55'];
  setInterval(() => {
    const [sig, sev] = sigs[Math.floor(Math.random() * sigs.length)];
    addAlert({ time: new Date().toLocaleTimeString(), ip: ips[Math.floor(Math.random() * ips.length)], sig, sev });
  }, 1500);
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api') return res.end(JSON.stringify({ alerts, blocked, counts }));
  if (u.pathname === '/unblock') { const ip = u.searchParams.get('ip'); delete blocked[ip]; counts[ip] = 0; return res.end('ok'); }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync(__dirname + '/index.html'));
}).listen(3000, () => console.log('Dashboard: http://localhost:3000'));
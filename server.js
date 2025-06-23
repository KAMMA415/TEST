const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Simple file-based storage
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const usersFile = path.join(dataDir, 'users.json');
const productsFile = path.join(dataDir, 'products.json');

function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file)); } catch { return def; }
}
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

let users = readJSON(usersFile, []);
let products = readJSON(productsFile, []);

function saveUsers() { writeJSON(usersFile, users); }
function saveProducts() { writeJSON(productsFile, products); }

function parseBody(req, cb) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const parsed = new URLSearchParams(body);
    const obj = {};
    for (const [k,v] of parsed.entries()) obj[k] = v;
    cb(obj);
  });
}

function serveStatic(res, filepath, contentType='text/html') {
  fs.readFile(filepath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': contentType});
    res.end(data);
  });
}

function authenticate(req) {
  const cookie = req.headers.cookie || '';
  const match = /token=([^;]+)/.exec(cookie);
  if (!match) return null;
  return users.find(u => u.token === match[1]);
}

function handle(req, res) {
  const parsed = url.parse(req.url, true);
  if (req.method === 'GET' && parsed.pathname === '/') return serveStatic(res, 'public/index.html');
  if (req.method === 'GET' && parsed.pathname === '/login') return serveStatic(res, 'public/login.html');
  if (req.method === 'GET' && parsed.pathname === '/register') return serveStatic(res, 'public/register.html');
  if (req.method === 'GET' && parsed.pathname === '/admin') {
    const user = authenticate(req);
    if (!user) { res.writeHead(302, {Location:'/login'}); return res.end(); }
    return serveStatic(res, 'public/admin.html');
  }
  if (req.method === 'GET' && parsed.pathname === '/products') {
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(JSON.stringify(products));
  }
  if (req.method === 'POST' && parsed.pathname === '/register') {
    return parseBody(req, data => {
      if (users.find(u => u.username === data.username)) {
        res.writeHead(400); res.end('User exists');
      } else {
        const token = Math.random().toString(36).slice(2);
        const user = {username:data.username, password:data.password, token};
        users.push(user); saveUsers();
        res.writeHead(302, {Location:'/login'}); res.end();
      }
    });
  }
  if (req.method === 'POST' && parsed.pathname === '/login') {
    return parseBody(req, data => {
      const user = users.find(u => u.username===data.username && u.password===data.password);
      if (user) {
        user.token = Math.random().toString(36).slice(2);
        saveUsers();
        res.writeHead(302, {Location:'/admin', 'Set-Cookie':`token=${user.token}`});
        res.end();
      } else { res.writeHead(401); res.end('Invalid'); }
    });
  }
  if (req.method === 'POST' && parsed.pathname === '/addProduct') {
    const user = authenticate(req);
    if (!user) { res.writeHead(401); return res.end('Unauthorized'); }
    return parseBody(req, data => {
      const id = Date.now();
      products.push({id, name:data.name, code:data.code});
      saveProducts();
      res.writeHead(200); res.end('OK');
    });
  }
  if (req.method === 'POST' && parsed.pathname === '/deleteProduct') {
    const user = authenticate(req);
    if (!user) { res.writeHead(401); return res.end('Unauthorized'); }
    return parseBody(req, data => {
      products = products.filter(p => p.id != data.id);
      saveProducts();
      res.writeHead(200); res.end('OK');
    });
  }
  res.writeHead(404); res.end('Not found');
}

const server = http.createServer(handle);
server.listen(3000, () => console.log('Server running on http://localhost:3000'));

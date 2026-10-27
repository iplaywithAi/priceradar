import crypto from 'node:crypto';
import { config } from '../config.js';

const COOKIE = 'admin_session';
const sessions = new Map(); // token -> expiry timestamp (in memory, cleared on restart)

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

function safeEqual(a, b) {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

export function login(username, password) {
  const ok = safeEqual(username, config.adminUsername) && safeEqual(password, config.adminPassword);
  if (!ok) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, Date.now() + config.sessionHours * 3600 * 1000);
  return token;
}

export function logout(token) {
  sessions.delete(token);
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function setSessionCookie(res, token) {
  const maxAge = config.sessionHours * 3600;
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (config.cookieSecure) flags.push('Secure');
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${flags.join('; ')}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function currentToken(req) {
  return readCookie(req.headers.cookie, COOKIE);
}

export function requireAdmin(req, res, next) {
  const token = currentToken(req);
  const expiry = token ? sessions.get(token) : undefined;
  if (!expiry || expiry < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'Please sign in' });
  }
  next();
}

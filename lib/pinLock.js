// pinLock.js — device-local convenience lock + session age tracking.
//
// The REAL security is Supabase Auth + row-level security (a valid session is
// the only thing the database accepts). The PIN is just a quick re-entry
// screen so you don't retype the password: it lives in this browser's
// localStorage as a salted PBKDF2 hash, and five wrong tries sign the device
// out completely (forcing the full email + password again), which is what
// makes a 4-digit PIN acceptable here.

const PIN_KEY = 'planner.pin';
const ACTIVE_KEY = 'planner.lastActive';
const FAIL_KEY = 'planner.pinFails';
const SKIP_KEY = 'planner.pinSkipped';
const SIGNED_IN_KEY = 'planner.signedInAt';
const SIGNOUT_NOTE_KEY = 'planner.signOutNote';

export const LOCK_AFTER_MS = 15 * 60 * 1000; // idle/away this long -> PIN screen
export const MAX_PIN_FAILS = 5;
// A trusted device stays signed in until you sign it out (or the PIN is
// failed 5 times). This is only a hard ceiling so a forgotten device doesn't
// stay signed in forever.
export const SESSION_MAX_MS = 365 * 24 * 60 * 60 * 1000;

// localStorage can throw (private mode, blocked storage) — treat that as
// "nothing stored" rather than crashing the whole app.
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

async function derive(pin, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: 150000, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

export function hasPin() {
  return !!read(PIN_KEY);
}

export async function setPin(pin) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(pin, salt);
  write(PIN_KEY, JSON.stringify({ salt, hash }));
  remove(FAIL_KEY);
  remove(SKIP_KEY);
  touchActive();
}

export function clearPin() {
  remove(PIN_KEY);
  remove(FAIL_KEY);
}

// -> { ok: true } or { ok: false, remaining } (remaining tries before a full
// sign-out; 0 means the caller should sign out now).
export async function verifyPin(pin) {
  let stored;
  try {
    stored = JSON.parse(read(PIN_KEY));
  } catch {
    stored = null;
  }
  if (!stored) return { ok: false, remaining: 0 };
  const hash = await derive(pin, stored.salt);
  if (hash === stored.hash) {
    remove(FAIL_KEY);
    return { ok: true };
  }
  const fails = Number(read(FAIL_KEY) || 0) + 1;
  write(FAIL_KEY, String(fails));
  return { ok: false, remaining: Math.max(0, MAX_PIN_FAILS - fails) };
}

export function touchActive() {
  write(ACTIVE_KEY, String(Date.now()));
}

export function shouldLock() {
  if (!hasPin()) return false;
  const last = Number(read(ACTIVE_KEY));
  return !last || Date.now() - last > LOCK_AFTER_MS;
}

export const pinPromptSkipped = () => read(SKIP_KEY) === '1';
export const markPinPromptSkipped = () => write(SKIP_KEY, '1');

export function markSignedIn() {
  write(SIGNED_IN_KEY, String(Date.now()));
  touchActive();
}
export const hasSignedInAt = () => !!read(SIGNED_IN_KEY);
export function signedInTooLong() {
  const at = Number(read(SIGNED_IN_KEY));
  return !!at && Date.now() - at > SESSION_MAX_MS;
}

// Remembers WHY this device last signed out, so the login screen can say so —
// otherwise an unexpected "log in again" is impossible to diagnose.
export function recordSignOut(reason) {
  write(SIGNOUT_NOTE_KEY, JSON.stringify({ reason, at: Date.now() }));
}
export function readSignOutNote() {
  try {
    return JSON.parse(read(SIGNOUT_NOTE_KEY));
  } catch {
    return null;
  }
}
export const clearSignOutNote = () => remove(SIGNOUT_NOTE_KEY);

// Everything device-local goes on sign-out, including the PIN: a new login
// sets up a fresh one.
export function clearDeviceState() {
  [PIN_KEY, ACTIVE_KEY, FAIL_KEY, SKIP_KEY, SIGNED_IN_KEY].forEach(remove);
}

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "talentmatch-dev-secret-change-in-prod";
const TOKEN_TTL = "7d";
const SALT_ROUNDS = 10;

// ── Password helpers ─────────────────────────────────────────────────────────

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET); // throws if invalid/expired
}

// ── Express middleware ────────────────────────────────────────────────────────

/**
 * requireAuth — verifies JWT in Authorization: Bearer <token>
 * Attaches decoded user to req.user
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Please log in." });
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: "Token invalid or expired. Please log in again." });
  }
}

/**
 * requireRole(role) — restricts route to users with the given role.
 * Must be used AFTER requireAuth.
 */
function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: `Access denied. This route requires the '${role}' role.` });
    }
    next();
  };
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, requireAuth, requireRole };

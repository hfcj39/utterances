const crypto = require('crypto');

const defaultValidityPeriod = 5 * 60 * 1000; // 5 minutes

async function encrypt(plaintext, password) {
  if (!plaintext || !password) {
    throw new Error('Plaintext and password are required');
  }

  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(password).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + encrypted + tag;
}

async function decrypt(ciphertext, password) {
  if (!ciphertext || !password) {
    throw new Error('Ciphertext and password are required');
  }

  const iv = Buffer.from(ciphertext.slice(0, 24), 'hex');
  const tag = Buffer.from(ciphertext.slice(ciphertext.length - 32), 'hex');
  const encrypted = ciphertext.slice(24, ciphertext.length - 32);
  const key = crypto.createHash('sha256').update(password).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function encodeState(value, password, expires = Date.now() + defaultValidityPeriod) {
  const state = { value, expires };
  return encrypt(JSON.stringify(state), password);
}

const invalidError = new Error('state is invalid');
const expiredError = new Error('state is expired');

async function tryDecodeState(encryptedState, password) {
  let state;
  try {
    state = JSON.parse(await decrypt(encryptedState, password));
  } catch (err) {
    return invalidError;
  }
  if (Date.now() > state.expires) {
    return expiredError;
  }
  return state.value;
}

function addCorsHeaders(res, origins, requestOrigin) {
  // const permittedOrigin = requestOrigin === null || origins.indexOf(requestOrigin) === -1 ? origins[0] : requestOrigin;
  const permittedOrigin = requestOrigin ? requestOrigin : origins[0];
  res.setHeader('Access-Control-Allow-Origin', permittedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Authorization, label');
}

module.exports = { encodeState, tryDecodeState, addCorsHeaders };

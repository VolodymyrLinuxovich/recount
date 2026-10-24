// Generate the signing keys Convex Auth needs (JWT_PRIVATE_KEY, JWKS) for ONE deployment.
// Run once per deployment and set both with `npx convex env set` (never commit the output):
//   node scripts/generate-auth-keys.mjs > /tmp/keys.json
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
process.stdout.write(
  JSON.stringify({
    JWT_PRIVATE_KEY: privateKey.trimEnd().replace(/\n/g, " "),
    JWKS: JSON.stringify({ keys: [{ use: "sig", ...publicKey }] }),
  }),
);

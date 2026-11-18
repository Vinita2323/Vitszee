import dotenv from "dotenv";
import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

let firebaseAdminApp = null;

/**
 * Returns a firebase-admin app when FIREBASE_SERVICE_ACCOUNT (JSON string)
 * is set. FIREBASE_DATABASE_URL is optional (required only for Realtime DB).
 */
export const getFirebaseAdminApp = () => {
  if (firebaseAdminApp) return firebaseAdminApp;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!json) {
    return null;
  }
try {
  const serviceAccount = JSON.parse(json);
console.log("Project:", serviceAccount.project_id);
console.log("Private key starts with:");
console.log(serviceAccount.private_key.substring(0, 30));
  // Fix escaped newlines in the private key
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  const config = {
    credential: admin.credential.cert(serviceAccount),
  };

  if (databaseURL) {
    config.databaseURL = databaseURL;
  }

  firebaseAdminApp = admin.initializeApp(config);
  return firebaseAdminApp;
} catch (e) {
  console.warn("[Firebase] Init skipped:", e.message);
  return null;
}
};

export const getFirebaseRealtimeDb = () => {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return admin.database(app);
};


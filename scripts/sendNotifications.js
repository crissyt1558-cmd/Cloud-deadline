const fs = require("fs");
const admin = require("firebase-admin");

console.log("sendNotifications.js running ✅");

const keyPath = "./serviceAccountKey.json";

if (!fs.existsSync(keyPath)) {
  throw new Error("serviceAccountKey.json NOT FOUND. Check workflow step that writes the secret.");
}

const serviceAccount = require(keyPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("Firebase Admin initialized ✅ Project:", serviceAccount.project_id);


const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = JSON.parse(
  fs.readFileSync("serviceAccount.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const messaging = admin.messaging();

(async () => {
  const snap = await db.collection("users").get();

  for (const doc of snap.docs) {
    const tokensSnap = await doc.ref.collection("pushTokens").get();
    for (const t of tokensSnap.docs) {
      await messaging.send({
        token: t.id,
        notification: {
          title: "Test notification",
          body: "GitHub Actions works 🎉",
        },
      });
    }
  }

  console.log("Notifications sent");
})();

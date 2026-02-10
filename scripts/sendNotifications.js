const fs = require("fs");
const admin = require("firebase-admin");

// --- 1) Init Firebase Admin from the secret-written file ---
console.log("sendNotifications.js running ✅");

const keyPath = "./serviceAccountKey.json";

if (!fs.existsSync(keyPath)) {
  throw new Error("serviceAccountKey.json NOT FOUND. Check workflow step that writes the secret.");
}

const serviceAccount = require(keyPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

console.log("Firebase Admin initialized ✅ Project:", serviceAccount.project_id);

// --- 2) Query Firestore for deadlines due soon ---
(async () => {
  const now = admin.firestore.Timestamp.now();
  const in24h = admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  // CHANGE THIS collection name if yours is different:
  const deadlinesRef = db.collection("deadlines");

  // Assumes each deadline doc has:
  // - dueAt: Firestore Timestamp
  // - userId: string
  // - title: string (optional)
  // - notified: boolean (optional)
  const snap = await deadlinesRef
    .where("dueAt", ">=", now)
    .where("dueAt", "<=", in24h)
    .get();

  console.log(`Found ${snap.size} deadlines due in next 24h`);

  let totalSent = 0;

  for (const doc of snap.docs) {
    const d = doc.data();

    // Skip ones already notified (if you track this)
    if (d.notified === true) continue;

    if (!d.userId) {
      console.log(`Skipping ${doc.id} (missing userId)`);
      continue;
    }

    // --- 3) Get that user's push tokens ---
    // Assumes your users are stored at: users/{userId}/pushTokens/{tokenDoc}
    const tokensSnap = await db.collection("users").doc(d.userId).collection("pushTokens").get();
    const tokens = tokensSnap.docs.map(t => t.id).filter(Boolean);

    if (tokens.length === 0) {
      console.log(`No tokens for user ${d.userId} (deadline ${doc.id})`);
      continue;
    }

    const title = d.title || "Upcoming deadline";
    const dueAtMs = d.dueAt?.toMillis?.() ?? null;

    const message = {
      tokens,
      notification: {
        title: "Due soon ⏰",
        body: `${title} is due within 24 hours.`,
      },
      data: {
        deadlineId: doc.id,
        userId: d.userId,
        dueAt: dueAtMs ? String(dueAtMs) : "",
      },
    };

    const resp = await admin.messaging().sendEachForMulticast(message);

    totalSent += resp.successCount;

    console.log(
      `Sent ${resp.successCount}/${tokens.length} notifications for deadline ${doc.id} (user ${d.userId})`
    );

    // --- 4) Mark deadline as notified (optional but recommended) ---
    await doc.ref.set(
      {
        notified: resp.successCount > 0,
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  console.log(`✅ DONE. Total notifications sent: ${totalSent}`);
})().catch((err) => {
  console.error("❌ Notification job failed:", err);
  process.exit(1);
});

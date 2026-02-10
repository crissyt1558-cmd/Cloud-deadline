/**
 * scripts/sendNotifications.js
 * Runs in GitHub Actions using FIREBASE_SERVICE_ACCOUNT secret.
 *
 * Assumed Firestore structure:
 * - deadlines/{deadlineId} with fields:
 *    - userId: string
 *    - title: string
 *    - dueAt: Firestore Timestamp
 *    - notified: boolean (optional)
 *
 * - users/{uid}/pushTokens/{tokenDocId} with fields:
 *    - token: string
 *    - createdAt: Timestamp
 */

const admin = require("firebase-admin");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// Initialize Firebase Admin from JSON in env
const serviceAccount = JSON.parse(requireEnv("FIREBASE_SERVICE_ACCOUNT"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const now = admin.firestore.Timestamp.now();

  // Notify for deadlines due in the next 15 minutes
  const windowMinutes = 15;
  const windowEnd = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + windowMinutes * 60 * 1000
  );

  console.log(
    `Checking deadlines due between ${new Date(now.toMillis()).toISOString()} and ${new Date(
      windowEnd.toMillis()
    ).toISOString()}`
  );

  const snap = await db
    .collection("deadlines")
    .where("dueAt", ">=", now)
    .where("dueAt", "<=", windowEnd)
    .get();

  if (snap.empty) {
    console.log("No upcoming deadlines found.");
    return;
  }

  let sentCount = 0;

  for (const doc of snap.docs) {
    const d = doc.data();

    // Skip if already notified
    if (d.notified === true) {
      console.log(`Skipping ${doc.id} (already notified)`);
      continue;
    }

    const userId = d.userId;
    const title = d.title || "Upcoming deadline";
    const dueAt = d.dueAt;

    if (!userId || !dueAt) {
      console.log(`Skipping ${doc.id} (missing userId or dueAt)`);
      continue;
    }

    // Get all tokens for that user
    const tokensSnap = await db.collection("users").doc(userId).collection("pushTokens").get();

    const tokens = tokensSnap.docs
      .map((t) => t.data()?.token)
      .filter(Boolean);

    if (tokens.length === 0) {
      console.log(`No FCM tokens for user ${userId}. Skipping ${doc.id}.`);
      continue;
    }

    const message = {
      notification: {
        title: "Deadline coming up",
        body: `${title} is due soon.`,
      },
      data: {
        deadlineId: doc.id,
        dueAt: String(dueAt.toMillis()),
      },
      tokens,
    };

    console.log(`Sending to ${tokens.length} token(s) for deadline ${doc.id}...`);

    const resp = await admin.messaging().sendEachForMulticast(message);

    console.log(
      `Result for ${doc.id}: success=${resp.successCount}, failure=${resp.failureCount}`
    );

    // Optional: remove bad tokens automatically
    const badTokenDeletes = [];
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const err = r.error?.message || "unknown error";
        console.log(`Bad token: ${tokens[i]} -> ${err}`);

        // try deleting that token doc (tokenDocId is not necessarily token string)
        // we’ll do a query to delete matching docs
        badTokenDeletes.push(
          db
            .collection("users")
            .doc(userId)
            .collection("pushTokens")
            .where("token", "==", tokens[i])
            .get()
            .then((q) => Promise.all(q.docs.map((x) => x.ref.delete())))
        );
      }
    });
    await Promise.all(badTokenDeletes);

    // Mark notified so you don’t spam
    await doc.ref.set(
      {
        notified: true,
        notifiedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    );

    sentCount += resp.successCount;
  }

  console.log(`Done. Total notifications sent: ${sentCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

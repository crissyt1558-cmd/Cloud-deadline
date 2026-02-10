const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendReminder = functions.pubsub
  .schedule("every 1 minutes")
  .onRun(async () => {
    const now = Date.now();
    const inFiveMinutes = now + 5 * 60 * 1000;

    const snap = await admin
      .firestore()
      .collection("deadlines")
      .where("dueAt", ">=", new Date(now))
      .where("dueAt", "<=", new Date(inFiveMinutes))
      .get();

    if (snap.empty) return null;

    for (const doc of snap.docs) {
      const data = doc.data();
      if (!data.fcmToken) continue;

      await admin.messaging().send({
        token: data.fcmToken,
        notification: {
          title: "DueTrack Reminder",
          body: `⏰ ${data.title} is due soon`,
        },
      });
    }

    return null;
  });


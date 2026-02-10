import { getMessaging, getToken } from "firebase/messaging";
import { app } from "./firebase"; // ensure firebase.ts exports `app`

export const messaging = getMessaging(app);

export async function registerPush(vapidKey: string) {
  const token = await getToken(messaging, { vapidKey });
  return token;
}


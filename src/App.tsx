import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { registerPush } from "./messaging";
import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "./firebase";

type DeadlineDoc = {
  id: string;
  title: string;
  dueAt: any; // Timestamp or string (older docs)
  userId: string;
  createdAt: any;
  categoryId?: string;
};

type Category = { id: string; name: string };

const dueAtMillis = (dueAt: unknown) => {
  // Firestore Timestamp
  if (dueAt && typeof dueAt === "object" && "toMillis" in (dueAt as any)) {
    return (dueAt as any).toMillis() as number;
  }

  // Date string like "2026-03-01"
  if (typeof dueAt === "string") {
    const ms = Date.parse(`${dueAt}T00:00:00`);
    return Number.isNaN(ms) ? 0 : ms;
  }

  return 0;
};

const toISODate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const slugId = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32) || "category";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<"deadlines" | "categories" | "profile" | "settings">("deadlines");

  const [loading, setLoading] = useState(true);

  const [deadlines, setDeadlines] = useState<DeadlineDoc[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("school");

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(""); // YYYY-MM-DD
  const [busy, setBusy] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");

  const [theme, setTheme] = useState<"dark" | "light">(
    (localStorage.getItem("duetrack-theme") as "dark" | "light") || "dark"
  );

  useEffect(() => {
    localStorage.setItem("duetrack-theme", theme);
    document.body.style.background = theme === "dark" ? "#0b0b0b" : "#f6f6f6";
    document.body.style.color = theme === "dark" ? "#ffffff" : "#111111";
  }, [theme]);

  const loadDeadlines = async (uid: string) => {
    const q = query(collection(db, "deadlines"), where("userId", "==", uid));
    const snap = await getDocs(q);

    const rows: DeadlineDoc[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<DeadlineDoc, "id">),
    }));

    rows.sort((a, b) => dueAtMillis(a.dueAt) - dueAtMillis(b.dueAt));
    setDeadlines(rows);
  };

  const loadCategories = async (uid: string) => {
    const colRef = collection(db, "users", uid, "categories");
    const snap = await getDocs(colRef);

    if (snap.empty) {
      const defaults: Category[] = [
        { id: "school", name: "School" },
        { id: "bills", name: "Bills" },
        { id: "work", name: "Work" },
        { id: "health", name: "Health" },
        { id: "personal", name: "Personal" },
      ];

      for (const c of defaults) {
        await setDoc(doc(db, "users", uid, "categories", c.id), c);
      }

      setCategories(defaults);
      setCategoryId("school");
      return;
    }

    const rows = snap.docs.map((d) => d.data() as Category);
    rows.sort((a, b) => a.name.localeCompare(b.name));
    setCategories(rows);

    if (!rows.some((c) => c.id === categoryId)) {
      setCategoryId(rows[0]?.id ?? "school");
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);

      if (u) {
        try {
          await loadCategories(u.uid);
          await loadDeadlines(u.uid);
        } catch (e) {
          console.error(e);
          alert(String(e));
        }
      } else {
        setDeadlines([]);
        setCategories([]);
        setCategoryId("school");
        setActiveCategory("all");
        setView("deadlines");
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error(e);
      alert(String(e));
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
      alert(String(e));
    }
  };

  const addDeadline = async () => {
    if (!user) return;
    if (!title.trim()) return alert("Enter a title");
    if (!dueDate) return alert("Pick a due date");

    if (
      deadlines.some(
        (d) =>
          d.title.toLowerCase() === title.trim().toLowerCase() &&
          toISODate(dueAtMillis(d.dueAt)) === dueDate &&
          (d.categoryId ?? "uncategorized") === categoryId
      )
    ) {
      return alert("That deadline already exists.");
    }

    setBusy(true);
    try {
      const dueAt = Timestamp.fromDate(new Date(`${dueDate}T00:00:00`));

      await addDoc(collection(db, "deadlines"), {
        title: title.trim(),
        dueAt,
        userId: user.uid,
        createdAt: Timestamp.now(),
        categoryId,
        notified: false,
      });

      setTitle("");
      setDueDate("");
      await loadDeadlines(user.uid);
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteDeadline = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "deadlines", id));
    await loadDeadlines(user.uid);
  };

  const filteredDeadlines = useMemo(() => {
    const arr =
      activeCategory === "all"
        ? deadlines
        : deadlines.filter((d) => (d.categoryId ?? "uncategorized") === activeCategory);

    return arr
      .slice()
      .sort((a, b) => dueAtMillis(a.dueAt) - dueAtMillis(b.dueAt))
      .slice(0, 8);
  }, [deadlines, activeCategory]);

  const addCategory = async () => {
    if (!user) return;
    const name = newCategoryName.trim();
    if (!name) return;

    const id = slugId(name);

    if (categories.some((c) => c.id === id)) {
      return alert("That category already exists.");
    }

    setBusy(true);
    try {
      const c: Category = { id, name };
      await setDoc(doc(db, "users", user.uid, "categories", id), c);
      setNewCategoryName("");
      await loadCategories(user.uid);
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  const styles = {
    page: { padding: 16, maxWidth: 1400, margin: "0 auto" as const },
    header: {
      display: "grid",
      gridTemplateColumns: "120px 1fr auto",
      alignItems: "center",
      gap: 12,
      marginBottom: 16,
    },
    logoBox: {
      width: 110,
      height: 44,
      borderRadius: 12,
      border: "1px dashed #555",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      opacity: 0.85,
    },
    title: {
      textAlign: "center" as const,
      fontSize: 44,
      margin: 0,
      justifySelf: "center" as const,
    },
    topRight: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      justifyContent: "flex-end",
      flexWrap: "wrap" as const,
    },
    linkBtn: {
      background: "transparent",
      border: "1px solid #444",
      borderRadius: 10,
      padding: "8px 10px",
      cursor: "pointer",
      color: "inherit",
    },
    primaryBtn: {
      border: "1px solid #444",
      borderRadius: 12,
      padding: "10px 14px",
      cursor: "pointer",
      fontWeight: 700,
      color: "inherit",
      background: "transparent",
    },
    formRow: {
      display: "grid",
      gridTemplateColumns: "1fr 220px 220px auto",
      gap: 12,
      alignItems: "end",
      marginBottom: 12,
    },
    fieldLabel: { display: "block", fontSize: 14, marginBottom: 6 },
    input: {
      width: "100%",
      padding: 10,
      borderRadius: 10,
      border: "1px solid #444",
      background: "transparent",
      color: "inherit",
    },
    tabs: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap" as const,
      marginBottom: 18,
    },
    tab: (active: boolean) => ({
      padding: "8px 12px",
      borderRadius: 999,
      border: "1px solid #444",
      background: active ? "#2e2e2e" : "transparent",
      fontWeight: 700,
      cursor: "pointer",
      color: "inherit",
    }),
    card: { border: "1px solid #333", borderRadius: 14, padding: 14, marginTop: 10 },
    listItem: { display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 },
    mobileHint: { fontSize: 12, opacity: 0.7, marginTop: 6 },
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logoBox}>Logo here</div>

        <h1 style={styles.title}>DueTrack</h1>

        <div style={styles.topRight}>
          {!user ? (
            <button style={styles.primaryBtn} onClick={signIn}>
              Sign in
            </button>
          ) : (
            <>
              <button style={styles.linkBtn} onClick={() => setView("profile")}>
                Profile
              </button>
              <button style={styles.linkBtn} onClick={() => setView("settings")}>
                Settings
              </button>
              <button style={styles.linkBtn} onClick={signOutUser}>
                Sign out
              </button>
            </>
          )}
        </div>
      </div>

      {!user ? (
        <div style={styles.card}>
          <p style={{ margin: 0, opacity: 0.9 }}>
            Sign in to start saving deadlines in the cloud.
          </p>
        </div>
      ) : (
        <>
          {/* Nav */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <button style={styles.linkBtn} onClick={() => setView("deadlines")}>
              Deadlines
            </button>
            <button style={styles.linkBtn} onClick={() => setView("categories")}>
              View categories
            </button>
          </div>

          {view === "profile" ? (
            <div style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Profile</h2>

              <p>
                <b>Signed in as:</b>
                <br />
                {user.email}
              </p>

              <button style={styles.linkBtn} onClick={() => setView("deadlines")}>
                Back to deadlines
              </button>
            </div>
          ) : view === "settings" ? (
            <div style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Settings</h2>

              <h3 style={{ marginTop: 0 }}>Theme</h3>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <button
                  style={theme === "dark" ? styles.primaryBtn : styles.linkBtn}
                  onClick={() => setTheme("dark")}
                >
                  Dark
                </button>
                <button
                  style={theme === "light" ? styles.primaryBtn : styles.linkBtn}
                  onClick={() => setTheme("light")}
                >
                  Light
                </button>
              </div>

              <h3 style={{ marginTop: 0 }}>Notifications</h3>
              <button
  style={styles.primaryBtn}
  onClick={async () => {
  try {
    if (!user) return;

    const token = await registerPush("BCAgnbBllHAKkqarRqmqfBlyOMUOCiWnhSdVe3vZWmg6zZfF_Ib2uGMA9rKNKt6hydRxOkKM3dbrb9tr5F2RuiA");

    await setDoc(
      doc(db, "users", user.uid, "pushTokens", token),
      {
        token,
        createdAt: Timestamp.now(),
      }
    );

    alert("Background notifications enabled!");
    console.log("FCM token saved:", token);
  } catch (e) {
    console.error(e);
    alert(String(e));
  }
}}
>
  Enable background notifications
</button>


              <button style={{ ...styles.linkBtn, marginTop: 16 }} onClick={() => setView("deadlines")}>
                Back to deadlines
              </button>
            </div>
          ) : view === "categories" ? (
            <div style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Your categories</h2>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Add a category (e.g., Scholarships)"
                  style={{ ...styles.input, maxWidth: 360 }}
                />
                <button style={styles.primaryBtn} onClick={addCategory} disabled={busy}>
                  {busy ? "Adding..." : "Add category"}
                </button>
              </div>

              <ul style={{ marginTop: 14 }}>
                {categories.map((c) => (
                  <li key={c.id}>
                    <b>{c.name}</b> <span style={{ opacity: 0.7 }}>({c.id})</span>
                  </li>
                ))}
              </ul>

              <button style={styles.linkBtn} onClick={() => setView("deadlines")}>
                Back to deadlines
              </button>
            </div>
          ) : (
            <>
              {/* Form */}
              <div style={styles.card}>
                <div style={styles.formRow}>
                  <div>
                    <label style={styles.fieldLabel}>Deadline title</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., FAFSA submission"
                      style={styles.input}
                    />
                  </div>

                  <div>
                    <label style={styles.fieldLabel}>Category</label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      style={styles.input}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={styles.fieldLabel}>Due date</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      style={styles.input}
                    />
                  </div>

                  <button style={styles.primaryBtn} onClick={addDeadline} disabled={busy}>
                    {busy ? "Adding..." : "Add deadline"}
                  </button>
                </div>

                <p style={styles.mobileHint}>Phone layout polish is next (responsive styles).</p>
              </div>

              {/* Tabs */}
              <div style={styles.tabs}>
                <button style={styles.tab(activeCategory === "all")} onClick={() => setActiveCategory("all")}>
                  All
                </button>

                {categories.map((c) => (
                  <button
                    key={c.id}
                    style={styles.tab(activeCategory === c.id)}
                    onClick={() => setActiveCategory(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {/* Upcoming */}
              <h2 style={{ marginTop: 0 }}>Upcoming</h2>
              {filteredDeadlines.length === 0 ? (
                <p style={{ opacity: 0.8 }}>No deadlines yet.</p>
              ) : (
                <div style={styles.card}>
                  {filteredDeadlines.map((d) => (
                    <div key={d.id} style={styles.listItem}>
                      <div>
                        <b>{d.title}</b>
                        <div style={{ opacity: 0.8, fontSize: 13 }}>
                          {(d.categoryId ?? "uncategorized")} — due {toISODate(dueAtMillis(d.dueAt))}
                        </div>
                      </div>

                      <button style={styles.linkBtn} onClick={() => deleteDeadline(d.id)}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

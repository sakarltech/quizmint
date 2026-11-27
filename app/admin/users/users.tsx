"use client";
import { useEffect, useState } from "react";
import Brand from "../../../components/brand";
export default function Users() {
  const [users, setUsers] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [nextOffset, setNextOffset] = useState<number | null>(null),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load(q = query, page = offset) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        "/api/admin/users?q=" + encodeURIComponent(q) + "&offset=" + page,
      );
      const x: any = await r.json();
      if (!r.ok) throw Error(x.error);
      setUsers(x.users);
      setOffset(x.offset);
      setNextOffset(x.nextOffset);
      setTotal(x.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load("");
  }, []);
  async function change(user: any, action: string) {
    let credits: any, reason: any;
    if (action === "credits") {
      credits = Number(
        prompt(
          "Add or subtract question credits. Use a negative value to remove credits.",
          "0",
        ),
      );
      if (!Number.isInteger(credits) || credits === 0) return;
    }
    if (action === "suspend") {
      reason = prompt("Reason for suspension (optional):", "") ?? "";
      if (
        !confirm(
          "Suspend " +
            user.email +
            "? They will be signed out and unable to sign in.",
        )
      )
        return;
    }
    if (action === "reactivate" && !confirm("Reactivate " + user.email + "?"))
      return;
    if (
      action === "signout" &&
      !confirm("Sign out every active session for " + user.email + "?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action, credits, reason }),
      });
      const x: any = await r.json();
      if (!r.ok) throw Error(x.error);
      setMessage(
        action === "credits"
          ? "Credits updated."
          : action === "suspend"
            ? "Account suspended."
            : action === "reactivate"
              ? "Account reactivated."
              : "All active sessions were signed out.",
      );
      await load(query, offset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="header">
        <Brand />
        <a className="text-link" href="/admin">
          Quiz dashboard
        </a>
      </header>
      <main className="dashboard">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ADMINISTRATION</span>
            <h1>Creator accounts</h1>
            <p className="muted">
              View every account, support access issues and review quiz and
              survey activity.
            </p>
          </div>
        </div>
        {error && <p className="alert">{error}</p>}
        {message && <p className="notice">{message}</p>}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            load(query, 0);
          }}
        >
          <label style={{ flex: 1 }}>
            Search by email or profile
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="creator@example.com"
            />
          </label>
          <button className="btn" disabled={busy}>
            Search
          </button>
        </form>
        <p className="fine">
          {total} matching account{total === 1 ? "" : "s"} · showing{" "}
          {users.length ? offset + 1 : 0}–{offset + users.length}
        </p>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Status</th>
                <th>Usage</th>
                <th>AI access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.email}</strong>
                    <br />
                    <small>
                      Joined{" "}
                      {new Date(user.created).toLocaleDateString("en-GB")}
                    </small>
                    {user.profile?.name && (
                      <>
                        <br />
                        <small>{user.profile.name}</small>
                      </>
                    )}
                  </td>
                  <td>
                    {user.suspended_at ? (
                      <span className="status closed">Suspended</span>
                    ) : (
                      <span className="status">Active</span>
                    )}
                    {user.suspension_reason && (
                      <>
                        <br />
                        <small>{user.suspension_reason}</small>
                      </>
                    )}
                  </td>
                  <td>
                    {user.quizzes} quizzes
                    <br />
                    {user.submissions} submissions
                    <br />
                    {user.surveys} surveys
                    <br />
                    {user.survey_responses} responses
                  </td>
                  <td>
                    {user.free_remaining} free
                    <br />
                    {user.credits} purchased
                    <br />
                    {user.subscription_end > Date.now()
                      ? "Subscription active"
                      : "No active subscription"}
                  </td>
                  <td>
                    <div className="row">
                      <button
                        type="button"
                        className="text-link"
                        disabled={busy}
                        onClick={() => change(user, "signout")}
                      >
                        Sign out sessions
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        disabled={busy}
                        onClick={() => change(user, "credits")}
                      >
                        Edit credits
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        disabled={busy}
                        onClick={() =>
                          change(
                            user,
                            user.suspended_at ? "reactivate" : "suspend",
                          )
                        }
                      >
                        {user.suspended_at ? "Reactivate" : "Suspend"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && !busy && (
                <tr>
                  <td colSpan={5}>No matching creator accounts.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <nav className="row ops-pagination" aria-label="Account pages">
          <button
            className="btn outline"
            disabled={busy || offset === 0}
            onClick={() => load(query, Math.max(0, offset - 50))}
          >
            Previous
          </button>
          <span>Account page {Math.floor(offset / 50) + 1}</span>
          <button
            className="btn outline"
            disabled={busy || nextOffset === null}
            onClick={() => load(query, nextOffset!)}
          >
            Next
          </button>
        </nav>
        <p className="fine">
          Suspending an account signs it out and blocks new sign-ins. All
          administrator changes are recorded.
        </p>
      </main>
    </>
  );
}

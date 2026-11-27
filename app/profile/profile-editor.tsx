"use client";
import { useEffect, useState } from "react";
import Brand from "../../components/brand";
import {
  emptyProfile,
  creatorTypes,
  audienceGroups,
  type CreatorProfile,
} from "../../lib/creator-profile";
const label = (value: string) =>
  value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
export default function ProfileEditor() {
  const [profile, setProfile] = useState<CreatorProfile>(emptyProfile),
    [email, setEmail] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function load() {
    setError("");
    try {
      const r = await fetch("/api/profile");
      const x: any = await r.json();
      if (!r.ok) throw Error(x.error);
      setProfile(x.profile);
      setEmail(x.email);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const field = (key: keyof CreatorProfile, value: string) => {
    setProfile((p) => ({ ...p, [key]: value }));
    setSaved(false);
  };
  return (
    <>
      <header className="header">
        <Brand />
        <a className="text-link" href="/teacher">
          Back to your workspace →
        </a>
      </header>
      <main className="profile-shell">
        <span className="eyebrow">YOUR CREATOR PROFILE</span>
        <h1>Tell us about you.</h1>
        <p className="lead">
          Set up your profile after joining, and update it whenever you like.
        </p>
        <p className="fine">
          Your profile is private and is not shown to participants. Your
          creator type does not change account permissions or AI allowance.
        </p>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="notice" role="status">
            Profile saved. You’re ready to create a quiz or survey.
          </p>
        )}
        {!ready ? (
          <>
            <p role="status">
              {error ? "Unable to load your profile." : "Loading your profile…"}
            </p>
            {error && (
              <button className="btn" onClick={load}>
                Try again
              </button>
            )}
          </>
        ) : (
          <form
            className="editor-card"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/profile", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(profile),
                });
                const x: any = await r.json();
                if (!r.ok) throw Error(x.error);
                setProfile(x.profile);
                setSaved(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="profile-avatar" aria-hidden="true">
              {(profile.name || email)
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((v) => v[0])
                .join("")
                .toUpperCase()}
            </div>
            <div className="two-fields">
              <label>
                Display name
                <input
                  required
                  maxLength={80}
                  autoComplete="name"
                  value={profile.name}
                  disabled={busy}
                  onChange={(e) => field("name", e.target.value)}
                  placeholder="How should we address you?"
                />
              </label>
              <label>
                Account email
                <input value={email} readOnly type="email" />
                <span className="fine">Your sign-in email.</span>
              </label>
              <label>
                Creator type
                <select
                  value={profile.teachingRole}
                  disabled={busy}
                  onChange={(e) => field("teachingRole", e.target.value)}
                >
                  {creatorTypes.map((role) => (
                    <option key={role} value={role}>
                      {label(role)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Organisation (optional)
                <input
                  maxLength={120}
                  autoComplete="organization"
                  value={profile.organisation}
                  disabled={busy}
                  onChange={(e) => field("organisation", e.target.value)}
                />
              </label>
              <label>
                Topics or interests (optional)
                <input
                  maxLength={200}
                  value={profile.subjects}
                  disabled={busy}
                  onChange={(e) => field("subjects", e.target.value)}
                  placeholder="e.g. Product research, trivia, community events"
                />
              </label>
              <label>
                Usual audience
                <select
                  value={profile.learnerGroup}
                  disabled={busy}
                  onChange={(e) => field("learnerGroup", e.target.value)}
                >
                  {audienceGroups.map((group) => (
                    <option key={group} value={group}>
                      {label(group)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Country (optional)
              <input
                maxLength={80}
                autoComplete="country-name"
                value={profile.country}
                disabled={busy}
                onChange={(e) => field("country", e.target.value)}
              />
            </label>
            <label>
              About you (optional)
              <textarea
                rows={4}
                maxLength={500}
                value={profile.bio}
                disabled={busy}
                onChange={(e) => field("bio", e.target.value)}
                placeholder="A little about what you create and who it is for…"
              />
            </label>
            <div className="row">
              <button className="btn" disabled={busy}>
                {busy ? "Saving…" : "Save profile"}
              </button>
              <a className="btn outline" href="/teacher">
                {saved ? "Go to my workspace" : "Complete later"}
              </a>
            </div>
          </form>
        )}
      </main>
    </>
  );
}

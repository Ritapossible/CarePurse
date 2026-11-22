"use client";
// Her account: profile (photo, name, email), her CarePurse wallet, sign out, and closing the account.
// Closing needs an empty purse first (withdraw on the dashboard), so no money is ever left behind.
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/AppHeader";
import AuthCard from "@/components/AuthCard";
import { type Profile, explorer, useFamilyApi } from "@/lib/family";

const card = "rounded-2xl border border-line bg-white p-5 sm:p-6";
const input = "mt-2 h-12 w-full rounded-[10px] border border-line bg-background px-4 text-[16px] outline-none transition-colors duration-150 focus:border-foreground";
const button = "inline-flex h-10 items-center justify-center rounded-[10px] border border-line px-4 text-sm font-medium transition-colors duration-150 hover:border-foreground disabled:opacity-40";

// Shrink a photo in the browser to a 256 px square JPEG (~20-40 KB) before it is saved.
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const side = Math.min(img.width, img.height);
      c.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("That file isn’t a photo we can read."));
    img.src = URL.createObjectURL(file);
  });
}

export default function AccountPage() {
  const router = useRouter();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const api = useFamilyApi();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const email = user?.email?.address ?? user?.google?.email ?? null;

  const load = useCallback(async () => {
    try {
      const r = await api<{ profile: Profile | null }>("GET", "profile");
      setProfile(r.profile);
      setName(r.profile?.name ?? "");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);
  useEffect(() => {
    if (!ready || !authenticated) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [ready, authenticated, load]);

  async function save(change: { name?: string; avatar?: string | null }, what: string) {
    setError(null);
    setSaved(false);
    setBusy(what);
    try {
      const r = await api<{ profile: Profile }>("POST", "profile", change);
      setProfile(r.profile);
      setName(r.profile.name);
      setSaved(what === "name");
      window.dispatchEvent(new Event("carepurse:profile"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    try {
      await save({ avatar: await shrink(f) }, "photo");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteAccount() {
    setError(null);
    setBusy("delete");
    try {
      await api("POST", "delete");
      await logout();
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  if (!ready) return <p className="text-muted">Loading…</p>;
  if (!authenticated) {
    return (
      <AuthCard
        title="Sign in"
        subtitle="Sign in to manage your CarePurse account."
        action="Sign in"
        onAction={() => login()}
        points={["Your profile and photo", "Your CarePurse wallet", "Sign out or close your account"]}
        alt={{ text: "New here?", link: "Set up for your mum", href: "/start" }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted">Account</p>
        <h1 className="text-2xl font-medium">Account settings</h1>
      </div>

      {error && <p className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}{/Withdraw/.test(error) && <> <Link href="/dashboard" className="font-medium underline">Go to Withdraw</Link></>}</p>}

      {/* Profile */}
      <section className={card}>
        <h2 className="font-medium">Profile</h2>
        {profile === undefined ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : profile === null ? (
          <div className="mt-4 flex items-center gap-4">
            <Avatar name={email} className="h-16 w-16 text-xl" />
            <div className="min-w-0">
              <p className="truncate font-medium">{email}</p>
              <p className="mt-1 text-sm text-muted">Your profile is created when you set up Mama’s purse. <Link href="/start" className="font-medium text-foreground underline-offset-4 hover:underline">Set it up</Link></p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 flex items-center gap-5">
              <Avatar name={profile.name} src={profile.avatar} className="h-20 w-20 text-2xl" />
              <div className="flex flex-wrap gap-2">
                <button className={button} disabled={Boolean(busy)} onClick={() => file.current?.click()}>{busy === "photo" ? "Saving…" : profile.avatar ? "Change photo" : "Add a photo"}</button>
                {profile.avatar && <button className={`${button} text-secondary`} disabled={Boolean(busy)} onClick={() => save({ avatar: null }, "photo")}>Remove</button>}
                <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            </div>
            <form className="mt-6" onSubmit={(e) => { e.preventDefault(); save({ name }, "name"); }}>
              <label className="block text-sm text-secondary">
                Your name
                <input className={input} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} maxLength={40} />
              </label>
              <p className="mt-2 text-xs text-muted">Mama sees this name in her chat (“{name || "Your name"} has set up CarePurse for you”)</p>
              <label className="mt-5 block text-sm text-secondary">
                Email
                <input className={`${input} text-secondary`} value={email ?? ""} readOnly />
              </label>
              <div className="mt-5 flex items-center gap-3">
                <button disabled={Boolean(busy) || !name.trim() || name.trim() === profile.name} className="inline-flex h-10 items-center rounded-[10px] bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40">{busy === "name" ? "Saving…" : "Save changes"}</button>
                {saved && <span className="text-sm text-secondary">Saved</span>}
              </div>
            </form>
          </>
        )}
      </section>

      {/* Mama's details: shown here, changed with the same checked, one-approval form as the dashboard */}
      {profile?.mama && profile.purseStatus === "active" && (
        <section className={card}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-medium">Mama {profile.mama.name}’s details</h2>
              <p className="mt-1 text-sm text-muted">Where Mhasibu AI sends her light, airtime and data. Only you can change them.</p>
            </div>
            <Link href="/dashboard?edit=details" className={`${button} shrink-0`}>Change</Link>
          </div>
          <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Phone</dt>
            <dd className="tabular-nums">{profile.mama.phone.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3")}</dd>
            <dt className="text-muted">Meter</dt>
            <dd className="font-mono">{profile.mama.meter}</dd>
          </dl>
        </section>
      )}

      {/* Wallet */}
      {profile && (
        <section className={card}>
          <h2 className="font-medium">Your CarePurse wallet</h2>
          <p className="mt-1 text-sm text-muted">Made for you when you signed in. You approve Mama’s rules and withdrawals with it.</p>
          <button onClick={() => navigator.clipboard?.writeText(profile.address).then(() => setCopied(true))} className="mt-4 flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-3 text-left">
            <span className="min-w-0 flex-1 break-all font-mono text-[13px]">{profile.address}</span>
            <span className="shrink-0 text-sm font-medium">{copied ? "Copied" : "Copy"}</span>
          </button>
          <a href={explorer("account", profile.address)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-muted underline-offset-4 hover:underline">View on Stellar</a>
        </section>
      )}

      {/* Sign out */}
      <section className={`${card} flex items-center justify-between gap-4`}>
        <div className="min-w-0">
          <h2 className="font-medium">Sign out</h2>
          <p className="mt-1 break-all text-sm text-muted">Signed in as {email}</p>
        </div>
        <button className={`${button} shrink-0 whitespace-nowrap`} onClick={() => logout().then(() => router.push("/"))}>Sign out</button>
      </section>

      {/* Delete */}
      <section className="rounded-2xl border border-danger/30 bg-white p-5 sm:p-6">
        <h2 className="font-medium text-danger">Delete account</h2>
        <p className="mt-1 text-sm text-secondary">
          CarePurse forgets Mama’s purse, her invite and her sign-ins, and Mhasibu AI stops serving her. Withdraw any money in the purse first. The purse contract itself stays on Stellar, unused.
        </p>
        {!deleting ? (
          <button className="mt-4 inline-flex h-10 items-center rounded-[10px] border border-danger/40 px-4 text-sm font-medium text-danger transition-colors duration-150 hover:bg-danger-soft" onClick={() => setDeleting(true)}>
            Delete my account
          </button>
        ) : (
          <div className="mt-4">
            <label className="block text-sm text-secondary">
              Type DELETE to confirm
              <input className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" />
            </label>
            <div className="mt-4 flex gap-2">
              <button disabled={confirm !== "DELETE" || busy === "delete"} onClick={deleteAccount} className="inline-flex h-10 items-center rounded-[10px] bg-danger px-4 text-sm font-medium text-white disabled:opacity-40">
                {busy === "delete" ? "Deleting…" : "Delete for good"}
              </button>
              <button className={button} onClick={() => { setDeleting(false); setConfirm(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

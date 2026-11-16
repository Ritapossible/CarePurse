// Mama's invite link. The token comes from the URL; the page itself is the client component.
import { Suspense } from "react";
import InviteClient from "./InviteClient";

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteClient token={token} />;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-6 pt-24 text-lg text-secondary">Opening your link…</main>}>
      <Invite params={params} />
    </Suspense>
  );
}

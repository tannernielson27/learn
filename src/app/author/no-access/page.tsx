import type { Metadata } from "next";

export const metadata: Metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <>
      <h1 className="mb-2 font-read text-3xl text-ink-1">No access to authoring</h1>
      <p className="text-ink-2">
        Your account is signed in but is not an instructor on this LeaRN site. Ask the site owner to
        give you access.
      </p>
    </>
  );
}

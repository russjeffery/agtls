"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Confirms, sends DELETE to `endpoint`, then navigates to `redirectTo` (usually
 * the parent list). Used on the resource detail pages.
 */
export function DeleteButton({
  endpoint,
  confirmMessage,
  redirectTo,
  label = "Delete",
}: {
  endpoint: string;
  confirmMessage: string;
  redirectTo: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (!confirm(confirmMessage)) return;
    setPending(true);
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => null);
      alert(data?.error?.message ?? "Delete failed.");
      setPending(false);
      return;
    }
    router.push(redirectTo);
  };

  return (
    <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
      {pending ? "Deleting…" : label}
    </Button>
  );
}

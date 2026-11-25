import { PasteForm } from "@/components/PasteForm";
import { Shell } from "@/components/Shell";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/server/auth/auth";

export default async function PastePage() {
  const s = await requireSession();
  return (
    <Shell>
      <PageHeader title="Paste to add" description="Backup capture. Use this when the extension did not catch a message." />
      <div className="max-w-3xl">
        <PasteForm csrf={s.csrf} />
      </div>
    </Shell>
  );
}

import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";

export default function ForgotPage() {
  return (
    <AuthCard title="Forgot your password?" subtitle="This dashboard does not send emails.">
      <p className="type-body">Ask an admin to remove your account in Settings. Then sign up again with a new password, and the admin approves it.</p>
      <Link href="/login" className="btn btn-primary btn-block mt-8">Back to log in</Link>
    </AuthCard>
  );
}

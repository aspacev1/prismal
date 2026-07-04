import Link from "next/link";

export default function RegisterSuccessPage() {
  return (
    <main>
      <h1>Account created</h1>
      <p>Next, set up your profile and company.</p>
      <Link href="/onboarding">Continue</Link>
    </main>
  );
}

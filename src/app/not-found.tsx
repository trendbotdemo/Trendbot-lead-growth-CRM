import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="mt-1 text-ink-2">This page doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link href="/" className="btn-ghost mt-4">Go home</Link>
      </div>
    </main>
  );
}

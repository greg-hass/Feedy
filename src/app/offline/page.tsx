export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div className="surface max-w-sm rounded-[32px] border border-subtle px-6 py-8">
        <p className="text-xs uppercase tracking-[0.2em] text-secondary">Feedy</p>
        <h1 className="mt-2 text-2xl font-semibold">You&apos;re offline</h1>
        <p className="mt-3 text-sm text-secondary">
          The app shell is available, but fresh feed data needs a connection.
        </p>
      </div>
    </main>
  );
}

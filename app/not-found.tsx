import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-secondary">
          That page does not exist, or you do not have access to it.
        </p>
        <Link
          href="/home"
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

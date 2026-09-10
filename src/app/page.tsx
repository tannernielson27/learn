import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16">
      <p className="eyebrow">LeaRN</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-1 sm:text-4xl">
        Live learning for the Next Generation NCLEX.
      </h1>
      <p className="mt-4 max-w-prose text-lg text-ink-2">
        Exam-faithful clinical judgment items, fast authoring, live sessions and take-home practice.
        Built for phones in the classroom and laptops at home.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/gallery"
          className="tap-target inline-flex items-center rounded-sm border border-accent bg-accent px-4 font-medium text-accent-contrast transition-colors duration-fast hover:bg-accent-ink"
        >
          Open the component gallery
        </Link>
      </div>
      <p className="mt-16 text-sm text-ink-2">Sprint 0 · foundation build</p>
    </main>
  );
}

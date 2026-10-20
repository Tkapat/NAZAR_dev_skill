/** Static-shell stand-in for a page whose content suspends (e.g. useParams on a
 *  dynamic route without generateStaticParams). Sits inside <main> — the app
 *  shell itself never disappears. */
export function PageFallback() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <div className="skeleton h-8 w-56" />
        <div className="skeleton h-4 w-80" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
      </div>
      <div className="skeleton h-96" />
    </div>
  );
}

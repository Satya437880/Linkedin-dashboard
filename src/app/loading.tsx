/** Shown while any page loads: a quiet skeleton, not a spinner, so the layout does not jump. */
export default function Loading() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]" role="status" aria-label="Loading">
      <div className="hidden border-r border-line bg-white p-6 lg:block">
        <div className="skeleton mb-8 h-12 w-40" />
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton mb-3 h-11 w-full" />)}
      </div>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="skeleton mb-6 h-10 w-56" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28" />)}
        </div>
        <div className="skeleton mt-6 h-64 w-full" />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading workspace data">
      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="h-3 w-28 rounded bg-slate-200" />
            <div className="mt-3 h-7 w-16 rounded bg-slate-200" />
            <div className="mt-3 h-2.5 w-36 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Filter Toolbar Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="h-9 w-full max-w-md rounded-lg bg-slate-100" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-lg bg-slate-100" />
          <div className="h-9 w-28 rounded-lg bg-slate-100" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="h-3.5 w-48 rounded bg-slate-200" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="h-3.5 w-24 rounded bg-slate-200" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-52 rounded bg-slate-200" />
                  <div className="h-2.5 w-32 rounded bg-slate-100" />
                </div>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <div className="h-5 w-20 rounded bg-slate-100" />
                <div className="h-5 w-24 rounded bg-slate-100" />
                <div className="h-8 w-24 rounded-lg bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

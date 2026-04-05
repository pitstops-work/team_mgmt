export default function DashboardLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-pulse">
      <div className="h-6 w-24 bg-stone-200 rounded mb-1" />
      <div className="h-4 w-40 bg-stone-100 rounded mb-6" />
      <div className="flex gap-2 mb-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-6 w-14 bg-stone-100 rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-stone-200 rounded-lg px-4 py-3.5 flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 bg-stone-200 rounded" />
              <div className="h-3 w-1/2 bg-stone-100 rounded" />
            </div>
            <div className="w-6 h-6 bg-stone-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

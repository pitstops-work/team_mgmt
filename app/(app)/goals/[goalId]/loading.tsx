export default function GoalLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-pulse">
      {/* Breadcrumb */}
      <div className="h-3 w-12 bg-stone-100 rounded mb-6" />

      {/* Goal header */}
      <div className="mb-8">
        <div className="h-6 w-1/2 bg-stone-200 rounded mb-2" />
        <div className="h-4 w-3/4 bg-stone-100 rounded mb-3" />
        <div className="h-1.5 bg-stone-100 rounded-full mt-4" />
      </div>

      {/* Route map */}
      <div className="mb-8">
        <div className="h-4 w-24 bg-stone-200 rounded mb-3" />
        <div className="flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-36 h-16 bg-stone-100 rounded-xl" />
              <div className="w-4 h-4 bg-stone-100 rounded" />
            </div>
          ))}
          <div className="w-36 h-16 bg-sky-100 rounded-xl" />
        </div>
      </div>

      {/* Pitstops */}
      <div className="h-4 w-20 bg-stone-200 rounded mb-4" />
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white border border-stone-200 rounded-lg flex">
            <div className="w-8 bg-stone-50 rounded-l-lg border-r border-stone-200" />
            <div className="flex-1 px-4 py-3.5 space-y-2">
              <div className="h-4 w-1/2 bg-stone-200 rounded" />
              <div className="h-3 w-1/3 bg-stone-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

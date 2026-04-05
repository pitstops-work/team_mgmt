export default function PitstopLoading() {
  return (
    <div className="flex h-full animate-pulse">
      {/* Left panel */}
      <div className="hidden sm:flex w-64 flex-shrink-0 border-r border-stone-200 bg-white flex-col h-full p-4 space-y-4">
        <div className="h-3 w-20 bg-stone-100 rounded" />
        <div className="h-5 w-3/4 bg-stone-200 rounded" />
        <div className="h-3 w-1/2 bg-stone-100 rounded" />
        <div className="border-t border-stone-100 pt-4 space-y-2">
          <div className="h-3 w-16 bg-stone-100 rounded" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-7 bg-stone-50 rounded-md" />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col h-full">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-200 bg-white">
          <div className="h-4 w-32 bg-stone-200 rounded" />
          <div className="h-3 w-20 bg-stone-100 rounded mt-1.5" />
        </div>
        <div className="flex-1 px-4 sm:px-6 py-4 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={`flex gap-3 ${i % 2 === 1 ? "flex-row-reverse" : ""}`}>
              <div className="w-7 h-7 bg-stone-200 rounded-full flex-shrink-0" />
              <div className={`space-y-1 ${i % 2 === 1 ? "items-end flex flex-col" : ""}`}>
                <div className="h-3 w-20 bg-stone-100 rounded" />
                <div className="h-12 w-48 bg-stone-100 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

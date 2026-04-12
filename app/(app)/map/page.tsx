import MapDashboard from "@/components/map/MapDashboard";

export const metadata = { title: "Programme Map · Janadhikara" };

// The map page needs to fill the full viewport area that `main` occupies.
// `main` in AppLayout has overflow-y-auto which prevents h-full from working
// reliably in all browsers. We use absolute positioning to fill the parent.
export default function MapPage() {
  return (
    <div className="absolute inset-0">
      <MapDashboard />
    </div>
  );
}

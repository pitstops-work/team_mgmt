import { Suspense } from "react";
import ReportDashboard from "./ReportDashboard";

export const metadata = { title: "Quarterly Report · Urban Program" };

export default function ReportPage() {
  return (
    <Suspense>
      <ReportDashboard />
    </Suspense>
  );
}

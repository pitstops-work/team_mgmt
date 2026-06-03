import { Suspense } from "react";
import ReportDashboard from "./ReportDashboard";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export const metadata = { title: "Quarterly Report · Urban Program" };

export default function ReportPage() {
  return (
    <SurfaceProvider id="report.view">
      <Suspense>
        <ReportDashboard />
      </Suspense>
    </SurfaceProvider>
  );
}

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ReviewView from "./ReviewView";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function ReviewPage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;

  const users = await prisma.user.findMany({
    select: { id: true, name: true, image: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <SurfaceProvider id="review.view">
      <ReviewView
        users={JSON.parse(JSON.stringify(users))}
        currentUserId={currentUserId}
      />
    </SurfaceProvider>
  );
}

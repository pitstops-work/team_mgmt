import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ReviewView from "./ReviewView";

export default async function ReviewPage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;

  const users = await prisma.user.findMany({
    select: { id: true, name: true, image: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <ReviewView
      users={JSON.parse(JSON.stringify(users))}
      currentUserId={currentUserId}
    />
  );
}

interface AvatarProps {
  name?: string | null;
  image?: string | null;
  size?: "sm" | "md" | "lg";
}

const sizes = { sm: "w-6 h-6 text-xs", md: "w-8 h-8 text-sm", lg: "w-10 h-10 text-base" };

export default function Avatar({ name, image, size = "md" }: AvatarProps) {
  const initials = name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() ?? "?";

  if (image) {
    return (
      <img
        src={image}
        alt={name ?? "User"}
        className={`${sizes[size]} rounded-full object-cover flex-shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizes[size]} rounded-full bg-sky-100 text-sky-700 font-medium flex items-center justify-center flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

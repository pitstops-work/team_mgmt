import { TEMPLATES } from "@/lib/templates";

export async function GET() {
  // Strip the `build` function — only return metadata + parameters
  const list = TEMPLATES.map(({ id, name, description, category, icon, parameters }) => ({
    id,
    name,
    description,
    category,
    icon,
    parameters,
  }));
  return Response.json(list);
}

import { CharacterProfileView } from "@/components/kira/character-profile";
export const metadata = { title: "Character" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CharacterProfileView id={(await params).id} />;
}

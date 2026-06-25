import EditCharacterPage from "./character-editor";

type Props = { params: Promise<{ slug: string }> };

export default async function CharacterPage({ params }: Props) {
  const { slug } = await params;
  return <EditCharacterPage slug={slug} />;
}

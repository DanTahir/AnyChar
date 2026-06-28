import MemoryViewerPage from "./memory-viewer";

type Props = { params: Promise<{ slug: string }> };

export default async function CharacterMemoriesPage({ params }: Props) {
  const { slug } = await params;
  return <MemoryViewerPage slug={slug} />;
}

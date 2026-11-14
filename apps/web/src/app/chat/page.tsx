// What Mama sees: only the chat.
import Chat from "@/components/Chat";
import Footer from "@/components/Footer";

export default function ChatPage() {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col px-3 pt-3">
      <div className="min-h-0 flex-1">
        <Chat />
      </div>
      <Footer />
    </main>
  );
}

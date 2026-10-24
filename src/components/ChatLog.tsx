export type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

export function ChatLog({ messages, studentName }: { messages: ChatMessage[]; studentName: string }) {
  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200"}`}>
            <div className={`mb-0.5 text-xs font-bold ${m.role === "user" ? "text-brand-100" : "text-slate-400"}`}>
              {m.role === "user" ? studentName : "Math Buddy"}
            </div>
            {m.content}
          </div>
        </div>
      ))}
    </div>
  );
}

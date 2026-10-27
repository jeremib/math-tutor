import { splitVisuals } from "@/lib/visuals";
import { Visual } from "./Visual";
import { SpeakButton } from "./Voice";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; imageUrl?: string | null };

export function ChatLog({ messages, studentName }: { messages: ChatMessage[]; studentName: string }) {
  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200"}`}>
            <div className={`mb-0.5 text-xs font-bold ${m.role === "user" ? "text-brand-100" : "text-slate-400"}`}>
              {m.role === "user" ? studentName : "Math Buddy"}
              {m.role === "assistant" && <SpeakButton text={m.content} className="float-right -mt-1 ml-2 h-7 w-7 text-sm" />}
            </div>
            {m.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.imageUrl} alt={`${studentName}'s work`} className="mb-2 max-h-64 rounded-lg bg-white" />
            )}
            {m.role === "assistant"
              ? splitVisuals(m.content).map((seg, i) => ("visual" in seg ? <Visual key={i} visual={seg.visual} className="my-2" /> : <p key={i} className="[&+p]:mt-2">{seg.text}</p>))
              : m.content}
          </div>
        </div>
      ))}
    </div>
  );
}

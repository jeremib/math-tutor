import { requireStudent } from "@/lib/auth";
import { drillLessonNames, drillProblems, drillTopics, getOrCreateDrill, problemView } from "@/lib/learning";
import { DrillTopics } from "@/components/DrillTopics";
import { DrillRunner } from "./DrillRunner";

export const dynamic = "force-dynamic";

export default async function DrillPage() {
  const { student, family } = await requireStudent();
  const drill = await getOrCreateDrill(student, family.timezone);
  const rows = await drillProblems(drill.id);
  const lessons = await drillLessonNames(rows);
  const problems = rows.map((p) => problemView(p, lessons));
  return (
    <div className="space-y-4">
      <DrillTopics topics={drillTopics(rows, lessons)} heading="Today's drill practices" />
      <DrillRunner initialProblems={problems} name={student.name} aiEnabled={student.aiEnabled} />
    </div>
  );
}

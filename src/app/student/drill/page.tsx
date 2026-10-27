import { requireStudent } from "@/lib/auth";
import { drillProblems, getOrCreateDrill, problemView } from "@/lib/learning";
import { DrillRunner } from "./DrillRunner";

export const dynamic = "force-dynamic";

export default async function DrillPage() {
  const { student, family } = await requireStudent();
  const drill = await getOrCreateDrill(student, family.timezone);
  const problems = (await drillProblems(drill.id)).map(problemView);
  return <DrillRunner initialProblems={problems} name={student.name} aiEnabled={student.aiEnabled} />;
}

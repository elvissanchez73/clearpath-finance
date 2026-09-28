import { pageUser } from "@/server/page-user";
import { goalsView } from "@/server/goals";
import { GoalRoadmap } from "@/components/goal-roadmap";
export default async function RoadmapPage() { const user = await pageUser(); return <main className="page"><GoalRoadmap view={await goalsView(user.id)}/></main>; }

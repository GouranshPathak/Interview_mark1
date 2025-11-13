import Agent from "@/components/Agent";
import { getCurrentUser } from "@/lib/actions/auth.action";
import { interviewTopics } from "@/constants";

interface PageProps {
  searchParams: {
    topic?: string;
    name?: string;
  };
}

const Page = async ({ searchParams }: PageProps) => {
  const user = await getCurrentUser();
  const { topic, name } = searchParams;
  
  // Find the selected topic
  const selectedTopic = interviewTopics.find(t => t.id === topic);
  const topicName = name || selectedTopic?.name || "General";

  return (
    <>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">{topicName} Interview</h2>
        <p className="text-lg text-neutral-600">
          Get ready for your AI-powered interview. Click "Call" to begin your 15-minute session.
        </p>
      </div>

      <Agent
        userName={user?.name!}
        userId={user?.id}
        type="generate"
        selectedTopic={topic}
        topicName={topicName}
      />
    </>
  );
};

export default Page;

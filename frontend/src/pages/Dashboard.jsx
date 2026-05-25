import Navbar from "../components/navbar/Navbar";
import ClusterCard from "../components/cluster/ClusterCard";
import AIStatus from "../components/ai/AIStatus";
import EventBus from "../components/eventbus/EventBus";
import Observability from "../components/observability/Observability";
import DigitalTwin from "../components/digitaltwin/DigitalTwin";
import WorkflowEngine from "../components/workflow/WorkflowEngine";
import SecurityPanel from "../components/security/SecurityPanel";
import Marketplace from "../components/marketplace/Marketplace";

export default function Dashboard() {

  return (
    <>
      <Navbar />

      <div className="container">

        <div className="grid">

          <ClusterCard />
          <AIStatus />
          <EventBus />
          <Observability />
          <DigitalTwin />
          <WorkflowEngine />
          <SecurityPanel />
          <Marketplace />

        </div>

      </div>
    </>
  );
}

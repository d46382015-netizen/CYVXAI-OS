import Sidebar from "./components/sidebar/Sidebar";
import Topbar from "./components/navbar/Topbar";
import MetricsPanel from "./components/metrics/MetricsPanel";
import TopologyGraph from "./components/topology/TopologyGraph";
import DeploymentConsole from "./components/deployments/DeploymentConsole";
import EventStream from "./components/realtime/EventStream";
import SecurityCenter from "./components/security/SecurityCenter";
import UsagePanel from "./components/usage/UsagePanel";
import AIControl from "./components/ai/AIControl";
import LogsViewer from "./components/logs/LogsViewer";

export default function App() {

  return (
    <div className="layout">

      <Sidebar />

      <div className="main">

        <Topbar />

        <div className="grid">

          <MetricsPanel />
          <TopologyGraph />
          <DeploymentConsole />
          <EventStream />
          <SecurityCenter />
          <UsagePanel />
          <AIControl />
          <LogsViewer />

        </div>

      </div>

    </div>
  );
}

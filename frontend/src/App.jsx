import { useEffect, useState } from "react";
import RealtimePanel from "./widgets/RealtimePanel";

export default function App() {

  const [analytics, setAnalytics] = useState({});
  const [autonomous, setAutonomous] = useState({});

  useEffect(() => {

    fetch("http://localhost:8000/analytics/growth?users=3200&revenue=18000")
      .then(r => r.json())
      .then(setAnalytics);

    fetch("http://localhost:8000/autonomous/decision?load=0.82&threats=0.1")
      .then(r => r.json())
      .then(setAutonomous);

  }, []);

  return (
    <div style={{
      background:"#0b1020",
      color:"#fff",
      minHeight:"100vh",
      padding:"40px",
      fontFamily:"Arial"
    }}>

      <h1>CYVXAI HyperScale Control Center</h1>

      <div style={{
        background:"#141b34",
        padding:"20px",
        marginTop:"20px"
      }}>
        <h2>Growth Analytics</h2>
        <pre>{JSON.stringify(analytics,null,2)}</pre>
      </div>

      <div style={{
        background:"#141b34",
        padding:"20px",
        marginTop:"20px"
      }}>
        <h2>Autonomous Cluster Decisions</h2>
        <pre>{JSON.stringify(autonomous,null,2)}</pre>
      </div>

      <RealtimePanel />

    </div>
  );
}

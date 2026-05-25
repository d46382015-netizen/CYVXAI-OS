import { useEffect, useState } from "react";

export default function App() {

  const [status, setStatus] = useState({});
  const [dashboard, setDashboard] = useState({});
  const [ai, setAi] = useState({});

  useEffect(() => {

    fetch("http://localhost:8000/system/status")
      .then(r => r.json())
      .then(setStatus);

    fetch("http://localhost:8000/dashboard")
      .then(r => r.json())
      .then(setDashboard);

    fetch("http://localhost:8000/ai/predict?load=0.84")
      .then(r => r.json())
      .then(setAi);

  }, []);

  return (
    <div style={{
      background:"#0b1020",
      color:"#fff",
      minHeight:"100vh",
      padding:"40px",
      fontFamily:"Arial"
    }}>

      <h1>CYVXAI Enterprise SaaS OS</h1>

      <div style={{
        padding:"20px",
        background:"#141b34",
        marginTop:"20px"
      }}>
        <h2>System Status</h2>
        <pre>{JSON.stringify(status,null,2)}</pre>
      </div>

      <div style={{
        padding:"20px",
        background:"#141b34",
        marginTop:"20px"
      }}>
        <h2>Realtime Dashboard</h2>
        <pre>{JSON.stringify(dashboard,null,2)}</pre>
      </div>

      <div style={{
        padding:"20px",
        background:"#141b34",
        marginTop:"20px"
      }}>
        <h2>AI Prediction Engine</h2>
        <pre>{JSON.stringify(ai,null,2)}</pre>
      </div>

    </div>
  );
}

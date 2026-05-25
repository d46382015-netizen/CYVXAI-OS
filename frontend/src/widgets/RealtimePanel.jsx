import { useEffect, useState } from "react";

export default function RealtimePanel() {

  const [live, setLive] = useState({});

  useEffect(() => {

    const ws = new WebSocket("ws://localhost:8000/ws/live");

    ws.onmessage = (event) => {
      setLive(JSON.parse(event.data));
    };

    return () => ws.close();

  }, []);

  return (
    <div style={{
      background:"#141b34",
      padding:"20px",
      marginTop:"20px"
    }}>
      <h2>Realtime Cluster Stream</h2>
      <pre>{JSON.stringify(live,null,2)}</pre>
    </div>
  );
}

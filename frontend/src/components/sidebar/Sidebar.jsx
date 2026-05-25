export default function Sidebar() {

  const items = [
    "Control Plane",
    "AI Runtime",
    "Clusters",
    "Security",
    "Observability",
    "Billing",
    "Workflows",
    "Edge Runtime",
    "Marketplace"
  ];

  return (
    <div className="sidebar">

      <h2>CYVXAI</h2>

      {
        items.map((item,index) => (
          <div key={index} className="sidebar-item">
            {item}
          </div>
        ))
      }

    </div>
  );
}

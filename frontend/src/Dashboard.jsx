import { useEffect, useState } from "react";

export default function Dashboard({ token }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("http://localhost:8000/dashboard", {
      headers: { token }
    })
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <div>
      <h2>Dashboard</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

import { useState } from "react";

export default function App() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");

  const login = async () => {
    const res = await fetch("http://localhost:8000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "1234" })
    });

    const data = await res.json();
    setToken(data.access_token);
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>CYVXAI Dashboard</h1>

      <input placeholder="email" onChange={(e)=>setEmail(e.target.value)} />

      <button onClick={login}>Login</button>

      {token && <p>Logged in ✔</p>}
    </div>
  );
}

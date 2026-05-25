import { useState } from "react";

export default function App() {
  const [email, setEmail] = useState("");

  return (
    <div style={{ padding: 40 }}>
      <h1>CYVXAI SaaS</h1>

      <input
        placeholder="email"
        onChange={(e) => setEmail(e.target.value)}
      />

      <button onClick={() => alert(email)}>
        Login
      </button>
    </div>
  );
}

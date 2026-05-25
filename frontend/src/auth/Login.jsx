export default function Login() {

  return (
    <div style={{
      padding:"40px",
      color:"#fff",
      background:"#0b1020",
      minHeight:"100vh"
    }}>
      <h1>CYVXAI Login</h1>

      <input placeholder="Email" />
      <br /><br />

      <input placeholder="Password" type="password" />
      <br /><br />

      <button>Authenticate</button>
    </div>
  );
}

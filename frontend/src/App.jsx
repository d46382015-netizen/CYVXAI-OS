import "./styles/global.css"

const cards = [
  {
    title:"QUANTUM LEVEL",
    text:"Built on next generation autonomous AI infrastructure with limitless scaling."
  },
  {
    title:"AI POWERED",
    text:"Adaptive intelligence engines capable of realtime orchestration and optimization."
  },
  {
    title:"NEXT GEN",
    text:"Secure decentralized compute and data infrastructure for the future."
  },
  {
    title:"REVOLUTIONARY",
    text:"A unified operating system for AI, realtime systems and advanced automation."
  },
  {
    title:"INFINITE",
    text:"Infinite scalability, infinite integrations and infinite ecosystem possibilities."
  }
]

export default function App(){

  return(

    <div className="app">

      <nav className="navbar">

        <div className="logo">
          CYVXAI
        </div>

        <div className="nav-links">
          <a href="#">HOME</a>
          <a href="#">PRODUCT</a>
          <a href="#">FEATURES</a>
          <a href="#">ECOSYSTEM</a>
          <a href="#">ROADMAP</a>
          <a href="#">PRICING</a>
          <a href="#">COMPANY</a>
        </div>

        <div className="nav-actions">

          <button className="btn-secondary">
            LOGIN
          </button>

          <button className="btn-primary">
            GET EARLY ACCESS
          </button>

        </div>

      </nav>

      <section className="hero">

        <div className="hero-left">

          <div className="hero-tag">
            NEXT GENERATION AI OS
          </div>

          <h1>
            <span className="gold">
              CYVX AI
            </span>
            <br/>
            OS
          </h1>

          <p>
            THE OPERATING SYSTEM FOR A SMARTER FUTURE.
            Quantum intelligence fused with autonomous AI,
            decentralized infrastructure, realtime orchestration,
            limitless scalability and next generation digital systems.
          </p>

          <div className="hero-buttons">

            <button className="btn-primary">
              JOIN EARLY ACCESS
            </button>

            <button className="btn-secondary">
              WATCH INTRO
            </button>

          </div>

          <div className="partner-row">

            <span>TechCrunch</span>
            <span>Forbes</span>
            <span>Binance</span>
            <span>AWS</span>
            <span>Google Cloud</span>

          </div>

        </div>

        <div className="hero-center">

          <div className="energy-ring"></div>

          <div className="coin">

            <div className="coin-x">
              X
            </div>

          </div>

        </div>

        <div className="hero-right">

          <div className="feature-list">

            <h3>
              POWERING THE NEXT EVOLUTION OF AI
            </h3>

            {
              [
                "AI AGENTS & AUTOMATION",
                "DECENTRALIZED INTELLIGENCE",
                "REAL WORLD ASSET INTEGRATION",
                "CROSS CHAIN COMPATIBILITY",
                "QUANTUM SAFE SECURITY"
              ].map((item,index)=>(

                <div className="feature-item" key={index}>

                  <div className="feature-icon"></div>

                  <div>
                    <h4>{item}</h4>

                    <p>
                      Advanced distributed infrastructure and intelligent orchestration systems.
                    </p>
                  </div>

                </div>

              ))
            }

          </div>

          <div className="live-card">

            <div className="live-header">

              <h3>
                CYVX AI OS LIVE
              </h3>

              <div className="live-dot"></div>

            </div>

            <div className="metric">

              <div>
                <p>Total Transactions</p>
                <h2>1,234,567,890</h2>
              </div>

              <span>+12.45%</span>

            </div>

            <div className="metric">

              <div>
                <p>Total Value Locked</p>
                <h2>$8.74B</h2>
              </div>

              <span>+8.75%</span>

            </div>

            <div className="metric">

              <div>
                <p>AI Agents Active</p>
                <h2>25,682</h2>
              </div>

              <span>+15.21%</span>

            </div>

            <div className="metric">

              <div>
                <p>Ecosystem Users</p>
                <h2>982,456</h2>
              </div>

              <span>+9.11%</span>

            </div>

          </div>

        </div>

      </section>

      <section className="cards">

        {
          cards.map((card,index)=>(

            <div className="card" key={index}>

              <div className="card-icon"></div>

              <h2>
                {card.title}
              </h2>

              <p>
                {card.text}
              </p>

            </div>

          ))
        }

      </section>

      <section className="bottom-grid">

        <div className="panel">

          <h2>
            ECOSYSTEM OVERVIEW
          </h2>

          <p>
            Global AI infrastructure connected across distributed regions,
            realtime compute layers, intelligent orchestration systems and
            decentralized execution environments.
          </p>

        </div>

        <div className="panel">

          <h2>
            BUILT FOR TOMORROW
          </h2>

          <p>
            Intelligent • Autonomous • Adaptive • Decentralized • Quantum Secure
          </p>

        </div>

        <div className="panel">

          <h2>
            JOIN THE MOVEMENT
          </h2>

          <p>
            Join the next generation intelligent operating system ecosystem.
          </p>

          <input
            className="email-box"
            placeholder="Enter your email"
          />

          <br/><br/>

          <button className="btn-primary">
            GET EARLY ACCESS
          </button>

        </div>

      </section>

      <div className="footer">
        CYVXAI OS — QUANTUM INTELLIGENCE. LIMITLESS POSSIBILITIES.
      </div>

    </div>
  )
}

from app.os.policy_engine import register as policy
from app.os.billing_kernel import register as billing
from app.os.supervisor import register as supervisor

def boot():
    policy()
    billing()
    supervisor()

    return "CYVXAI-OS AUTONOMOUS CORE BOOTED"

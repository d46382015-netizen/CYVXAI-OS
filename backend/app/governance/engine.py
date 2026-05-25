POLICIES = []

def create_policy(name, severity):

    policy = {
        "name": name,
        "severity": severity,
        "enabled": True
    }

    POLICIES.append(policy)

    return policy

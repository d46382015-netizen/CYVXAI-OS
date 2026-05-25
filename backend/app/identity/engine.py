IDENTITIES = {}

def create_identity(user):

    IDENTITIES[user] = {
        "verified": True,
        "access_level": "enterprise"
    }

    return IDENTITIES[user]

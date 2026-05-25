import secrets

TOKENS = {}

def create_refresh(user):

    token = secrets.token_hex(32)

    TOKENS[token] = user

    return token

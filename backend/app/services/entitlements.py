def has_access(user):
    if user.plan == "pro":
        return True

    if user.plan == "free":
        return False

    return False

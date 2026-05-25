ROLES = {
    "admin": [
        "manage_platform",
        "view_metrics",
        "manage_users"
    ],

    "user": [
        "view_dashboard"
    ]
}

def has_permission(role, permission):

    return permission in ROLES.get(role, [])

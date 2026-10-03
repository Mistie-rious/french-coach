"""Print a bcrypt hash for APP_PASSWORD_HASH:  uv run python -m app.hashpw"""

import getpass

import bcrypt

pw = getpass.getpass("New password: ")
if pw != getpass.getpass("Again: "):
    raise SystemExit("Passwords don't match")
print(bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode())

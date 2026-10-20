# Manual Password Authentication

Manual password authentication lets a Convex deployment create accounts without an email provider or
public password sign-up.

## Create or rotate an account

1. Open the required deployment in the [Convex Dashboard](https://dashboard.convex.dev/).
2. Open **Functions**.
3. Select `authAdmin:createOrUpdatePasswordAccount`.
4. Run it with:

   ```json
   {
     "email": "person@example.com",
     "password": "a strong password"
   }
   ```

The function is internal. An application client cannot call it. Authorized Convex project members
can run it from the Dashboard or the Convex CLI.

The function:

- normalizes and validates the email
- requires a password that the Convex Auth password component accepts: 10 to 100 characters, no
  surrounding whitespace, and not on its list of common passwords
- creates a password account, or rotates the password for an existing account
- links to one existing verified user with the same email when available
- rejects existing account links that conflict with the verified user for that email
- marks a newly created user's email as verified
- approves the user for Samebase access
- stores only the password hash, in the Convex Auth password component
- does not send an account email

A password rotation does not end the linked user's existing sessions: Convex Auth 2 has no function
that removes the sessions of a user.

Share the password through an approved secret channel. Do not put it in the repository or logs.

## Enable sign-in

Set this Convex deployment environment variable:

```text
PASSWORD_AUTH_ENABLED=true
```

Only the exact value `true` enables manual password sign-in. Any other value disables it.

The switch controls the sign-in form and the server sign-in boundary. It does not create an account.
Public password sign-up stays disabled.

Disabling the switch blocks new password sign-ins. It does not end sessions that already exist.
During a reconnect, a browser can briefly show its last known password form. The server still
rejects the sign-in while the switch is disabled.

# Set up Cloudflare for your first Samebase app

If your Cloudflare account has no Workers Builds API token, Samebase creates the GitHub repository
and Convex project only. Samebase does not create a Cloudflare Worker.

Do this procedure one time. Cloudflare creates the API token during its standard Git repository
setup. Samebase then uses this token for the real Worker and for future apps.

## 1: Create the app in Samebase

Select **New App**. Wait for Samebase to create the GitHub repository and Convex project.

Do not add a Cloudflare Worker in Samebase yet.

## 2: Create a temporary Worker in Cloudflare

Use the Cloudflare account that you connected to Samebase.

1. Open [Workers & Pages](https://dash.cloudflare.com/).
2. Select **Create application**.
3. Select the option to import a Git repository.
4. Connect or authorize GitHub if Cloudflare asks you to do this.
5. Select the repository that Samebase created.
6. Keep the default build and deploy settings. These settings do not matter for this temporary
   Worker.
7. Open **Advanced settings**.
8. Keep **Create new token** selected.
9. Complete the Cloudflare setup.

For Samebase, only the Workers Builds API token and GitHub authorization matter. Do not use or
repair this temporary Worker if the default commands do not deploy the app.

## 3: Delete the temporary Worker

Delete the temporary Worker in Cloudflare. Do not attach it to Samebase.

The Workers Builds API token stays in your Cloudflare account after you delete the temporary Worker.

## 4: Create the real Worker in Samebase

1. Return to the app in Samebase.
2. Open **Settings**.
3. Select **Add Cloudflare Worker**.
4. Select the new API token. If it is not in the list, select **Reload tokens**.
5. Select **Create Worker**.

Samebase creates the real Worker and connects it to the repository. Samebase sets the correct build
and deploy commands, adds the Convex production and preview deploy keys, and starts the first
deployment.

## Future apps

The API token is now available to Samebase. For future apps, **New App** creates the GitHub
repository, Convex project, and Cloudflare Worker automatically.

# Production-grade full-stack web app for 0$/month

1. Make sure you have a Github, Cloudflare and Convex accounts
2. Goto https://github.com/noter-md/convex-cloudflare-pages-stack and click the
   green "Use this template" in top right
3. Github will store your sorce code, give your repo a name
4. Goto https://dashboard.convex.dev/ and click "+ Create Project" button
5. You can use the same name as you did in GitHub
<!-- Get prod CONVEX_DEPLOY_KEY -->
6. Click the "Development (Cloud)" button at the top and switch to "Production"
7. Click the setting (gear) button on the left sidebar
8. Click the blue "+ Create Deploy Key" and give it a name like
   "for_cloudflare_pages"
9. Do NOT press "Done" yet, just copy this code, you'll need it later

10. Login to https://dash.cloudflare.com/
11. Click the "Compute" dropdown on the left sidebar and click "Workers & Pages"
12. Click "Create Application"
13. Click the small _Looking to deploy Pages? [Get started]_ link at the bottom
14. Inside "Import an existing Git repository" click "Get Started"
15. Select the repo you created in GitHub and click "Begin setup"
16. Set "Build command" to **`pnpm build:cloudflare`**
17. Set "Build command directory" to **`dist`**
18. **IMPORTANT** Click "Environment variables (advanced)" dropdown
19. Add variable "CONVEX_DEPLOY_KEY" and set the value you copied from step 9
20. Click "Save & Deploy" and wait for the build to finish
21. At the end click the link at the top and you have your app, you can share
    this link with your family and friends

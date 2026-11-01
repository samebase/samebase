# Changelog

What changed in Samebase, newest first. Each `v` number is the Samebase version that shipped the
change. If a change needs action from you, the entry says so.

## 2026-11-01

- **v2223: Docs folder in the left nav.** The nav follows the URLs now: pages under `/docs` sit in a
  `docs` folder, which you can collapse.
- **v2223: The big migration.** [The big migration](/docs/the-big-migration) explains how Samebase
  works with Alchemy and how to move a Worker or Convex app. Your app keeps running if you don't
  move it.
- **v2218: Clearer Destroy app form.** The form now says what it deletes and that your GitHub
  repository stays. To confirm, you type `delete stack and production data of <owner>/<repository>`.
  Apps created before this keep the old form.
- **v2217: Clearer new app setup.** While a new app is being set up, the overview waits for the
  first commit before it reads the default branch. It no longer says the branch has no commit.
- **v2216: Sign-in on the home page.** The Alchemy starter shows Google and guest sign-in on its
  home page, and the separate `/signin` page is gone.
- **v2215: Delete account.** The Alchemy starter's Account page lets people delete their account and
  their to-dos.
- **v2214: Google sign-in for new apps.** Apps set up by GitHub Actions get Sign in with Google
  through `auth.samebase.com`. You don't need a Google project, and no Google key goes in your
  repository.
- **v2210: Convex-only new apps.** New App can set up an app with only GitHub and Convex. The app
  deploys from its own GitHub Actions with Alchemy, and Convex hosts the site.

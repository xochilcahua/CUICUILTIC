# Using GitHub and the hosted app

Your app is at **https://xochilcahua.github.io/CUICUILTIC/**. Open that address in a browser on your phone or computer. You can bookmark it or add it to your phone's home screen using the browser's share menu.

Your repository is at **https://github.com/xochilcahua/CUICUILTIC**. It contains the app's source files and their change history. GitHub Pages serves the app from those files for free with this public repository.

## What the terms mean

- **Git** tracks changes to files on your computer.
- A **repository**, or repo, holds those files and their history.
- A **commit** records a group of changes with a message explaining them.
- A **push** sends local commits to GitHub.
- A **deployment** publishes a version of the app at its browser address.

The local project, GitHub repository and hosted website are three copies with different purposes. Saving a file locally doesn't update GitHub or the website until you commit and push it.

## Update the app from VS Code

1. Open `/Users/bayesianbean/Downloads/CUICUILTIC` as the project folder.
2. Edit the files and save them. Open `index.html` in your browser to check your changes.
3. Open **Source Control** in VS Code's left sidebar. Select each changed file to review its differences.
4. Stage the files with the **+** button. Write a short commit message, such as “Add a new palette preset,” then click **Commit**.
5. Click **Sync Changes** or **Push** to send the commit to GitHub. If VS Code asks you to sign in to GitHub, follow its browser sign-in instructions.
6. Open the repository's **Actions** tab. The **Publish Cuicuiltic** workflow checks the app and publishes it. A green check means it finished; a red cross means it needs attention. Open a failed run to read its error.
7. Refresh the app link after publication. A deployment normally takes a few minutes; a browser may need a hard refresh to pick up changed files.

The workflow publishes only `index.html`, `css/`, `js/` and `LICENSE`. The documentation and tests remain in the repository. Under **Settings → Pages**, the publishing source is **GitHub Actions**.

## Presets on your phone

Browser storage belongs to each browser and website address. A preset saved in the local app won't appear automatically on the hosted app or your phone. Use **Save preset**, transfer the downloaded JSON file, and use **Load preset** in the other browser.

The repository and website are public. Saved presets and loaded images stay in your browser unless you choose to download or share them. Don't commit personal files, passwords or API keys. The `.gitignore` file excludes common local files and downloaded preset JSON files from normal staging.

## Backups and tests

An untouched copy of the original app is in `/Users/bayesianbean/Workspace/CUICUILTIC-original-2026-10-07`. Git history records the reviewed version and future commits.

To run the same browser checks locally with Python installed:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install playwright==1.63.0
python -m playwright install chromium
python tests/browser_check.py
```

The virtual environment and test output are excluded from Git. The live app itself doesn't need Python or Playwright.

Security and secret rotation
============================

If secrets (API keys, DB passwords) were committed, follow these steps immediately:

1) Rotate affected keys
   - OpenAI: Go to https://platform.openai.com/ and revoke/rotate the key.
   - Resend: Revoke the API key in Resend dashboard.
   - Any other service: Revoke and create new keys.

2) Remove the secret files from the repository (already done in this commit)
   - Ensure `.env` and `config/PK-GPT-API.json` are removed from the index and working tree is safe.

3) Purge secrets from git history (destructive):
   - Recommended: use `git filter-repo` (faster and maintained)
     - Install: `pip install git-filter-repo` or see https://github.com/newren/git-filter-repo
     - Example to remove a file from history:
       ```bash
       git filter-repo --path config/PK-GPT-API.json --invert-paths
       git filter-repo --path .env --invert-paths
       ```
     - After this, force-push to remote (warning: rewrites history):
       ```bash
       git push --force --all
       git push --force --tags
       ```

   - Alternative: BFG Repo Cleaner (https://rtyley.github.io/bfg-repo-cleaner/)

4) Post-purge steps:
   - Rotate keys again if you rotated them before purging (to be safe).
   - Inform collaborators to re-clone the repository after history rewrite.
   - Add secret scanning in CI (git-secrets, truffleHog) and enforce pre-commit hooks.

5) Prevent future leaks:
   - Keep real secrets in environment variables or a secrets manager.
   - Add `.env` and other secret files to `.gitignore` (already present).
   - Use a `.env.example` template with placeholders.

If you want, I can:
- Help run the `git filter-repo` commands locally and prepare a force-push plan (I will not force-push without your explicit approval).
- Add CI checks (git-secrets) and a pre-commit hook config.
